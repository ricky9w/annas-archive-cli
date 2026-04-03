import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { sanitizeFilename } from "../utils/sanitize.ts";

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

/**
 * Download a file with streaming progress and retry logic.
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

  mkdirSync(outputDir, { recursive: true });

  // Determine filename
  let filename = options.filename;
  if (!filename) {
    const urlFilename = url.split("/").pop()?.split("?")[0] || "";
    filename = sanitizeFilename(urlFilename, md5);
  }

  const outputPath = resolve(join(outputDir, filename));

  // Verify output stays within target directory (path traversal defense)
  const resolvedDir = resolve(outputDir);
  if (!outputPath.startsWith(resolvedDir)) {
    throw new Error("Invalid filename: path traversal detected");
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await streamDownload(url, outputPath, onProgress);
      return outputPath;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error("Download failed");
}

async function streamDownload(
  url: string,
  outputPath: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(300000), // 5 min timeout for large files
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }

  const totalStr = res.headers.get("content-length");
  const total = totalStr ? parseInt(totalStr, 10) : null;

  if (!res.body) {
    throw new Error("No response body");
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let downloaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    downloaded += value.length;

    if (onProgress) {
      onProgress({
        downloaded,
        total,
        percent: total ? Math.round((downloaded / total) * 100) : null,
      });
    }
  }

  // Concatenate chunks and write
  const buffer = new Uint8Array(downloaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  await Bun.write(outputPath, buffer);
}

/** Format bytes as human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
