# Voice Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a composer microphone button that records audio, transcribes it with OpenAI `gpt-4o-transcribe`, and inserts the text at the composer cursor for review before sending.

**Architecture:** Audio is recorded in the webview with `MediaRecorder`, encoded as base64, and sent over IPC to a Rust command. The Rust side reads the OpenAI key from the macOS Keychain, builds the `multipart/form-data` request, calls OpenAI, and returns the text. The frontend only ever learns whether a key exists, never its value.

**Tech Stack:** Tauri 2 (Rust: `ureq`, `serde_json`, `base64`, `keyring`), React 19, TypeScript, Vitest, MediaRecorder API.

## Global Constraints

- **The API key must never leak.** It lives only in the macOS Keychain (service `MonoCode`, account `openai_api_key`). No IPC command returns it; the frontend can only set, clear, or check presence (`voice_has_api_key`). Never log it, never include it in an error string, toast, or `localStorage`.
- **Do not commit.** Do not run `git commit` unless the user explicitly authorizes it in the session.
- macOS first. Windows/Linux microphone capture is out of scope; the keychain commands must compile everywhere and return a "not available" result off macOS.
- Default model: `gpt-4o-transcribe`. Second option: `gpt-4o-mini-transcribe`.
- Endpoint: `https://api.openai.com/v1/audio/transcriptions`. Request timeout 60s. Max audio 25 MB (reject before upload).
- Transcription text is inserted at the composer cursor and **never auto-sent**.
- Do not modify the in-app browser, browser MCP, or harness code.
- Keep the transcription network call and the key handling entirely in Rust.

---

## File Structure

- Create `src-tauri/src/secrets.rs` — Keychain access and the `voice_*` commands.
- Create `src-tauri/src/transcribe.rs` — multipart builder, OpenAI call, response parsing, `transcribe_audio` command.
- Modify `src-tauri/src/lib.rs` — declare modules, register commands.
- Modify `src-tauri/Cargo.toml` — add the macOS-only `keyring` dependency.
- Modify `src-tauri/Info.plist`, `src-tauri/Entitlements.plist` — microphone usage description and audio-input entitlement.
- Create `src/lib/transcribe.ts` — mime picking, base64, cursor insertion, IPC wrappers.
- Create `src/lib/dictation.ts` — framework-agnostic recording state machine.
- Create `src/hooks/useDictation.ts` — React wrapper around the controller.
- Modify `src/lib/settings.ts` — voice preferences (enabled, model, language, prompt).
- Modify `src/surfaces/SettingsView.tsx` — Voice input section.
- Modify `src/chrome/Composer.tsx` — microphone button and insertion wiring.
- Modify `src/chrome/icons.tsx` — mic and stop icons.
- Modify `src/i18n/pt-BR.ts` — Portuguese strings.

---

### Task 1: Rust keychain and transcription backend

**Files:**
- Create: `src-tauri/src/secrets.rs`
- Create: `src-tauri/src/transcribe.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Info.plist`
- Modify: `src-tauri/Entitlements.plist`

**Interfaces:**
- Consumes: nothing.
- Produces (IPC commands the frontend calls):
  - `voice_set_api_key(value: String) -> Result<(), String>`
  - `voice_clear_api_key() -> Result<(), String>`
  - `voice_has_api_key() -> Result<bool, String>`
  - `transcribe_audio(audio_base64: String, mime: String, model: String, language: Option<String>, prompt: Option<String>) -> Result<String, String>`
- Produces (crate-internal): `secrets::read_api_key() -> Result<Option<String>, String>`.

- [ ] **Step 1: Add the macOS-only keyring dependency**

In `src-tauri/Cargo.toml`, inside the existing `[target.'cfg(target_os = "macos")'.dependencies]` block, add:

```toml
keyring = { version = "3", features = ["apple-native"] }
```

- [ ] **Step 2: Write the failing Rust tests for the pure transcription helpers**

Create `src-tauri/src/transcribe.rs` with only the constants, helpers, and tests (the command comes in Step 4):

