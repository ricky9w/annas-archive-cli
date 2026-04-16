import pc from "picocolors";
import type { BookResult, BookDetails } from "../types.ts";
import type { FastDownloadQuota } from "../lib/client.ts";

export function formatBookResult(result: BookResult, index: number): string {
  const verified = result.verified ? pc.green(" [VERIFIED]") : "";
  const title = pc.bold(pc.cyan(result.title)) + verified;
  const author = result.author || pc.dim("Unknown");
  const year = result.year || pc.dim("Unknown");
  const format = result.format
    ? pc.yellow(result.format.toUpperCase())
    : pc.dim("Unknown");

  return [
    `  ${pc.bold(pc.white(`${index}.`))} ${title}`,
    `     ${pc.dim("Author:")} ${author}`,
    `     ${pc.dim("Year:")} ${year}  ${pc.dim("Format:")} ${format}`,
    `     ${pc.dim("MD5:")} ${pc.dim(result.md5)}`,
  ].join("\n");
}

export function formatBookList(results: BookResult[]): string {
  if (results.length === 0) {
    return pc.yellow("No results found.");
  }
  return results.map((r, i) => formatBookResult(r, i + 1)).join("\n\n");
}

export function formatBookDetails(details: BookDetails): string {
  const fast = details.downloadOptions.fast.length;
  const slow = details.downloadOptions.slow.length;

  return [
    "",
    `  ${pc.dim("Title:")}  ${pc.bold(pc.cyan(details.title))}`,
    `  ${pc.dim("Author:")} ${details.author || pc.dim("Unknown")}`,
    `  ${pc.dim("MD5:")}    ${pc.dim(details.md5)}`,
    "",
    `  ${pc.dim("Downloads:")} ${pc.green(`${fast} fast`)}, ${pc.yellow(`${slow} slow`)}`,
  ].join("\n");
}

export function printMembershipMessage(
  reason: string,
  md5?: string,
  domain?: string,
): void {
  const baseUrl = domain
    ? `https://${domain}`
    : "https://annas-archive.gl";

  const lines: string[] = [
    "",
    pc.yellow(`  ${reason}`),
    "",
  ];

  if (md5) {
    lines.push(
      pc.dim("  You can still download manually in your browser:"),
      `  ${pc.underline(`${baseUrl}/md5/${md5}`)}`,
      pc.dim("  (Free slow downloads require a captcha)"),
      "",
    );
  }

  lines.push(
    pc.dim("  Anna's Archive is a non-profit, open-source project."),
    pc.dim("  A membership unlocks fast downloads and starts at just $2:"),
    `  ${pc.underline("https://annas-archive.gl/donate?r=7XfHurr")}`,
    "",
    pc.dim("  After donating, set your key:"),
    `  ${pc.cyan("annas config set key <your-key>")}`,
    pc.dim("  Or set the environment variable:"),
    `  ${pc.cyan('export ANNAS_ARCHIVE_KEY="your-key"')}`,
    "",
  );

  console.error(lines.join("\n"));
}

export function printQuotaInfo(quota: FastDownloadQuota): void {
  const left = quota.downloadsLeft;
  const total = quota.downloadsPerDay;
  const numColor = left === 0 ? pc.red : left <= 2 ? pc.yellow : pc.green;
  console.error(
    pc.dim(`  Fast downloads: ${numColor(String(left))}${pc.dim(`/${total}`)}${pc.dim(" remaining (rolling 18h window)")}`),
  );
}

export function printQuotaExhausted(
  quota: FastDownloadQuota | undefined,
  md5: string | undefined,
  domain: string | undefined,
): void {
  const baseUrl = domain ? `https://${domain}` : "https://annas-archive.gl";
  const lines: string[] = [
    "",
    pc.yellow("  Fast download quota exhausted"),
    "",
  ];

  if (quota) {
    lines.push(
      pc.dim(
        `  You've used ${quota.downloadsPerDay - quota.downloadsLeft} of ${quota.downloadsPerDay} fast downloads in the last 18 hours.`,
      ),
    );
  } else {
    lines.push(
      pc.dim("  You've used all of your fast downloads in the last 18 hours."),
    );
  }

  lines.push(
    "",
    pc.dim("  Anna's Archive uses a rolling 18-hour window — each slot frees up"),
    pc.dim("  18 hours after the download that consumed it."),
    "",
  );

  if (md5) {
    lines.push(
      pc.dim("  You can still download slowly via the browser (free, captcha-gated):"),
      `  ${pc.underline(`${baseUrl}/md5/${md5}`)}`,
      "",
    );
  }

  lines.push(
    pc.dim("  View your exact quota and history at:"),
    `  ${pc.underline(`${baseUrl}/account`)}`,
    "",
  );

  console.error(lines.join("\n"));
}

export function printError(msg: string): void {
  console.error(pc.red(`error: ${msg}`));
}

export function printSuccess(msg: string): void {
  console.log(pc.green(msg));
}

export function printDim(msg: string): void {
  console.error(pc.dim(msg));
}
