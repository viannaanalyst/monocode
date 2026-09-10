import { describe, expect, it } from "vitest";
import { insertAtCursor, pickRecordingMime, recordExtension } from "./transcribe";

function fakeTextarea(value: string, start: number, end = start) {
  return {
    value,
    selectionStart: start,
    selectionEnd: end,
    setSelectionRange(nextStart: number, nextEnd: number) {
      this.selectionStart = nextStart;
      this.selectionEnd = nextEnd;
    },
  } as unknown as HTMLTextAreaElement & { setSelectionRange: unknown };
}

describe("insertAtCursor", () => {
  it("inserts into an empty field", () => {
    const el = fakeTextarea("", 0);
    expect(insertAtCursor(el, "olá")).toBe("olá");
  });

  it("inserts at the cursor with a separating space", () => {
    const el = fakeTextarea("fix the", 7);
    expect(insertAtCursor(el, "bug")).toBe("fix the bug");
  });

  it("does not add a space when the cursor already follows whitespace", () => {
    const el = fakeTextarea("fix ", 4);
    expect(insertAtCursor(el, "bug")).toBe("fix bug");
  });

  it("replaces the selected range", () => {
    const el = fakeTextarea("fix the bug", 4, 7);
    expect(insertAtCursor(el, "that")).toBe("fix that bug");
  });

  it("separates both sides of a mid-word insertion and lands the caret after it", () => {
    const el = fakeTextarea("helloworld", 5);
    expect(insertAtCursor(el, "there")).toBe("hello there world");
    expect(el.selectionStart).toBe(11);
    expect(el.selectionEnd).toBe(11);
  });

  it("adds a trailing space when the next character is not whitespace", () => {
    const el = fakeTextarea("fix bug", 4);
    expect(insertAtCursor(el, "the")).toBe("fix the bug");
    expect(el.selectionStart).toBe(7);
  });

  it("does not add a trailing space before existing whitespace", () => {
    const el = fakeTextarea("fix  bug", 4);
    expect(insertAtCursor(el, "the")).toBe("fix the bug");
    expect(el.selectionStart).toBe(7);
  });

  it("ignores empty transcription", () => {
    const el = fakeTextarea("keep", 4);
    expect(insertAtCursor(el, "   ")).toBe("keep");
  });
});

describe("pickRecordingMime", () => {
  it("prefers mp4 on WebKit", () => {
    expect(pickRecordingMime(() => true)).toBe("audio/mp4");
  });

  it("falls back to webm when mp4 is unsupported", () => {
    expect(pickRecordingMime((mime) => mime === "audio/webm;codecs=opus")).toBe(
      "audio/webm;codecs=opus",
    );
  });

  it("returns null when nothing is supported", () => {
    expect(pickRecordingMime(() => false)).toBeNull();
  });
});

describe("recordExtension", () => {
  it("maps mime types to extensions", () => {
    expect(recordExtension("audio/mp4")).toBe("m4a");
    expect(recordExtension("audio/ogg;codecs=opus")).toBe("ogg");
    expect(recordExtension("audio/webm")).toBe("webm");
    expect(recordExtension(null)).toBe("webm");
  });
});
