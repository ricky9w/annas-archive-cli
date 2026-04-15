import { log } from "../utils/logger.ts";

const KNOWN_MIRRORS = [
  "annas-archive.gl",
  "annas-archive.li",
  "annas-archive.in",
  "annas-archive.pm",
];

const DISCOVERY_URL = "https://open-slum.pages.dev/";

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
      log.debug("mirror", `using cached domain: ${this.workingDomain}`);
      this.onStatus?.(`Connecting to ${this.workingDomain}...`);
      const res = await this.tryFetch(this.workingDomain, path, init);
      if (res) return res;
      // Cached domain failed — reset and try all
      log.info("mirror", `cached domain ${this.workingDomain} failed, trying all mirrors`);
      this.workingDomain = null;
    }

    // Race all known mirrors concurrently — fastest response wins
    log.debug("mirror", `racing ${KNOWN_MIRRORS.length} known mirrors: ${KNOWN_MIRRORS.join(", ")}`);
    this.onStatus?.(`Probing ${KNOWN_MIRRORS.length} mirrors...`);
    const knownResult = await this.raceMirrors(KNOWN_MIRRORS, path, init);
    if (knownResult) {
      this.workingDomain = knownResult.domain;
      log.info("mirror", `connected to ${knownResult.domain}`);
      this.onStatus?.(`Connected to ${knownResult.domain}`);
      return knownResult.response;
    }

    // All known mirrors failed — discover and race new ones
    log.info("mirror", "all known mirrors failed, discovering new ones");
    this.onStatus?.("Discovering new mirrors...");
    const discovered = await this.discoverMirrors();
    if (discovered.length > 0) {
      this.onStatus?.(`Probing ${discovered.length} discovered mirrors...`);
      const discoveredResult = await this.raceMirrors(discovered, path, init);
      if (discoveredResult) {
        this.workingDomain = discoveredResult.domain;
        log.info("mirror", `connected to ${discoveredResult.domain}`);
        this.onStatus?.(`Connected to ${discoveredResult.domain}`);
        return discoveredResult.response;
      }
    }

    log.error("mirror", "could not connect to any mirror");
    throw new Error("Could not connect to any mirror");
  }

  private async raceMirrors(
    domains: string[],
    path: string,
    init?: RequestInit,
  ): Promise<{ domain: string; response: Response } | null> {
    if (domains.length === 0) return null;

    try {
      return await Promise.any(
        domains.map(async (domain) => {
          const res = await this.tryFetch(domain, path, init);
          if (!res) throw new Error(`${domain} failed`);
          return { domain, response: res };
        }),
      );
    } catch {
      // All mirrors failed (AggregateError)
      return null;
    }
  }

  private async tryFetch(
    domain: string,
    path: string,
    init?: RequestInit,
  ): Promise<Response | null> {
    try {
      const url = `https://${domain}${path}`;
      log.debug("mirror", `GET ${url}`);
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
      if (res.status >= 500) {
        log.warn("mirror", `${domain}: HTTP ${res.status}, skipping`);
        await res.body?.cancel();
        return null;
      }

      // Reject parked/redirect pages that return HTTP 200 but aren't real mirrors.
      // These serve a tiny JS redirect page instead of actual content.
      // Skip the check only when content-length confirms a large (real) response.
      const contentLength = parseInt(
        res.headers.get("content-length") || "0",
        10,
      );
      if (contentLength < 10_000) {
        const clone = res.clone();
        const text = await clone.text();
        if (/<title>\s*Redirecting/i.test(text)) {
          log.warn("mirror", `${domain}: parked/redirect page detected, skipping`);
          await res.body?.cancel();
          return null;
        }
      }

      // 2xx/3xx/4xx = mirror is working (caller handles the response)
      return res;
    } catch (e) {
      log.debug("mirror", `${domain}: ${e instanceof Error ? e.message : String(e)}`);
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

      log.debug("mirror", `discovered ${domains.length} new mirrors${domains.length > 0 ? `: ${domains.join(", ")}` : ""}`);
      return domains;
    } catch (e) {
      log.warn("mirror", `mirror discovery failed: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }
}