```rust
use std::time::Duration;

const TRANSCRIBE_URL: &str = "https://api.openai.com/v1/audio/transcriptions";
const HTTP_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_AUDIO_BYTES: usize = 25 * 1024 * 1024;

fn new_boundary() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("----MonoCodeBoundary{}{}", std::process::id(), nanos)
}

fn push_text_part(body: &mut Vec<u8>, boundary: &str, name: &str, value: &str) {
    body.extend_from_slice(
        format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n"
        )
        .as_bytes(),
    );
}

fn build_multipart(
    boundary: &str,
    model: &str,
    language: Option<&str>,
    prompt: Option<&str>,
    mime: &str,
    filename: &str,
    audio: &[u8],
) -> Vec<u8> {
    let mut body = Vec::with_capacity(audio.len() + 512);
    push_text_part(&mut body, boundary, "model", model);
    if let Some(language) = language {
        push_text_part(&mut body, boundary, "language", language);
    }
    if let Some(prompt) = prompt {
        push_text_part(&mut body, boundary, "prompt", prompt);
    }
    body.extend_from_slice(
        format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: {mime}\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(audio);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    body
}

fn parse_transcription(body: &str) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| "Could not read the transcription response.".to_string())?;
    let text = parsed
        .get("text")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim();
    if text.is_empty() {
        return Err("The transcription was empty.".to_string());
    }
    Ok(text.to_string())
}

/// OpenAI status codes mapped to messages that never include the API key.
fn map_status_error(status: u16) -> String {
    match status {
        401 | 403 => "OpenAI rejected the API key.".to_string(),
        413 => "That recording is too long to transcribe.".to_string(),
        429 => "OpenAI rate limit reached. Try again in a moment.".to_string(),
        _ => format!("OpenAI transcription failed ({status})."),
    }
}

fn audio_filename(mime: &str) -> &'static str {
    if mime.contains("mp4") {
        "audio.m4a"
    } else if mime.contains("ogg") {
        "audio.ogg"
    } else {
        "audio.webm"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multipart_includes_model_language_and_file() {
        let body = build_multipart(
            "BOUND",
            "gpt-4o-transcribe",
            Some("pt"),
            Some("MonoCode"),
            "audio/mp4",
            "audio.m4a",
            b"RIFF",
        );
        let text = String::from_utf8_lossy(&body);
        assert!(text.contains("name=\"model\"\r\n\r\ngpt-4o-transcribe"));
        assert!(text.contains("name=\"language\"\r\n\r\npt"));
        assert!(text.contains("name=\"prompt\"\r\n\r\nMonoCode"));
        assert!(text.contains("filename=\"audio.m4a\""));
        assert!(text.contains("Content-Type: audio/mp4"));
        assert!(text.contains("RIFF"));
        assert!(text.ends_with("--BOUND--\r\n"));
    }

    #[test]
    fn multipart_omits_optional_parts() {
        let body = build_multipart("B", "m", None, None, "audio/webm", "a.webm", b"x");
        let text = String::from_utf8_lossy(&body);
        assert!(!text.contains("name=\"language\""));
        assert!(!text.contains("name=\"prompt\""));
    }

    #[test]
    fn transcription_parses_and_trims() {
        assert_eq!(
            parse_transcription("{\"text\":\"  olá mundo  \"}").unwrap(),
            "olá mundo"
        );
    }

    #[test]
    fn transcription_rejects_empty_or_invalid() {
        assert!(parse_transcription("{\"text\":\"   \"}").is_err());
        assert!(parse_transcription("not json").is_err());
    }

    #[test]
    fn status_messages_never_include_a_key() {
        for status in [401u16, 403, 413, 429, 500] {
            let message = map_status_error(status);
            assert!(!message.contains("sk-"));
            assert!(!message.contains("Bearer"));
        }
    }

    #[test]
    fn filename_follows_mime() {
        assert_eq!(audio_filename("audio/mp4"), "audio.m4a");
        assert_eq!(audio_filename("audio/ogg;codecs=opus"), "audio.ogg");
        assert_eq!(audio_filename("audio/webm;codecs=opus"), "audio.webm");
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail to compile**

Run: `cargo test -p monocode transcribe`
Expected: FAIL — `transcribe` module is not declared yet.

- [ ] **Step 4: Add the command, the keychain module, register modules, and update the plists**

Add the upload function and command to the end of `src-tauri/src/transcribe.rs` (before `#[cfg(test)]`):

```rust
fn upload_transcription(
    key: &str,
    audio: &[u8],
    mime: &str,
    model: &str,
    language: Option<&str>,
    prompt: Option<&str>,
) -> Result<String, String> {
    let boundary = new_boundary();
    let filename = audio_filename(mime);
    let body = build_multipart(&boundary, model, language, prompt, mime, filename, audio);
    let agent = ureq::AgentBuilder::new().timeout(HTTP_TIMEOUT).build();
    let response = match agent
        .post(TRANSCRIBE_URL)
        .set("Authorization", &format!("Bearer {key}"))
        .set(
            "Content-Type",
            &format!("multipart/form-data; boundary={boundary}"),
        )
        .send_bytes(&body)
    {
        Ok(response) => response,
        Err(ureq::Error::Status(status, _)) => return Err(map_status_error(status)),
        Err(_) => return Err("Could not reach OpenAI. Check your connection.".to_string()),
    };
    let text = response
        .into_string()
        .map_err(|_| "Could not read the transcription response.".to_string())?;
    parse_transcription(&text)
}

/// Transcribe a base64 audio clip with OpenAI. The key is read from the
/// Keychain here and never crosses back over IPC.
#[tauri::command]
pub async fn transcribe_audio(
    audio_base64: String,
    mime: String,
    model: String,
    language: Option<String>,
    prompt: Option<String>,
) -> Result<String, String> {
    use base64::Engine as _;

    let audio = base64::engine::general_purpose::STANDARD
        .decode(audio_base64.as_bytes())
        .map_err(|_| "Could not read the recorded audio.".to_string())?;
    if audio.is_empty() {
        return Err("The recording was empty.".to_string());
    }
    if audio.len() > MAX_AUDIO_BYTES {
        return Err("That recording is too long to transcribe.".to_string());
    }
    let key = crate::secrets::read_api_key()?
        .ok_or_else(|| "MISSING_KEY".to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        upload_transcription(
            &key,
            &audio,
            &mime,
            &model,
            language.as_deref(),
            prompt.as_deref(),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}
```

