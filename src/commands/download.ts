import { defineCommand } from "citty";
import { createSpinner } from "nanospinner";
import { AnnaClient } from "../lib/client.ts";
import { downloadBook, formatBytes } from "../lib/downloader.ts";
import { getApiKey, loadConfig } from "../utils/config.ts";
import {
  printError,
  printSuccess,
  printMembershipMessage,
} from "../utils/display.ts";

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
    if (!/^[a-f0-9]{32}$/.test(args.md5)) {
      printError("Invalid MD5 hash. Expected 32 hex characters.");
      process.exit(1);
    }

    const client = new AnnaClient();

    // Resolve API key
    const apiKey = await getApiKey();
    if (!apiKey) {
      printMembershipMessage(
        "API key not set",
        args.md5,
        client.getDomain() ?? undefined,
      );
      process.exit(1);
    }

    // Get download URL
    const spinner = createSpinner("Getting download link...").start();

    const { url, error } = await client.getFastDownloadUrl(args.md5, apiKey);

    if (error || !url) {
      spinner.error({ text: "Failed" });
      if (
        error &&
        (error.toLowerCase().includes("not a member") ||
          error.toLowerCase().includes("invalid") ||
          error.toLowerCase().includes("expired"))
      ) {
        printMembershipMessage(
          error,
          args.md5,
          client.getDomain() ?? undefined,
        );
      } else {
        printError(error || "Failed to get download URL");
      }
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
        md5: args.md5,
        onProgress: (p) => {
          const pct = p.percent ? `${p.percent}%` : "";
          const size = formatBytes(p.downloaded);
          const total = p.total ? ` / ${formatBytes(p.total)}` : "";
          dlSpinner.update({ text: `Downloading... ${pct} (${size}${total})` });
        },
      });

      dlSpinner.success({ text: "Download complete" });
      printSuccess(`Saved to: ${path}`);
    } catch (e) {
      dlSpinner.error({ text: "Download failed" });
      printError(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  },
});
