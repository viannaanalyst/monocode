import { describe, expect, it } from "vitest";
import { isHtmlFilePath } from "./fileKind";

describe("isHtmlFilePath", () => {
  it("matches html and htm regardless of case or hash", () => {
    expect(isHtmlFilePath("/a/index.html")).toBe(true);
    expect(isHtmlFilePath("UsagePopover.prototype.HTM")).toBe(true);
    expect(isHtmlFilePath("/a/page.html?x=1#top")).toBe(true);
  });

  it("ignores other files", () => {
    expect(isHtmlFilePath("/a/index.md")).toBe(false);
    expect(isHtmlFilePath("/a/index.tsx")).toBe(false);
    expect(isHtmlFilePath("")).toBe(false);
  });
});
