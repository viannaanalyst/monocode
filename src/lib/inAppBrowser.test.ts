import { describe, expect, it } from "vitest";
import {
  needsBrowserApproval,
  normalizeBrowserOp,
  parseBrowserAgentRequest,
} from "./inAppBrowser";

describe("parseBrowserAgentRequest", () => {
  it("accepts navigate, snapshot, and click", () => {
    expect(
      parseBrowserAgentRequest(
        JSON.stringify({ id: "1", op: "navigate", url: "http://localhost:3" }),
      ),
    ).toEqual({
      id: "1",
      op: "navigate",
      url: "http://localhost:3",
      selector: undefined,
      text: undefined,
      dy: undefined,
    });
    expect(
      parseBrowserAgentRequest(JSON.stringify({ id: "2", op: "snapshot" })),
    ).toMatchObject({ id: "2", op: "snapshot" });
    expect(
      parseBrowserAgentRequest(
        JSON.stringify({ id: "3", op: "click", selector: "button.ok" }),
      ),
    ).toMatchObject({ id: "3", op: "click", selector: "button.ok" });
    expect(
      parseBrowserAgentRequest(
        JSON.stringify({
          id: "4",
          op: "browser_type",
          selector: "input",
          text: "hi",
        }),
      ),
    ).toMatchObject({ id: "4", op: "type", selector: "input", text: "hi" });
    expect(
      parseBrowserAgentRequest(
        JSON.stringify({ id: "5", op: "screenshot" }),
      ),
    ).toMatchObject({ id: "5", op: "screenshot" });
  });

  it("maps Cursor-style tool names", () => {
    expect(normalizeBrowserOp("browser_take_screenshot")).toBe("screenshot");
    expect(normalizeBrowserOp("browser_console_messages")).toBe("console");
    expect(normalizeBrowserOp("browser_fill")).toBe("type");
    expect(normalizeBrowserOp("browser_hover")).toBe("hover");
  });

  it("rejects junk", () => {
    expect(parseBrowserAgentRequest("nope")).toBeNull();
    expect(
      parseBrowserAgentRequest(JSON.stringify({ id: "1", op: "navigate" })),
    ).toBeNull();
  });
});

describe("needsBrowserApproval", () => {
  it("skips snapshots and localhost navigation", () => {
    expect(
      needsBrowserApproval({ id: "1", op: "screenshot" }),
    ).toBe(false);
    expect(
      needsBrowserApproval({ id: "1", op: "console" }),
    ).toBe(false);
    expect(
      needsBrowserApproval({
        id: "1",
        op: "navigate",
        url: "http://localhost:5173",
      }),
    ).toBe(false);
    expect(
      needsBrowserApproval({
        id: "1",
        op: "navigate",
        url: "https://example.com",
      }),
    ).toBe(true);
    expect(
      needsBrowserApproval({ id: "1", op: "click", selector: "a" }),
    ).toBe(true);
  });
});
