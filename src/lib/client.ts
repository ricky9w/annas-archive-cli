import { MirrorManager } from "./mirrors.ts";
import type { MirrorManagerOptions } from "./mirrors.ts";
import { parseSearchResults, parseBookDetails } from "./parser.ts";
import type { BookResult, BookDetails, SearchOptions } from "../types.ts";
import { NetworkError } from "../utils/errors.ts";
import { log } from "../utils/logger.ts";

export interface FastDownloadQuota {
  downloadsLeft: number;
  downloadsPerDay: number;
  recentlyDownloadedMd5s: string[];
}

export interface FastDownloadResult {
  url?: string;
  error?: string;
  /** Present on success, and sometimes absent on error (e.g. 429 "No downloads left"). */
  quota?: FastDownloadQuota;
  /** HTTP status from the API — lets callers distinguish 429 quota-exhaustion from other errors. */
  httpStatus?: number;
}

interface FastDownloadJson {
  download_url?: string | null;
  error?: string;
  account_fast_download_info?: {
    downloads_left?: number;
    downloads_per_day?: number;
    recently_downloaded_md5s?: string[];
  };
}

export class AnnaClient {
  private mirrors: MirrorManager;

  constructor(options?: MirrorManagerOptions) {
    this.mirrors = new MirrorManager(options);
  }

  /** Get the working domain (for display in messages). */
  getDomain(): string | null {
    return this.mirrors.getDomain();
  }

  /** Search for books. */
  async search(
    query: string,
    options: SearchOptions = {},
  ): Promise<BookResult[]> {
    const { format, limit = 10, sort = "year_desc", verify } = options;

    const params = new URLSearchParams({ q: query });
    if (format) params.set("ext", format);
    if (sort) params.set("sort", sort);

    log.debug("client", `search query="${query}" format=${format ?? "any"} sort=${sort} limit=${limit}`);

    const res = await this.mirrors.fetch(`/search?${params}`);
    if (!res.ok) {
      await res.body?.cancel();
      log.warn("client", `search failed: HTTP ${res.status}`);
      const hint =
        res.status === 403
          ? " (Forbidden — you may be rate-limited)"
          : res.status === 429
            ? " (Rate limited — try again later)"
            : "";
      throw new NetworkError(`Search failed: HTTP ${res.status}${hint}`, res.status);
    }

    const html = await res.text();
    const results = parseSearchResults(html, limit);
    log.debug("client", `search returned ${results.length} results (HTML ${html.length} bytes)`);

    if (verify) {
      const lower = verify.toLowerCase();
      for (const r of results) {
        if (r.title.toLowerCase().includes(lower)) {
          r.verified = true;
        }
      }
    }

    return results;
  }

  /** Get detailed information about a book. */
  async getDetails(md5: string): Promise<BookDetails | null> {
    log.debug("client", `fetching details for ${md5}`);
    const res = await this.mirrors.fetch(`/md5/${md5}`);
    if (!res.ok) {
      await res.body?.cancel();
      if (res.status === 404) {
        log.debug("client", `book not found: ${md5}`);
        return null;
      }
      throw new NetworkError(`Details fetch failed: HTTP ${res.status}`, res.status);
    }

    const html = await res.text();
    return parseBookDetails(html, md5);
  }

  /**
   * Get a fast download URL for a book.
   * Returns { url } on success, or { error } on failure.
   */
  async getFastDownloadUrl(
    md5: string,
    key: string,
    pathIndex = 0,
    domainIndex = 0,
  ): Promise<FastDownloadResult> {
    const params = new URLSearchParams({
      md5,
      key,
      path_index: String(pathIndex),
      domain_index: String(domainIndex),
    });

    log.debug("client", `requesting fast download URL for ${md5}`);
    const res = await this.mirrors.fetch(
      `/dyn/api/fast_download.json?${params}`,
    );

    // API returns JSON body with error details even on 4xx responses
    const text = await res.text();

    let data: FastDownloadJson;
    try {
      data = JSON.parse(text);
    } catch {
      log.warn("client", `unexpected response from fast_download API: HTTP ${res.status}, body length ${text.length}`);
      return { error: `Unexpected response (HTTP ${res.status})`, httpStatus: res.status };
    }

    const info = data.account_fast_download_info;
    const quota: FastDownloadQuota | undefined = info
      ? {
          downloadsLeft: info.downloads_left ?? 0,
          downloadsPerDay: info.downloads_per_day ?? 0,
          recentlyDownloadedMd5s: info.recently_downloaded_md5s ?? [],
        }
      : undefined;

    if (quota) {
      log.info(
        "client",
        `quota: ${quota.downloadsLeft}/${quota.downloadsPerDay} downloads remaining ` +
          `(${quota.recentlyDownloadedMd5s.length} used in last 18h)`,
      );
    }

    if (data.error) {
      log.warn("client", `fast download API error: ${data.error} (HTTP ${res.status})`);
      return { error: data.error, quota, httpStatus: res.status };
    }
    if (!data.download_url) {
      return { error: "No download URL in response", quota, httpStatus: res.status };
    }

    return { url: data.download_url, quota, httpStatus: res.status };
  }
}
