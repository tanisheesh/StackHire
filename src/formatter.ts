import type { JobListing } from "./types.js";

/**
 * Formats a JobListing into a Telegram HTML-mode message string.
 * Includes job title, company name, location, and a clickable hyperlink to the application URL.
 */
export function formatListing(listing: JobListing): string {
  const { title, company, location, url } = listing;
  return `<b>${escapeHtml(title)}</b>\n${escapeHtml(company)} — ${escapeHtml(location)}\n<a href="${escapeHtml(url)}">Apply now</a>`;
}

/** Escapes characters that have special meaning in Telegram HTML parse mode. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
