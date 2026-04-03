import { defineCommand } from "citty";
import { createSpinner } from "nanospinner";
import { AnnaClient } from "../lib/client.ts";
import { formatBookList } from "../utils/display.ts";
import { loadConfig, getApiKey } from "../utils/config.ts";
import { downloadBook, formatBytes } from "../lib/downloader.ts";
import {
  printError,
  printSuccess,
  printMembershipMessage,
} from "../utils/display.ts";
import { isMembershipError } from "../utils/validation.ts";

export default defineCommand({
  meta: {
    name: "search",
    description: "Search for books",
  },
  args: {
    query: {
      type: "positional",
      description: "Search query (title, author, or both)",
      required: true,
    },
    format: {
      type: "string",
      description: "Filter by format (pdf, epub, mobi, azw3, djvu)",
      alias: ["f"],
    },
    limit: {
      type: "string",
      description: "Maximum results (default: 10)",
      alias: ["l"],
    },
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
    interactive: {
      type: "boolean",
      description: "Interactive mode: pick and download",
      alias: ["i"],
      default: false,
    },
    verify: {
      type: "string",
      description: "Verify title contains this string",
      alias: ["V"],
    },
  },
  async run({ args }) {
    let limit = 10;
    if (args.limit) {
      limit = parseInt(args.limit, 10);
      if (Number.isNaN(limit) || limit < 1) {
        printError(`Invalid limit "${args.limit}". Must be a positive integer.`);
        process.exit(1);
      }
    }

    const spinner = createSpinner("Searching...").start();
    const client = new AnnaClient({
      onStatus: (msg) => spinner.update({ text: msg }),
    });

    let results;
    try {
      results = await client.search(args.query, {
        format: args.format,
        limit,
        verify: args.verify,
      });
    } catch (e) {
      spinner.error({ text: e instanceof Error ? e.message : String(e) });
      process.exit(1);
    }

    spinner.stop();
    if (process.stderr.isTTY) {
      process.stderr.write("\r\x1b[K");
    }

    if (args.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      printError("No results found.");
      return;
    }

    console.log(formatBookList(results));

    if (!args.interactive) return;

    // Dynamic import — only load when interactive mode is used
    const { select, confirm, isCancel, spinner: clackSpinner } = await import(
      "@clack/prompts"
    );

    console.log();
    const selection = await select({
      message: "Select a book to download",
      options: results.map((r, i) => ({
        value: i,
        label: `${r.title}`,
        hint: [r.author, r.year, r.format?.toUpperCase()]
          .filter(Boolean)
          .join(" | "),
      })),
    });

    if (isCancel(selection)) {
      console.log("Cancelled.");
      return;
    }

    const selected = results[selection as number];

    const shouldDownload = await confirm({
      message: `Download "${selected.title}"?`,
    });

    if (isCancel(shouldDownload) || !shouldDownload) {
      console.log("Cancelled.");
      return;
    }

    // Resolve API key
    const apiKey = await getApiKey();
    if (!apiKey) {
      printMembershipMessage(
        "API key not set",
        selected.md5,
        client.getDomain() ?? undefined,
      );
      return;
    }

    // Get download URL
    const s = clackSpinner();
    s.start("Getting download link...");

    let url: string | undefined;
    let error: string | undefined;
    try {
      const result = await client.getFastDownloadUrl(selected.md5, apiKey);
      url = result.url;
      error = result.error;
    } catch (e) {
      s.stop("Failed");
      printError(e instanceof Error ? e.message : String(e));
      return;
    }

    if (error || !url) {
      s.stop("Failed");
      if (error && isMembershipError(error)) {
        printMembershipMessage(
          error,
          selected.md5,
          client.getDomain() ?? undefined,
        );
      } else {
        printError(error || "Failed to get download URL");
      }
      return;
    }

    s.stop("Got download link");

    // Download with progress
    const config = await loadConfig();
    const outputDir = config.output || ".";

    const dlSpinner = createSpinner("Downloading...").start();

    try {
      const path = await downloadBook({
        url,
        outputDir,
        md5: selected.md5,
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
    }
  },
});
