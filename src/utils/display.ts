import pc from "picocolors";
import type { BookResult, BookDetails } from "../types.ts";

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

export function printError(msg: string): void {
  console.error(pc.red(`error: ${msg}`));
}

export function printSuccess(msg: string): void {
  console.log(pc.green(msg));
}

export function printDim(msg: string): void {
  console.error(pc.dim(msg));
}
