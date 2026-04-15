import { mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { sanitizeFilename } from "../utils/sanitize.ts";
import { USER_AGENT } from "./mirrors.ts";
import { DownloadError, StallError } from "../utils/errors.ts";
import { log } from "../utils/logger.ts";

interface DownloadProgress {
  downloaded: number;
  total: number | null;
  percent: number | null;
}

type ProgressCallback = (progress: DownloadProgress) => void;

interface DownloadOptions {
  url: string;
  outputDir: string;
  filename?: string;
  md5: string;
  onProgress?: ProgressCallback;
  maxRetries?: number;
}

interface StreamResult {
  bytesWritten: number;
  md5Hash: string | null;
}

/**
 * Download a file with streaming progress, resume support, and retry logic.
 * Returns the path to the downloaded file.
 */
export async function downloadBook(
  options: DownloadOptions,
): Promise<string> {
  const {
    url,
    outputDir,
    md5,
    onProgress,
    maxRetries = 3,
  } = options;

  await mkdir(outputDir, { recursive: true });

  // Determine filename — always sanitize, even user-provided names
  const raw = options.filename || url.split("/").pop()?.split("?")[0] || "";
  const filename = sanitizeFilename(raw, md5);

  const outputPath = resolve(join(outputDir, filename));

  // Verify output stays within target directory (path traversal defense)
  const resolvedDir = resolve(outputDir);
  if (!outputPath.startsWith(resolvedDir + sep) && outputPath !== resolvedDir) {
    throw new Error("Invalid filename: path traversal detected");
  }

  log.debug("download", `downloading ${filename} to ${outputDir}`);

  let lastError: Error | null = null;
  let bytesOnDisk = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await streamDownload(
        url,
        outputPath,
        onProgress,
        bytesOnDisk,
      );

      // Verify MD5 integrity (skip for resumed downloads — hash covers only new bytes)
      if (result.md5Hash && bytesOnDisk === 0) {
        if (result.md5Hash !== md5.toLowerCase()) {
          throw new DownloadError(
            `Integrity check failed: expected MD5 ${md5}, got ${result.md5Hash}`,
            true,
          );
        }
      }

      return outputPath;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));

      // Check how much was written to disk for resume
      try {
        const fileStat = await stat(outputPath);
        bytesOnDisk = fileStat.size;
      } catch {
        // ignore stat errors (file may not exist yet)
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        log.warn("download", `attempt ${attempt}/${maxRetries} failed: ${lastError.message}, retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error("Download failed");
}

const STALL_TIMEOUT_MS = 30_000;

async function streamDownload(
  url: string,
  outputPath: string,
  onProgress?: ProgressCallback,
  resumeFrom = 0,
): Promise<StreamResult> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
  };

  if (resumeFrom > 0) {
    log.debug("download", `resuming from byte ${resumeFrom}`);
    headers["Range"] = `bytes=${resumeFrom}-`;
  }

  // Stall detection: abort if no data received for STALL_TIMEOUT_MS
  const controller = new AbortController();
  let stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);

  const resetStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
  };

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers,
    });
  } catch (e) {
    clearTimeout(stallTimer);
    if (controller.signal.aborted) {
      throw new StallError(STALL_TIMEOUT_MS / 1000);
    }
    throw e;
  }

  // Range not satisfiable — file already complete
  if (resumeFrom > 0 && res.status === 416) {
    log.debug("download", `file already complete (${resumeFrom} bytes)`);
    clearTimeout(stallTimer);
    await res.body?.cancel();
    return { bytesWritten: resumeFrom, md5Hash: null };
  }

  // Server ignored Range header — restart from beginning
  if (resumeFrom > 0 && res.status === 200) {
    log.warn("download", "server ignored Range header, restarting");
    resumeFrom = 0;
  }

  if (!res.ok && res.status !== 206) {
    clearTimeout(stallTimer);
    await res.body?.cancel();
    throw new DownloadError(
      `Download failed: HTTP ${res.status}`,
      res.status >= 500,
    );
  }

  const totalStr = res.headers.get("content-length");
  const contentLength = totalStr ? parseInt(totalStr, 10) : null;
  const total =
    contentLength !== null && !Number.isNaN(contentLength)
      ? contentLength + resumeFrom
      : null;

  if (!res.body) {
    clearTimeout(stallTimer);
    throw new DownloadError("No response body", true);
  }

  // Stream directly to disk — memory usage stays O(chunk_size)
  const writeStream = createWriteStream(outputPath, {
    flags: resumeFrom > 0 ? "a" : "w",
  });
  const reader = res.body.getReader();
  const hasher = createHash("md5");
  let downloaded = resumeFrom;
  const canHash = resumeFrom === 0; // Only hash non-resumed downloads

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      resetStallTimer();
      writeStream.write(value);
      if (canHash) hasher.update(value);
      downloaded += value.length;

      if (onProgress) {
        onProgress({
          downloaded,
          total,
          percent: total ? Math.round((downloaded / total) * 100) : null,
        });
      }
    }
    writeStream.end();
    await finished(writeStream);
  } catch (e) {
    // Flush partial file so it can be resumed
    try {
      writeStream.end();
      await finished(writeStream);
    } catch {
      // ignore close errors
    }
    clearTimeout(stallTimer);
    if (controller.signal.aborted) {
      log.warn("download", `download stalled (no data for ${STALL_TIMEOUT_MS / 1000}s)`);
      throw new StallError(STALL_TIMEOUT_MS / 1000);
    }
    throw e;
  } finally {
    clearTimeout(stallTimer);
  }

  return {
    bytesWritten: downloaded,
    md5Hash: canHash ? hasher.digest("hex") : null,
  };
}

/** Format bytes as human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