Create `src-tauri/src/secrets.rs`:

```rust
const SERVICE: &str = "MonoCode";
const ACCOUNT: &str = "openai_api_key";

/// Read the OpenAI key from the OS keychain. Only ever called inside Rust.
#[cfg(target_os = "macos")]
pub(crate) fn read_api_key() -> Result<Option<String>, String> {
    let entry =
        keyring::Entry::new(SERVICE, ACCOUNT).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn read_api_key() -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
pub fn voice_set_api_key(value: String) -> Result<(), String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        return Err("Enter a key first.".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        let entry =
            keyring::Entry::new(SERVICE, ACCOUNT).map_err(|error| error.to_string())?;
        entry
            .set_password(&value)
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = value;
        return Err("Voice input is available on macOS only for now.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn voice_clear_api_key() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let entry =
            keyring::Entry::new(SERVICE, ACCOUNT).map_err(|error| error.to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

#[tauri::command]
pub fn voice_has_api_key() -> Result<bool, String> {
    Ok(read_api_key()?.is_some())
}
```

In `src-tauri/src/lib.rs`, add `mod secrets;` and `mod transcribe;` to the module list, and add the four commands to the `tauri::generate_handler![...]` list:

```rust
            secrets::voice_set_api_key,
            secrets::voice_clear_api_key,
            secrets::voice_has_api_key,
            transcribe::transcribe_audio,
```

In `src-tauri/Info.plist`, add inside the outer `<dict>`:

```xml
	<key>NSMicrophoneUsageDescription</key>
	<string>MonoCode uses the microphone to dictate prompts into the composer.</string>
```

In `src-tauri/Entitlements.plist`, add inside the outer `<dict>`:

```xml
	<key>com.apple.security.device.audio-input</key>
	<true/>
```

- [ ] **Step 5: Run the tests and the Rust check**

Run: `cargo test -p monocode transcribe` then `cargo build -p monocode`
Expected: 6 tests pass; build succeeds with the new commands.

- [ ] **Step 6: Commit (only if authorized)**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/src/secrets.rs src-tauri/src/transcribe.rs src-tauri/Info.plist src-tauri/Entitlements.plist
git commit -m "Add voice transcription backend with keychain-stored OpenAI key"
```

---

### Task 2: Frontend transcription library

**Files:**
- Create: `src/lib/transcribe.ts`
- Test: `src/lib/transcribe.test.ts`

**Interfaces:**
- Consumes: the IPC commands from Task 1.
- Produces:
  - `type VoiceModel = "gpt-4o-transcribe" | "gpt-4o-mini-transcribe"`
  - `pickRecordingMime(isSupported?: (mime: string) => boolean): string | null`
  - `recordExtension(mime: string | null): string`
  - `blobToBase64(blob: Blob): Promise<string>`
  - `insertAtCursor(textarea: HTMLTextAreaElement, text: string): string`
  - `transcribeBlob(blob: Blob, mime: string, opts: { model: VoiceModel; language?: string; prompt?: string }): Promise<string>`
  - `voiceHasApiKey(): Promise<boolean>`
  - `voiceSetApiKey(value: string): Promise<void>`
  - `voiceClearApiKey(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/transcribe.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/transcribe.test.ts`
Expected: FAIL — cannot resolve `./transcribe`.

- [ ] **Step 3: Implement the library**

Create `src/lib/transcribe.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/transcribe.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/lib/transcribe.ts src/lib/transcribe.test.ts
git commit -m "Add voice transcription frontend library"
```

---

### Task 3: Recording state machine

**Files:**
- Create: `src/lib/dictation.ts`
- Test: `src/lib/dictation.test.ts`

**Interfaces:**
- Consumes: nothing (injected dependencies).
- Produces:
  - `type DictationState = "idle" | "recording" | "transcribing"`
  - `type DictationDeps = { getUserMedia(constraints): Promise<MediaStream>; createRecorder(stream, mime): MediaRecorderLike; transcribe(blob: Blob, mime: string): Promise<string>; now(): number; onText(text: string): void; onError(message: string): void; onChange?(): void }`
  - `class DictationController { get state; get elapsedMs; start(): Promise<void>; stop(): Promise<void>; cancel(): void; dispose(): void }`
  - `interface MediaRecorderLike { start(): void; stop(): void; addEventListener(type: string, cb: (event: unknown) => void): void; mimeType: string; }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/dictation.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { DictationController, type MediaRecorderLike } from "./dictation";

function fakeRecorder() {
  const listeners = new Map<string, (event: unknown) => void>();
  const recorder: MediaRecorderLike & { emit(type: string, event?: unknown): void } = {
    mimeType: "audio/mp4",
    start: vi.fn(),
    stop: vi.fn(() => recorder.emit("stop")),
    addEventListener: (type, cb) => listeners.set(type, cb),
    emit: (type, event) => listeners.get(type)?.(event),
  };
  return recorder;
}

function fakeStream() {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track] } as unknown as MediaStream;
}

