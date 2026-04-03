const KNOWN_MIRRORS = [
  "annas-archive.gl",
  "annas-archive.li",
  "annas-archive.in",
  "annas-archive.pm",
];

const DISCOVERY_URL = "https://open-slum.pages.dev/";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface MirrorManagerOptions {
  /** Called with a status message when trying mirrors or discovering new ones. */
  onStatus?: (msg: string) => void;
}

export class MirrorManager {
  private workingDomain: string | null = null;
  private onStatus?: (msg: string) => void;

  constructor(options?: MirrorManagerOptions) {
    this.onStatus = options?.onStatus;
  }

  /** Get the cached working domain, if any. */
  getDomain(): string | null {
    return this.workingDomain;
  }

  /**
   * Fetch a path across mirrors, returning the first successful Response.
   * The actual request IS the mirror probe — no separate connectivity check.
   * Retries on network errors and 5xx; returns 4xx responses to caller.
   */
  async fetch(path: string, init?: RequestInit): Promise<Response> {
    // If we have a cached working domain, try it first
    if (this.workingDomain) {
      const res = await this.tryFetch(this.workingDomain, path, init);
      if (res) return res;
      // Cached domain failed — reset and try all
      this.workingDomain = null;
    }

    // Try known mirrors
    for (const domain of KNOWN_MIRRORS) {
      this.onStatus?.(`Trying ${domain}...`);
      const res = await this.tryFetch(domain, path, init);
      if (res) {
        this.workingDomain = domain;
        return res;
      }
    }

    // All known mirrors failed — discover new ones
    this.onStatus?.("Discovering new mirrors...");
    for (const domain of await this.discoverMirrors()) {
      this.onStatus?.(`Trying ${domain}...`);
      const res = await this.tryFetch(domain, path, init);
      if (res) {
        this.workingDomain = domain;
        return res;
      }
    }

    throw new Error("Could not connect to any mirror");
  }

  private async tryFetch(
    domain: string,
    path: string,
    init?: RequestInit,
  ): Promise<Response | null> {
    try {
      const url = `https://${domain}${path}`;
      const res = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": USER_AGENT,
          ...(init?.headers as Record<string, string>),
        },
        signal: AbortSignal.timeout(30000),
        redirect: "follow",
      });

      // 5xx = mirror issue, try next
      if (res.status >= 500) return null;

      // 2xx/3xx/4xx = mirror is working (caller handles the response)
      return res;
    } catch {
      return null;
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
