/**
 * Format a number with K/M/B suffixes
 * @example formatNumber(1500) => "1.5K"
 * @example formatNumber(1500000) => "1.5M"
 */
export function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null) return "0";

  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return num.toLocaleString();
}

/**
 * Parse a formatted number string (K/M/B) back to a number
 * @example parseFormattedNumber("1.5K") => 1500
 * @example parseFormattedNumber("1.5M") => 1500000
 */
export function parseFormattedNumber(str: string): number {
  const cleaned = str.replace(/,/g, "").trim();

  if (cleaned.endsWith("B") || cleaned.endsWith("b")) {
    return parseFloat(cleaned) * 1_000_000_000;
  }
  if (cleaned.endsWith("M") || cleaned.endsWith("m")) {
    return parseFloat(cleaned) * 1_000_000;
  }
  if (cleaned.endsWith("K") || cleaned.endsWith("k")) {
    return parseFloat(cleaned) * 1_000;
  }

  return parseInt(cleaned, 10) || 0;
}

/**
 * Truncate a string to a maximum length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Clean HTML/special characters from a string
 */
export function cleanString(str: string): string {
  return str
    .replace(/\[7TV:[^\]]+\]/g, "") // Remove 7TV emote codes
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n") // Max 2 newlines
    .trim();
}