function setup(overrides: Partial<Parameters<typeof DictationController.prototype.constructor>[0]> = {}) {
  const recorder = fakeRecorder();
  const text = vi.fn();
  const error = vi.fn();
  const deps = {
    getUserMedia: vi.fn(async () => fakeStream()),
    createRecorder: vi.fn(() => recorder),
    transcribe: vi.fn(async () => "olá mundo"),
    now: () => 1000,
    onText: text,
    onError: error,
    ...overrides,
  };
  const controller = new DictationController(deps as never);
  return { controller, recorder, deps, text, error };
}

describe("DictationController", () => {
  it("records then transcribes and reports text", async () => {
    const { controller, recorder, text } = setup();
    await controller.start();
    expect(controller.state).toBe("recording");
    expect(recorder.start).toHaveBeenCalledOnce();

    recorder.emit("dataavailable", { data: new Blob(["x"]) });
    await controller.stop();

    expect(controller.state).toBe("idle");
    expect(text).toHaveBeenCalledWith("olá mundo");
  });

  it("reports a microphone failure", async () => {
    const { controller, error } = setup({
      getUserMedia: vi.fn(async () => {
        throw new Error("NotAllowedError");
      }),
    });
    await controller.start();
    expect(controller.state).toBe("idle");
    expect(error).toHaveBeenCalled();
  });

  it("reports a transcription failure", async () => {
    const { controller, recorder, error } = setup({
      transcribe: vi.fn(async () => {
        throw new Error("MISSING_KEY");
      }),
    });
    await controller.start();
    recorder.emit("dataavailable", { data: new Blob(["x"]) });
    await controller.stop();
    expect(error).toHaveBeenCalledWith("MISSING_KEY");
    expect(controller.state).toBe("idle");
  });

  it("cancel discards the recording without transcribing", async () => {
    const { controller, recorder, deps } = setup();
    await controller.start();
    recorder.emit("dataavailable", { data: new Blob(["x"]) });
    controller.cancel();
    expect(controller.state).toBe("idle");
    expect(deps.transcribe).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dictation.test.ts`
Expected: FAIL — cannot resolve `./dictation`.

- [ ] **Step 3: Implement the controller**

Create `src/lib/dictation.ts`:

```ts
export type DictationState = "idle" | "recording" | "transcribing";

export interface MediaRecorderLike {
  mimeType: string;
  start(): void;
  stop(): void;
  addEventListener(type: string, callback: (event: unknown) => void): void;
}

export type DictationDeps = {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createRecorder(stream: MediaStream, mime: string | null): MediaRecorderLike;
  transcribe(blob: Blob, mime: string): Promise<string>;
  now(): number;
  onText(text: string): void;
  onError(message: string): void;
  onChange?(): void;
};

export class DictationController {
  private currentState: DictationState = "idle";
  private recorder: MediaRecorderLike | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private cancelled = false;

  constructor(private deps: DictationDeps) {}

  get state(): DictationState {
    return this.currentState;
  }

  get elapsedMs(): number {
    if (this.currentState !== "recording") return 0;
    return Math.max(0, this.deps.now() - this.startedAt);
  }

  private setState(next: DictationState) {
    this.currentState = next;
    this.deps.onChange?.();
  }

  private releaseStream() {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }

  async start(): Promise<void> {
    if (this.currentState !== "idle") return;
    try {
      const stream = await this.deps.getUserMedia({ audio: true });
      this.stream = stream;
      this.cancelled = false;
      this.chunks = [];
      const recorder = this.deps.createRecorder(stream, null);
      this.recorder = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        const data = (event as { data?: Blob }).data;
        if (data && data.size > 0) this.chunks.push(data);
      });
      recorder.start();
      this.startedAt = this.deps.now();
      this.setState("recording");
    } catch (cause) {
      this.releaseStream();
      this.setState("idle");
      this.deps.onError(
        cause instanceof Error ? cause.message : "Could not start recording.",
      );
    }
  }

  async stop(): Promise<void> {
    if (this.currentState !== "recording" || !this.recorder) return;
    const recorder = this.recorder;
    this.setState("transcribing");
    const finished = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve());
    });
    recorder.stop();
    await finished;

    const mime = recorder.mimeType || "audio/webm";
    const blob = new Blob(this.chunks, { type: mime });
    this.releaseStream();

    if (this.cancelled) {
      this.setState("idle");
      return;
    }
    try {
      const text = await this.deps.transcribe(blob, mime);
      if (text.trim()) this.deps.onText(text.trim());
      else this.deps.onError("The transcription was empty.");
    } catch (cause) {
      this.deps.onError(
        cause instanceof Error ? cause.message : String(cause),
      );
    } finally {
      this.setState("idle");
    }
  }

  cancel(): void {
    if (this.currentState === "idle") return;
    this.cancelled = true;
    if (this.currentState === "recording") this.recorder?.stop();
    this.releaseStream();
    this.setState("idle");
  }

  dispose(): void {
    this.cancel();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dictation.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/lib/dictation.ts src/lib/dictation.test.ts
git commit -m "Add dictation recording state machine"
```

---

### Task 4: React dictation hook

**Files:**
- Create: `src/hooks/useDictation.ts`

**Interfaces:**
- Consumes: `DictationController` (Task 3), `pickRecordingMime` / `transcribeBlob` (Task 2).
- Produces: `useDictation(opts: { enabled: boolean; getOptions(): { model: VoiceModel; language?: string; prompt?: string }; onText(text: string): void; onError(message: string): void }): { state: DictationState; elapsedMs: number; toggle(): void }`

- [ ] **Step 1: Implement the hook**

Create `src/hooks/useDictation.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { DictationController, type DictationState } from "../lib/dictation";
import { pickRecordingMime, transcribeBlob, type VoiceModel } from "../lib/transcribe";

type Options = {
  enabled: boolean;
  getOptions(): { model: VoiceModel; language?: string; prompt?: string };
  onText(text: string): void;
  onError(message: string): void;
};

export function useDictation({ enabled, getOptions, onText, onError }: Options) {
  const [state, setState] = useState<DictationState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const optionsRef = useRef({ getOptions, onText, onError });
  optionsRef.current = { getOptions, onText, onError };

  const controllerRef = useRef<DictationController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new DictationController({
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
      createRecorder: (stream, mime) =>
        mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream),
      transcribe: (blob, mime) => {
        const { model, language, prompt } = optionsRef.current.getOptions();
        return transcribeBlob(blob, mime, { model, language, prompt });
      },
      now: () => Date.now(),
      onText: (text) => optionsRef.current.onText(text),
      onError: (message) => optionsRef.current.onError(message),
      onChange: () => {
        setState(controllerRef.current?.state ?? "idle");
        setElapsedMs(controllerRef.current?.elapsedMs ?? 0);
      },
    });
  }

  useEffect(() => {
    return () => controllerRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!enabled) controllerRef.current?.cancel();
  }, [enabled]);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(
      () => setElapsedMs(controllerRef.current?.elapsedMs ?? 0),
      200,
    );
    return () => window.clearInterval(timer);
  }, [state]);

  const toggle = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (controller.state === "recording") void controller.stop();
    else if (controller.state === "idle") void controller.start();
  }, []);

  return { state, elapsedMs, toggle };
}
```

Note: the controller is created with `mime: null` in `start()`. To honor `pickRecordingMime`, update `DictationController.start` to receive the mime from a new dep. Add `getMime?: () => string | null` to `DictationDeps` and use `this.deps.getMime?.() ?? null` when calling `createRecorder`, then wire `getMime: () => pickRecordingMime()` in the hook. Do this small change in Task 3's `dictation.ts` now and add a test asserting the resolver is used.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit (only if authorized)**

```bash
git add src/hooks/useDictation.ts src/lib/dictation.ts src/lib/dictation.test.ts
git commit -m "Add useDictation hook"
```

---

### Task 5: Voice preferences

**Files:**
- Modify: `src/lib/settings.ts`
- Test: `src/lib/settings.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type VoiceLanguage = "auto" | "pt" | "en" | "es"`
  - `loadVoiceEnabled() / saveVoiceEnabled()`, default `false`
  - `loadVoiceModel() / saveVoiceModel()` returning `VoiceModel`, default `"gpt-4o-transcribe"`
  - `loadVoiceLanguage() / saveVoiceLanguage()`, default `"auto"`
  - `loadVoicePrompt() / saveVoicePrompt()`, default `""`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/settings.test.ts`:

