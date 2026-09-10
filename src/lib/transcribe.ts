import { invoke } from "@tauri-apps/api/core";

export type VoiceModel = "gpt-4o-transcribe" | "gpt-4o-mini-transcribe";

const MIME_CANDIDATES = [
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

/** Best supported MediaRecorder mime type, or null to let the browser decide. */
export function pickRecordingMime(
  isSupported: (mime: string) => boolean = (mime) =>
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported(mime),
): string | null {
  for (const mime of MIME_CANDIDATES) {
    if (isSupported(mime)) return mime;
  }
  return null;
}

export function recordExtension(mime: string | null): string {
  if (!mime) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read the audio."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/** Insert text at the textarea cursor, adding a separating space when needed. */
export function insertAtCursor(
  textarea: HTMLTextAreaElement,
  text: string,
): string {
  const insertion = text.trim();
  if (!insertion) return textarea.value;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const needsLeading = before.length > 0 && !/\s$/.test(before);
  const next = `${before}${needsLeading ? " " : ""}${insertion}${after}`;
  const caret = start + (needsLeading ? 1 : 0) + insertion.length;
  textarea.value = next;
  textarea.setSelectionRange(caret, caret);
  return next;
}

export async function transcribeBlob(
  blob: Blob,
  mime: string,
  opts: { model: VoiceModel; language?: string; prompt?: string },
): Promise<string> {
  const audioBase64 = await blobToBase64(blob);
  return invoke<string>("transcribe_audio", {
    audioBase64,
    mime: mime || blob.type,
    model: opts.model,
    language: opts.language && opts.language !== "auto" ? opts.language : null,
    prompt: opts.prompt?.trim() ? opts.prompt.trim() : null,
  });
}

export function voiceHasApiKey(): Promise<boolean> {
  return invoke<boolean>("voice_has_api_key");
}

export async function voiceSetApiKey(value: string): Promise<void> {
  await invoke("voice_set_api_key", { value });
}

export async function voiceClearApiKey(): Promise<void> {
  await invoke("voice_clear_api_key");
}
