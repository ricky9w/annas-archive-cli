import { MirrorManager } from "./mirrors.ts";
import type { MirrorManagerOptions } from "./mirrors.ts";
import { parseSearchResults, parseBookDetails } from "./parser.ts";
import type { BookResult, BookDetails, SearchOptions } from "../types.ts";
import { NetworkError } from "../utils/errors.ts";

interface FastDownloadResponse {
  download_url?: string;
  error?: string;
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

    const res = await this.mirrors.fetch(`/search?${params}`);
    if (!res.ok) {
      await res.body?.cancel();
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
    const res = await this.mirrors.fetch(`/md5/${md5}`);
    if (!res.ok) {
      await res.body?.cancel();
      if (res.status === 404) return null;
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
  ): Promise<{ url?: string; error?: string }> {
    const params = new URLSearchParams({
      md5,
      key,
      path_index: String(pathIndex),
      domain_index: String(domainIndex),
    });

    const res = await this.mirrors.fetch(
      `/dyn/api/fast_download.json?${params}`,
    );

    // API returns JSON body even on 403
    const text = await res.text();

    let data: FastDownloadResponse;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: `Unexpected response (HTTP ${res.status})` };
    }

    if (data.error) return { error: data.error };
    if (!data.download_url) return { error: "No download URL in response" };

    return { url: data.download_url };
  }
}