```ts
import {
  loadVoiceEnabled,
  loadVoiceLanguage,
  loadVoiceModel,
  loadVoicePrompt,
  saveVoiceEnabled,
  saveVoiceLanguage,
  saveVoiceModel,
  saveVoicePrompt,
} from "./settings";

describe("voice settings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to disabled with the full model", () => {
    expect(loadVoiceEnabled()).toBe(false);
    expect(loadVoiceModel()).toBe("gpt-4o-transcribe");
    expect(loadVoiceLanguage()).toBe("auto");
    expect(loadVoicePrompt()).toBe("");
  });

  it("round-trips values", () => {
    saveVoiceEnabled(true);
    saveVoiceModel("gpt-4o-mini-transcribe");
    saveVoiceLanguage("pt");
    saveVoicePrompt("termos do projeto");
    expect(loadVoiceEnabled()).toBe(true);
    expect(loadVoiceModel()).toBe("gpt-4o-mini-transcribe");
    expect(loadVoiceLanguage()).toBe("pt");
    expect(loadVoicePrompt()).toBe("termos do projeto");
  });

  it("rejects unknown model and language values", () => {
    localStorage.setItem("monocode.voiceModel", "nope");
    localStorage.setItem("monocode.voiceLanguage", "xx");
    expect(loadVoiceModel()).toBe("gpt-4o-transcribe");
    expect(loadVoiceLanguage()).toBe("auto");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/settings.test.ts`
Expected: FAIL — the voice exports do not exist.

- [ ] **Step 3: Implement the preferences**

Append to `src/lib/settings.ts`:

