import { describe, expect, it } from "vitest";
import { BROWSER_MCP_SCRIPT, browserMcpServers } from "./browserMcp";

describe("BROWSER_MCP_SCRIPT", () => {
  it("emits a valid base64 data-url regex", () => {
    // A double-escaped slash here turns the regex literal into a syntax error
    // that crashes the spawned MCP server (and with it Cursor/Grok/Fx).
    expect(BROWSER_MCP_SCRIPT).toContain(
      'replace(/^data:image\\/png;base64,/, "")',
    );
    expect(BROWSER_MCP_SCRIPT).not.toContain("image\\\\/png");
  });

  it("frames replies as newline-delimited JSON, not Content-Length", () => {
    // cursor-agent's MCP client speaks newline-delimited JSON. Content-Length
    // framing makes session/new hang until it gives up.
    expect(BROWSER_MCP_SCRIPT).toContain('stdout.write(json + "\\n");');
    expect(BROWSER_MCP_SCRIPT).not.toContain('stdout.write("Content-Length');
  });
});

describe("browserMcpServers", () => {
  it("sends env as the name/value array ACP expects", () => {
    expect(browserMcpServers("/repo")).toEqual([
      {
        name: "monocode-browser",
        command: "node",
        args: ["/repo/.monocode-browser-mcp.mjs"],
        env: [{ name: "MONOCODE_BROWSER_CWD", value: "/repo" }],
      },
    ]);
  });

  it("returns no servers without a working directory", () => {
    expect(browserMcpServers("  ")).toEqual([]);
  });
});
