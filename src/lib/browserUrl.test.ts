import { describe, expect, it } from "vitest";
import { browserTabLabel, browserFaviconUrl, browserDataStoreId, hostAllowed, isLocalhostUrl, normalizeBrowserUrl } from "./browserUrl";

describe("normalizeBrowserUrl", () => {
  it("rejects a blank bar", () => {
    expect(normalizeBrowserUrl("  ")).toBeNull();
  });

  it("keeps an explicit scheme", () => {
    expect(normalizeBrowserUrl("http://localhost:5173")).toBe(
      "http://localhost:5173",
    );
  });

  it("adds https to a host", () => {
    expect(normalizeBrowserUrl("github.com")).toBe("https://github.com");
  });

  it("searches when the input is not a host", () => {
    expect(normalizeBrowserUrl("tauri webview")).toBe(
      "https://www.google.com/search?q=tauri%20webview",
    );
  });
});

describe("browserTabLabel", () => {
  it("falls back for a blank page", () => {
    expect(browserTabLabel("about:blank")).toBe("Browser");
  });

  it("uses the hostname", () => {
    expect(browserTabLabel("https://www.github.com/org/repo")).toBe("github.com");
  });

  it("prefers the page title like Cursor", () => {
    expect(
      browserTabLabel("https://www.google.com/", "Google"),
    ).toBe("Google");
  });
});

describe("browserFaviconUrl", () => {
  it("points at the host favicon", () => {
    expect(browserFaviconUrl("https://www.google.com/search")).toContain(
      "domain=www.google.com",
    );
  });
});

describe("isLocalhostUrl", () => {
  it("accepts loopback hosts", () => {
    expect(isLocalhostUrl("http://localhost:5173/app")).toBe(true);
    expect(isLocalhostUrl("http://127.0.0.1")).toBe(true);
    expect(isLocalhostUrl("https://github.com")).toBe(false);
  });
});

describe("hostAllowed", () => {
  it("defaults to localhost only", () => {
    expect(hostAllowed("http://localhost:3000", [])).toBe(true);
    expect(hostAllowed("https://example.com", [])).toBe(false);
  });

  it("honors * and exact hosts", () => {
    expect(hostAllowed("https://example.com", ["*"])).toBe(true);
    expect(hostAllowed("https://app.foo.dev", ["foo.dev"])).toBe(true);
    expect(hostAllowed("https://evil.com", ["foo.dev"])).toBe(false);
  });
});

describe("browserDataStoreId", () => {
  it("is stable per project and differs across folders", () => {
    expect(browserDataStoreId("/a")).toEqual(browserDataStoreId("/a"));
    expect(browserDataStoreId("/a")).not.toEqual(browserDataStoreId("/b"));
    expect(browserDataStoreId("/a")).toHaveLength(16);
  });
});