```ts
const VOICE_ENABLED_KEY = "monocode.voiceEnabled";
const VOICE_MODEL_KEY = "monocode.voiceModel";
const VOICE_LANGUAGE_KEY = "monocode.voiceLanguage";
const VOICE_PROMPT_KEY = "monocode.voicePrompt";

export type VoiceModel = "gpt-4o-transcribe" | "gpt-4o-mini-transcribe";
export type VoiceLanguage = "auto" | "pt" | "en" | "es";

export const VOICE_ENABLED_DEFAULT = false;
export const VOICE_MODEL_DEFAULT: VoiceModel = "gpt-4o-transcribe";
export const VOICE_LANGUAGE_DEFAULT: VoiceLanguage = "auto";

function isVoiceModel(value: unknown): value is VoiceModel {
  return value === "gpt-4o-transcribe" || value === "gpt-4o-mini-transcribe";
}

function isVoiceLanguage(value: unknown): value is VoiceLanguage {
  return value === "auto" || value === "pt" || value === "en" || value === "es";
}

export function loadVoiceEnabled(): boolean {
  try {
    const raw = localStorage.getItem(VOICE_ENABLED_KEY);
    return raw === "1" || raw === "true";
  } catch {
    return VOICE_ENABLED_DEFAULT;
  }
}

export function saveVoiceEnabled(value: boolean) {
  try {
    localStorage.setItem(VOICE_ENABLED_KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
}

export function loadVoiceModel(): VoiceModel {
  try {
    const raw = localStorage.getItem(VOICE_MODEL_KEY);
    return isVoiceModel(raw) ? raw : VOICE_MODEL_DEFAULT;
  } catch {
    return VOICE_MODEL_DEFAULT;
  }
}

export function saveVoiceModel(value: VoiceModel) {
  try {
    localStorage.setItem(VOICE_MODEL_KEY, value);
  } catch {
    // private mode / quota
  }
}

export function loadVoiceLanguage(): VoiceLanguage {
  try {
    const raw = localStorage.getItem(VOICE_LANGUAGE_KEY);
    return isVoiceLanguage(raw) ? raw : VOICE_LANGUAGE_DEFAULT;
  } catch {
    return VOICE_LANGUAGE_DEFAULT;
  }
}

export function saveVoiceLanguage(value: VoiceLanguage) {
  try {
    localStorage.setItem(VOICE_LANGUAGE_KEY, value);
  } catch {
    // private mode / quota
  }
}

export function loadVoicePrompt(): string {
  try {
    return localStorage.getItem(VOICE_PROMPT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveVoicePrompt(value: string) {
  try {
    localStorage.setItem(VOICE_PROMPT_KEY, value);
  } catch {
    // private mode / quota
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts
git commit -m "Add voice input preferences"
```

---

### Task 6: Settings Voice input section

**Files:**
- Modify: `src/lib/settings.ts` (section id)
- Modify: `src/surfaces/SettingsView.tsx`
- Modify: `src/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: Task 5 preferences, Task 2 key commands.
- Produces: a `voice` settings section rendering a key field, model/language selects, prompt, and enable toggle.

- [ ] **Step 1: Add the section id**

In `src/lib/settings.ts`, add `"voice"` to `SettingsSectionId` and a row to `SETTINGS_SECTIONS` after `"providers"`:

```ts
  {
    id: "voice",
    label: "Voice input",
    description: "Dictate prompts with OpenAI transcription.",
  },
