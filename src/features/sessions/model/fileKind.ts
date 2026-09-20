/** HTML files that can be opened in the system browser from the file menu. */
export function isHtmlFilePath(path: string): boolean {
  const clean = path.split(/[?#]/)[0]?.trim().toLowerCase() ?? "";
  return clean.endsWith(".html") || clean.endsWith(".htm");
}
