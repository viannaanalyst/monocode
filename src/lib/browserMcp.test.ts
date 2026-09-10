import { describe, expect, it } from "vitest";
import { BROWSER_MCP_SCRIPT } from "./browserMcp";

describe("BROWSER_MCP_SCRIPT", () => {
  it("emits a valid base64 data-url regex", () => {
    // A double-escaped slash here turns the regex literal into a syntax error
    // that crashes the spawned MCP server (and with it Cursor/Grok/Fx).
    expect(BROWSER_MCP_SCRIPT).toContain(
      'replace(/^data:image\\/png;base64,/, "")',
    );
    expect(BROWSER_MCP_SCRIPT).not.toContain("image\\\\/png");
  });
});