```

- [ ] **Step 2: Build the page**

In `src/surfaces/SettingsView.tsx`, import the voice helpers and render the page. Add near the other page conditionals:

```tsx
{section === "voice" ? <VoicePage /> : null}
```

Add the component (uses the existing `Row`, `Heading`, `Toggle`, `Select`, `SecondaryButton`, `PageHeader` primitives):

```tsx
function VoicePage() {
  const [enabled, setEnabled] = useState(loadVoiceEnabled);
  const [model, setModel] = useState(loadVoiceModel);
  const [language, setLanguage] = useState(loadVoiceLanguage);
  const [prompt, setPrompt] = useState(loadVoicePrompt);
  const [keyDraft, setKeyDraft] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void voiceHasApiKey().then(setHasKey).catch(() => setHasKey(false));
  }, []);

  const saveKey = () => {
    if (!keyDraft.trim()) return;
    setBusy(true);
    setStatus(null);
    void voiceSetApiKey(keyDraft)
      .then(() => {
        setKeyDraft("");
        setHasKey(true);
        setStatus(t("Key saved to the macOS Keychain."));
      })
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setBusy(false));
  };

  const removeKey = () => {
    setBusy(true);
    setStatus(null);
    void voiceClearApiKey()
      .then(() => {
        setHasKey(false);
        setStatus(t("Key removed."));
      })
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setBusy(false));
  };

  return (
    <Page>
      <PageHeader
        title={t("Voice input")}
        description={t("Dictate prompts with OpenAI transcription.")}
      />
      <section>
        <Heading title={t("Voice input")} first />
        <Row
          label={t("Enable dictation")}
          description={t("Show a microphone button in the composer.")}
        >
          <Toggle
            label={t("Enable dictation")}
            on={enabled}
            onChange={(next) => {
              setEnabled(next);
              saveVoiceEnabled(next);
            }}
          />
        </Row>
        <Row
          label={t("Model")}
          description={t("Full is more accurate; mini is cheaper.")}
        >
          <Select
            label={t("Model")}
            value={model}
            onChange={(value) => {
              const next =
                value === "gpt-4o-mini-transcribe"
                  ? "gpt-4o-mini-transcribe"
                  : "gpt-4o-transcribe";
              setModel(next);
              saveVoiceModel(next);
            }}
            options={[
              { value: "gpt-4o-transcribe", label: "GPT-4o Transcribe" },
              { value: "gpt-4o-mini-transcribe", label: "GPT-4o Mini Transcribe" },
            ]}
          />
        </Row>
        <Row
          label={t("Language")}
          description={t("Auto lets OpenAI detect the language.")}
        >
          <Select
            label={t("Language")}
            value={language}
            onChange={(value) => {
              const next =
                value === "pt" || value === "en" || value === "es" ? value : "auto";
              setLanguage(next);
              saveVoiceLanguage(next);
            }}
            options={[
              { value: "auto", label: t("Auto") },
              { value: "pt", label: "Português" },
              { value: "en", label: "English" },
              { value: "es", label: "Español" },
            ]}
          />
        </Row>
        <Row
          label={t("Context prompt")}
          description={t("Names and terms the transcription should expect.")}
        >
          <input
            type="text"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onBlur={() => saveVoicePrompt(prompt)}
            className="w-64 rounded-md border border-content/10 bg-content/5 px-2 py-1 text-[12px] text-content outline-none"
          />
        </Row>
        <Row
          label={t("OpenAI API key")}
          description={
            hasKey
              ? t("Saved in the macOS Keychain. The value is never shown again.")
              : t("Stored in the macOS Keychain, never in this app's storage.")
          }
        >
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={keyDraft}
              placeholder={hasKey ? "••••••••" : "sk-…"}
              onChange={(event) => setKeyDraft(event.target.value)}
              className="w-48 rounded-md border border-content/10 bg-content/5 px-2 py-1 text-[12px] text-content outline-none"
            />
            <SecondaryButton onClick={saveKey} disabled={busy || !keyDraft.trim()}>
              {t("Save")}
            </SecondaryButton>
            {hasKey ? (
              <SecondaryButton onClick={removeKey} disabled={busy}>
                {t("Remove")}
              </SecondaryButton>
            ) : null}
          </div>
        </Row>
        {status ? (
          <Row label={t("Status")} description={status}>
            <span />
          </Row>
        ) : null}
      </section>
    </Page>
  );
}
```

Confirm the exact wrapper used by other pages (`<Page>`, `<section>`, `Heading`, `Row`, `PageHeader`) by reading `ProvidersPage` and `GeneralPage` and match their structure. If `Page` does not exist, use the same top-level wrapper the neighboring pages use.

- [ ] **Step 3: Add Portuguese strings**

Append entries to `src/i18n/pt-BR.ts` keyed by the exact English strings used above, for example:

```ts
  "Voice input": "Entrada por voz",
  "Dictate prompts with OpenAI transcription.":
    "Dite prompts com a transcrição da OpenAI.",
  "Enable dictation": "Ativar ditado",
  "Show a microphone button in the composer.":
    "Mostra um botão de microfone no compositor.",
  "Full is more accurate; mini is cheaper.":
    "O full é mais preciso; o mini é mais barato.",
  "Auto lets OpenAI detect the language.":
    "Automático deixa a OpenAI detectar o idioma.",
  "Names and terms the transcription should expect.":
    "Nomes e termos que a transcrição deve esperar.",
  "Context prompt": "Prompt de contexto",
  "OpenAI API key": "Chave de API da OpenAI",
  "Saved in the macOS Keychain. The value is never shown again.":
    "Salva no Keychain do macOS. O valor nunca é exibido de novo.",
  "Stored in the macOS Keychain, never in this app's storage.":
    "Guardada no Keychain do macOS, nunca no armazenamento do app.",
  "Key saved to the macOS Keychain.": "Chave salva no Keychain do macOS.",
  "Key removed.": "Chave removida.",
  "Status": "Status",
  "Auto": "Automático",
  "Model": "Modelo",
  "Language": "Idioma",
  "Save": "Salvar",
  "Remove": "Remover",
```

- [ ] **Step 4: Type-check and run the web tests**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/lib/settings.ts src/surfaces/SettingsView.tsx src/i18n/pt-BR.ts
git commit -m "Add Voice input settings section"
```

---

### Task 7: Composer microphone button

**Files:**
- Modify: `src/chrome/icons.tsx`
- Modify: `src/chrome/Composer.tsx`

**Interfaces:**
- Consumes: `useDictation` (Task 4), `insertAtCursor` (Task 2), Task 5 preferences.
- Produces: a mic button left of the send button; transcribed text inserted at the cursor.

- [ ] **Step 1: Add icons**

In `src/chrome/icons.tsx`, add the imports and exports:

```tsx
import Mic01Icon from "@hugeicons/core-free-icons/Mic01Icon";
import SquareStopIcon from "@hugeicons/core-free-icons/SquareStopIcon";
```

```tsx
export const Mic = wrap(Mic01Icon, "Mic");
export const SquareStop = wrap(SquareStopIcon, "SquareStop");
```

- [ ] **Step 2: Wire the composer**

In `src/chrome/Composer.tsx`:
- Import `Mic` and `SquareStop` from `./icons` (add to the existing icon import list).
- Import `Loader` is already available in that file; if not, add it.
- Import `insertAtCursor` from `../lib/transcribe`.
- Import `useDictation` from `../hooks/useDictation`.
- Import `loadVoiceEnabled, loadVoiceLanguage, loadVoiceModel, loadVoicePrompt` from `../lib/settings`.
- Import `speak`/error surface: use the existing `playCue` only; render an inline error line.

