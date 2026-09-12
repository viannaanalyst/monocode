import { describe, expect, it } from "vitest";
import {
  filesFromClipboard,
  mergeAttachments,
  replaceAttachment,
} from "./attachments";
import type { Attachment } from "./session";

function file(name: string, type: string, body = "x") {
  return new File([body], name, { type });
}

function item(next: File): {
  kind: string;
  type: string;
  getAsFile: () => File | null;
} {
  return {
    kind: "file",
    type: next.type,
    getAsFile: () => next,
  };
}

function attachment(
  partial: Partial<Attachment> & Pick<Attachment, "id" | "name">,
): Attachment {
  return {
    mimeType: "image/png",
    kind: "image",
    size: 4,
    ...partial,
  };
}

describe("mergeAttachments", () => {
  it("keeps previously attached images when adding more", () => {
    const first = attachment({ id: "a", name: "one.png" });
    const second = attachment({ id: "b", name: "two.png" });
    expect(mergeAttachments([first], [second]).map((file) => file.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("skips the same path twice", () => {
    const first = attachment({
      id: "a",
      name: "shot.png",
      path: "/tmp/shot.png",
    });
    const again = attachment({
      id: "b",
      name: "shot.png",
      path: "/tmp/shot.png",
    });
    expect(mergeAttachments([first], [again])).toEqual([first]);
  });
});

describe("replaceAttachment", () => {
  it("swaps the edited image in place", () => {
    const first = attachment({ id: "a", name: "one.png" });
    const second = attachment({ id: "b", name: "two.png" });
    const edited = attachment({ id: "edited", name: "one-edit.png" });
    const result = replaceAttachment([first, second], "a", edited);
    expect(result.next).toEqual([edited, second]);
    expect(result.replaced).toBe(first);
  });

  it("appends when the original left the draft", () => {
    const first = attachment({ id: "a", name: "one.png" });
    const edited = attachment({ id: "edited", name: "one-edit.png" });
    const result = replaceAttachment([first], "gone", edited);
    expect(result.next).toEqual([first, edited]);
    expect(result.replaced).toBeNull();
  });
});

describe("filesFromClipboard", () => {
  it("returns every file item when the files list is truncated", () => {
    const a = file("a.png", "image/png", "a");
    const b = file("b.png", "image/png", "b");
    expect(
      filesFromClipboard({
        files: [a],
        items: [item(a), item(b)],
      }),
    ).toEqual([a, b]);
  });

  it("drops the unnamed tiff twin of a png screenshot", () => {
    const png = file("image.png", "image/png");
    const tiff = file("image.tiff", "image/tiff");
    expect(
      filesFromClipboard({
        files: [png],
        items: [item(png), item(tiff)],
      }),
    ).toEqual([png]);
  });

  it("keeps a real named tiff next to a png", () => {
    const png = file("diagram.png", "image/png");
    const tiff = file("scan.tiff", "image/tiff");
    expect(
      filesFromClipboard({
        files: [png, tiff],
        items: [item(png), item(tiff)],
      }),
    ).toEqual([png, tiff]);
  });
});
