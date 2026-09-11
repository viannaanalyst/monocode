import { describe, expect, it } from "vitest";
import { claudeBridgeContent } from "./projectInstructions";

describe("claudeBridgeContent", () => {
  it("creates the import when CLAUDE.md is empty", () => {
    expect(claudeBridgeContent("")).toBe("@AGENTS.md\n");
    expect(claudeBridgeContent("   \n")).toBe("@AGENTS.md\n");
  });

  it("appends the import, keeping existing content", () => {
    expect(claudeBridgeContent("# House rules\nBe careful.")).toBe(
      "# House rules\nBe careful.\n\n@AGENTS.md\n",
    );
  });

  it("returns null when the import is already present", () => {
    expect(claudeBridgeContent("@AGENTS.md\n")).toBeNull();
    expect(claudeBridgeContent("See @AGENTS.md for details")).toBeNull();
  });
});
