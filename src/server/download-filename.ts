/** Sanitize a value for use in Content-Disposition attachment filenames. */
export function sanitizeDownloadFilename(
  raw: string,
  fallback = "download",
): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/\.\.+/g, "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : fallback;
}
