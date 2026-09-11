/** Files the in-app browser can render as a page rather than show as source. */
export function isHtmlFilePath(path: string): boolean {
  const clean = path.split(/[?#]/)[0]?.trim().toLowerCase() ?? "";
  return clean.endsWith(".html") || clean.endsWith(".htm");
}
