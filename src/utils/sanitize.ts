import { basename } from "node:path";

const UNICODE_REPLACEMENTS: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
};

/**
 * Sanitize a filename from a download URL or API response.
 * Handles path traversal, Unicode issues, and filesystem limits.
 */
export function sanitizeFilename(
  raw: string,
  md5: string,
  fallbackExt = "pdf",
): string {
  // URL-decode
  let name = decodeURIComponent(raw);

  // Extract basename only (prevent path traversal)
  name = basename(name);

  // Strip query strings
  name = name.split("?")[0];

  // Replace Unicode quotes/dashes with ASCII equivalents
  for (const [unicode, ascii] of Object.entries(UNICODE_REPLACEMENTS)) {
    name = name.replaceAll(unicode, ascii);
  }

  // Strip control characters and null bytes
  name = name.replace(/[\x00-\x1F\x7F]/g, "");

  // Replace filesystem-problematic characters
  name = name.replace(/[<>:"/\\|?*]/g, "_");

  // Collapse whitespace
  name = name.replace(/\s+/g, " ").trim();

  // Remove leading dots (hidden files)
  name = name.replace(/^\.+/, "");

  // Truncate to 200 chars, preserving extension
  if (name.length > 200) {
    const dotIdx = name.lastIndexOf(".");
    if (dotIdx > 0) {
      const ext = name.slice(dotIdx);
      name = name.slice(0, 200 - ext.length) + ext;
    } else {
      name = name.slice(0, 200);
    }
  }

  // Fallback if empty or only whitespace
  if (!name || name === "." || name === "..") {
    const ext = fallbackExt.startsWith(".") ? fallbackExt : `.${fallbackExt}`;
    return `${md5}${ext}`;
  }

  return name;
}
