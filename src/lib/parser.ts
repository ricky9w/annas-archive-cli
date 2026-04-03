import { parse } from "node-html-parser";
import type { BookResult, BookDetails, DownloadOption } from "../types.ts";

/**
 * Parse search results HTML into structured BookResult array.
 * Uses DOM queries instead of fragile regex patterns.
 */
export function parseSearchResults(html: string, limit = 10): BookResult[] {
  const root = parse(html);
  const results: BookResult[] = [];

  // Find all unique MD5 links
  const md5Set = new Set<string>();
  const links = root.querySelectorAll('a[href*="/md5/"]');

  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const match = href.match(/\/md5\/([a-f0-9]{32})/);
    if (match) md5Set.add(match[1]);
  }

  const md5s = [...md5Set].slice(0, limit);

  for (const md5 of md5s) {
    // Find the link element for this MD5
    const link = root.querySelector(`a[href="/md5/${md5}"]`);
    if (!link) continue;

    // Walk up to the result container
    const container = findResultContainer(link);
    if (!container) continue;

    // Extract title from the main link text
    const titleEl = container.querySelector("a.js-vim-focus");
    const title = titleEl?.text?.trim();
    if (!title) continue;

    // Extract author (icon: mdi--user-edit)
    const authorEl = container.querySelector(
      'a span[class*="mdi--user-edit"]',
    );
    const author = authorEl?.parentNode?.text?.trim() || null;

    // Extract publisher/year info (icon: mdi--company)
    const publisherEl = container.querySelector(
      'a span[class*="mdi--company"]',
    );
    const publisherText = publisherEl?.parentNode?.text?.trim() || null;

    // Extract year from publisher string
    let year: string | null = null;
    if (publisherText) {
      const yearMatch = publisherText.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) year = yearMatch[0];
    }

    // Extract filepath for format info
    const filepathEl = container.querySelector(
      'div[class*="text-gray-500"][class*="font-mono"]',
    );
    const filepath = filepathEl?.text?.trim() || null;

    // Extract extension from filepath
    let format: string | null = null;
    if (filepath) {
      const extMatch = filepath.match(/\.(\w+)$/);
      if (extMatch) format = extMatch[1].toLowerCase();
    }

    results.push({
      md5,
      title,
      author,
      year,
      publisher: publisherText,
      format,
      filepath,
    });
  }

  return results;
}

/**
 * Parse book details page HTML.
 */
export function parseBookDetails(
  html: string,
  md5: string,
): BookDetails | null {
  const root = parse(html);

  // Extract title and author from data-content attributes
  let title = "";
  let author: string | null = null;

  const dataContentEls = root.querySelectorAll("[data-content]");
  if (dataContentEls.length >= 2) {
    title = dataContentEls[0].getAttribute("data-content") || "";
    author = dataContentEls[1].getAttribute("data-content") || null;
  }

  // Fallback: extract from page title
  if (!title) {
    const titleEl = root.querySelector("title");
    if (titleEl) {
      title = titleEl.text.replace(/\s*-\s*Anna's Archive\s*$/, "").trim();
    }
  }

  if (!title) return null;

  // Extract download options
  const fast: DownloadOption[] = [];
  const slow: DownloadOption[] = [];

  const fastLinks = root.querySelectorAll('a[href*="/fast_download/"]');
  for (const link of fastLinks.slice(0, 4)) {
    const href = link.getAttribute("href") || "";
    const match = href.match(/\/fast_download\/([^/]+)\/(\d+)\/(\d+)/);
    if (match) {
      fast.push({ md5: match[1], pathIndex: match[2], domainIndex: match[3] });
    }
  }

  const slowLinks = root.querySelectorAll('a[href*="/slow_download/"]');
  for (const link of slowLinks.slice(0, 4)) {
    const href = link.getAttribute("href") || "";
    const match = href.match(/\/slow_download\/([^/]+)\/(\d+)\/(\d+)/);
    if (match) {
      slow.push({ md5: match[1], pathIndex: match[2], domainIndex: match[3] });
    }
  }

  return { md5, title, author, downloadOptions: { fast, slow } };
}

/**
 * Walk up from a link element to find the result container div.
 */
function findResultContainer(
  el: ReturnType<ReturnType<typeof parse>["querySelector"]>,
) {
  let current = el?.parentNode;
  let depth = 0;
  while (current && depth < 10) {
    if (
      current.rawTagName === "div" &&
      (current.classNames?.includes("flex") || current.classNames?.includes("mb-"))
    ) {
      // Check if this container has enough content to be a result block
      if (current.querySelectorAll("a").length >= 2) {
        return current;
      }
    }
    current = current.parentNode;
    depth++;
  }
  return el?.parentNode?.parentNode ?? null;
}
