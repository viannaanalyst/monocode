import { describe, expect, it } from "vitest";
import { parseProjectScripts } from "./projectScripts";

describe("parseProjectScripts", () => {
  it("reads an array or a scripts wrapper, dropping junk", () => {
    expect(
      parseProjectScripts(
        JSON.stringify({
          scripts: [
            { name: "Run app", command: "npm run dev" },
            { name: "Test", command: "npm test" },
            { name: "", command: "nope" },
            "junk",
          ],
        }),
      ),
    ).toEqual([
      { name: "Run app", command: "npm run dev" },
      { name: "Test", command: "npm test" },
    ]);
    expect(
      parseProjectScripts(
        JSON.stringify([{ name: "Lint", command: "pnpm lint" }]),
      ),
    ).toEqual([{ name: "Lint", command: "pnpm lint" }]);
  });

  it("returns nothing for invalid input", () => {
    expect(parseProjectScripts("not json")).toEqual([]);
    expect(parseProjectScripts("{}")).toEqual([]);
  });
});