Add state and the hook inside `Composer`:

```tsx
const [voiceEnabled, setVoiceEnabled] = useState(loadVoiceEnabled);
const [voiceError, setVoiceError] = useState<string | null>(null);
useEffect(() => {
  const onStorage = () => setVoiceEnabled(loadVoiceEnabled());
  window.addEventListener("focus", onStorage);
  return () => window.removeEventListener("focus", onStorage);
}, []);

const dictation = useDictation({
  enabled: voiceEnabled,
  getOptions: () => ({
    model: loadVoiceModel(),
    language: loadVoiceLanguage(),
    prompt: loadVoicePrompt(),
  }),
  onText: (text) => {
    const el = ref.current;
    if (!el) return;
    const next = insertAtCursor(el, text);
    resizeTextarea(el);
    setDraft(next);
    onDraftChange?.(next);
    syncHasValue(next, attachmentsRef.current);
    syncTokensFromTextarea(el);
    el.focus();
  },
  onError: (message) => setVoiceError(message),
});
```

Render the button immediately before `<ComposerAction ... />`:

```tsx
{voiceEnabled ? (
  <button
    type="button"
    title={
      dictation.state === "recording"
        ? t("Stop recording")
        : dictation.state === "transcribing"
          ? t("Transcribing…")
          : t("Dictate")
    }
    aria-label={
      dictation.state === "recording"
        ? t("Stop recording")
        : dictation.state === "transcribing"
          ? t("Transcribing…")
          : t("Dictate")
    }
    disabled={dictation.state === "transcribing" || busy}
    onClick={() => {
      setVoiceError(null);
      dictation.toggle();
    }}
    className={`grid size-6.5 shrink-0 place-items-center rounded-md ${
      dictation.state === "recording"
        ? "bg-red-500/90 text-white hover:bg-red-500"
        : "bg-content/10 text-content/50 hover:bg-content/15 hover:text-content"
    } disabled:opacity-40`}
  >
    {dictation.state === "recording" ? (
      <span className="flex items-center gap-1">
        <SquareStop className="size-3.5" />
        <span className="font-mono text-[10px] tabular-nums">
          {Math.floor(dictation.elapsedMs / 1000)}s
        </span>
      </span>
    ) : dictation.state === "transcribing" ? (
      <Loader className="size-3.5 animate-spin" />
    ) : (
      <Mic className="size-3.5" />
    )}
  </button>
) : null}
```

Add an inline error line under the composer box, after the send row:

```tsx
{voiceError ? (
  <p className="px-3 pb-1 text-[11px] text-red-400">{voiceError}</p>
) : null}
```

Add an Escape handler so it cancels while recording: in `onKeyDown`, before other handling, add:

```tsx
if (e.key === "Escape" && dictation.state === "recording") {
  e.preventDefault();
  dictation.cancel();
  return;
}
```

- [ ] **Step 3: Type-check, lint, and run the web tests**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit (only if authorized)**

```bash
git add src/chrome/icons.tsx src/chrome/Composer.tsx src/i18n/pt-BR.ts
git commit -m "Add composer microphone dictation button"
```

---

### Task 8: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full web check**

Run: `npm run check:web`
Expected: all tests pass, `tsc` clean.

- [ ] **Step 2: Run the Rust check**

Run: `npm run check:rust`
Expected: `cargo fmt --check`, `cargo clippy`, and `cargo test` all pass.

- [ ] **Step 3: Manual macOS test in `npm run tauri dev`**

1. Settings → Voice input: enable, save a valid OpenAI key, choose `gpt-4o-transcribe`, language `pt`, and confirm the key status says saved. Confirm the key string does not appear in `localStorage` (DevTools → Application → Local Storage).
2. Composer: click the mic, speak in Portuguese, click stop. The button shows a red square with a timer while recording, then a spinner, then the text appears at the cursor.
3. Press Esc mid-recording: it cancels and inserts nothing.
4. Remove the key and try again: the request fails with the missing-key message (in practice, re-check via Settings).
5. Deny microphone permission in System Settings → Privacy & Security → Microphone, then try recording: a clear permission error appears, not a crash.

- [ ] **Step 4: Record results**

Report pass/fail for each manual step, and attach the exact error text for any failure.

---

## Self-Review

**Spec coverage:**
- Microphone button left of send — Task 7.
- Record with MediaRecorder — Tasks 3, 7.
- Transcribe via OpenAI — Task 1.
- Insert at cursor, never auto-send — Tasks 2, 7.
- Key in keychain, never in frontend — Task 1 (and constraint enforced by tests in Task 1 and absence from Task 5 storage).
- Voice settings section — Tasks 5, 6.
- macOS usage description + entitlement — Task 1.
- Error handling — Tasks 1 (status mapping), 3 (failures), 7 (inline error).
- Browser/harness untouched — no task modifies them.

**Placeholder scan:** none.

**Type consistency:** `VoiceModel` is defined in both `transcribe.ts` (Task 2) and `settings.ts` (Task 5). During Task 5, import the type from `./transcribe` and re-export from `settings.ts` to keep one source of truth, or change `settings.ts` to `import type { VoiceModel } from "./transcribe";` and re-export it. Do not define two different unions.
