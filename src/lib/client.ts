import { MirrorManager } from "./mirrors.ts";
import { parseSearchResults, parseBookDetails } from "./parser.ts";
import type {
  BookResult,
  BookDetails,
  SearchOptions,
} from "../types.ts";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface FastDownloadResponse {
  download_url?: string;
  error?: string;
}

export class AnnaClient {
  private mirrors: MirrorManager;

  constructor(mirrors?: MirrorManager) {
    this.mirrors = mirrors ?? new MirrorManager();
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

    const baseUrl = await this.mirrors.getBaseUrl();
    const html = await this.fetchText(`${baseUrl}/search?${params}`);
    if (!html) return [];

    const results = parseSearchResults(html, limit);

    // Verify title match if requested
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
    const baseUrl = await this.mirrors.getBaseUrl();
    const html = await this.fetchText(`${baseUrl}/md5/${md5}`);
    if (!html) return null;
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

    const baseUrl = await this.mirrors.getBaseUrl();
    const text = await this.fetchText(
      `${baseUrl}/dyn/api/fast_download.json?${params}`,
    );
    if (!text) return { error: "Failed to reach download API" };

    let data: FastDownloadResponse;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: "Invalid response from download API" };
    }

    if (data.error) return { error: data.error };
    if (!data.download_url) return { error: "No download URL in response" };

    return { url: data.download_url };
  }

  private async fetchText(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(30000),
        redirect: "follow",
      });

      // Read body even on error (API returns JSON errors on 403)
      const text = await res.text();
      if (!res.ok && !text.trim().startsWith("{")) {
        console.error(`HTTP ${res.status}: ${res.statusText}`);
        return null;
      }

      return text;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Network error: ${msg}`);
      return null;
    }
  }
}
