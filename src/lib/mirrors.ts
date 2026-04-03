import { printDim } from "../utils/display.ts";

const KNOWN_MIRRORS = [
  "annas-archive.gl",
  "annas-archive.li",
  "annas-archive.in",
  "annas-archive.pm",
];

const DISCOVERY_URL = "https://open-slum.pages.dev/";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export class MirrorManager {
  private workingDomain: string | null = null;

  /** Get a working base URL, trying mirrors in order. */
  async getBaseUrl(): Promise<string> {
    if (this.workingDomain) {
      return `https://${this.workingDomain}`;
    }

    // Try known mirrors
    for (const domain of KNOWN_MIRRORS) {
      if (await this.probe(domain)) {
        this.workingDomain = domain;
        printDim(`Using mirror: ${domain}`);
        return `https://${domain}`;
      }
    }

    // All known mirrors failed — discover new ones
    printDim("Known mirrors unreachable, discovering new mirrors...");
    for (const domain of await this.discoverMirrors()) {
      if (await this.probe(domain)) {
        this.workingDomain = domain;
        printDim(`Discovered new mirror: ${domain}`);
        return `https://${domain}`;
      }
    }

    // Fallback to first known mirror
    printDim("Warning: Could not connect to any mirror");
    return `https://${KNOWN_MIRRORS[0]}`;
  }

  /** Get the cached working domain, if any. */
  getDomain(): string | null {
    return this.workingDomain;
  }

  private async probe(domain: string): Promise<boolean> {
    try {
      const res = await fetch(`https://${domain}/`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async discoverMirrors(): Promise<string[]> {
    try {
      const res = await fetch(DISCOVERY_URL, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();

      const found = html.matchAll(/annas_archive_(\w+)/g);
      const seen = new Set(KNOWN_MIRRORS);
      const domains: string[] = [];

      for (const [, tld] of found) {
        if (tld === "software") continue;
        const domain = `annas-archive.${tld}`;
        if (!seen.has(domain)) {
          seen.add(domain);
          domains.push(domain);
        }
      }

      return domains;
    } catch {
      return [];
    }
  }
}
