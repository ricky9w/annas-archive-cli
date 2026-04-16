import { defineCommand } from "citty";
import { createSpinner } from "nanospinner";
import { AnnaClient } from "../lib/client.ts";
import { downloadBook, formatBytes } from "../lib/downloader.ts";
import { getApiKey, loadConfig } from "../utils/config.ts";
import {
  printError,
  printSuccess,
  printMembershipMessage,
  printQuotaExhausted,
  printQuotaInfo,
} from "../utils/display.ts";
import {
  isValidMd5,
  normalizeMd5,
  isMembershipError,
  isQuotaExhaustedError,
} from "../utils/validation.ts";
import type { FastDownloadQuota } from "../lib/client.ts";

export default defineCommand({
  meta: {
    name: "download",
    description: "Download a book",
  },
  args: {
    md5: {
      type: "positional",
      description: "Book MD5 hash",
      required: true,
    },
    output: {
      type: "string",
      description: "Output directory (default: current directory)",
      alias: ["o"],
    },
    name: {
      type: "string",
      description: "Custom output filename",
      alias: ["n"],
    },
  },
  async run({ args }) {
    if (!isValidMd5(args.md5)) {
      printError("Invalid MD5 hash. Expected 32 hex characters.");
      process.exit(1);
    }
    const md5 = normalizeMd5(args.md5);

    // Resolve API key early — no need to contact mirrors if key is missing
    const apiKey = await getApiKey();
    if (!apiKey) {
      printMembershipMessage("API key not set", md5);
      process.exit(1);
    }

    // Get download URL
    const spinner = createSpinner("Getting download link...").start();
    const client = new AnnaClient({
      onStatus: (msg) => spinner.update({ text: msg }),
    });

    let url: string;
    let quota: FastDownloadQuota | undefined;
    try {
      const result = await client.getFastDownloadUrl(md5, apiKey);
      quota = result.quota;
      if (result.error || !result.url) {
        spinner.error({ text: "Failed" });
        const error = result.error;
        if (isQuotaExhaustedError(error, result.httpStatus)) {
          printQuotaExhausted(result.quota, md5, client.getDomain() ?? undefined);
        } else if (error && isMembershipError(error)) {
          printMembershipMessage(
            error,
            md5,
            client.getDomain() ?? undefined,
          );
        } else {
          printError(error || "Failed to get download URL");
        }
        process.exit(1);
      }
      url = result.url;
    } catch (e) {
      spinner.error({ text: e instanceof Error ? e.message : String(e) });
      process.exit(1);
    }

    spinner.success({ text: "Got download link" });

    // Determine output directory
    const config = await loadConfig();
    const outputDir = args.output || config.output || ".";

    // Download with progress
    const dlSpinner = createSpinner("Downloading...").start();

    try {
      const path = await downloadBook({
        url,
        outputDir,
        filename: args.name,
        md5,
        onProgress: (p) => {
          const pct = p.percent ? `${p.percent}%` : "";
          const size = formatBytes(p.downloaded);
          const total = p.total ? ` / ${formatBytes(p.total)}` : "";
          dlSpinner.update({ text: `Downloading... ${pct} (${size}${total})` });
        },
      });

      dlSpinner.success({ text: "Download complete" });
      printSuccess(`Saved to: ${path}`);
      if (quota) printQuotaInfo(quota);
    } catch (e) {
      dlSpinner.error({ text: "Download failed" });
      printError(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  },
});
