# Voice input design

## Goal

Let the user dictate a prompt from the composer: a microphone button records audio, the audio is transcribed by OpenAI, and the resulting text is inserted at the composer cursor for review before sending. Transcription must be high quality for technical Brazilian Portuguese, so the default model is `gpt-4o-transcribe`.

## Scope

- Add a microphone action to the composer action row, immediately left of the send/stop button.
- Record with `MediaRecorder` from `navigator.mediaDevices.getUserMedia({ audio: true })`.
- Transcribe through OpenAI `POST /v1/audio/transcriptions`.
- Insert the returned text at the composer cursor. Never auto-send.
- Store the OpenAI API key in the OS keychain, never in the frontend.
- Add a Voice input section in Settings: enable, model, language, context prompt, and API key management.
- Target macOS first (microphone usage description and audio-input entitlement). Windows and Linux are out of scope for this change.
- Do not touch the in-app browser or the browser agent tools.

## Security: the API key must never leak

This is a hard requirement.

- The key lives only in the OS keychain (service `MonoCode`, account `openai_api_key`) via the Rust `keyring` crate.
- No IPC command ever returns the key. The frontend can only ask whether a key exists (`voice_has_api_key() -> bool`), set a new value, or clear it.
- The OpenAI request is built and sent in Rust. The key is read from the keychain in that same process, used to build the `Authorization` header, and never serialized back across IPC.
- The key must never appear in logs, error messages, session storage, toasts, or the transcript.
- Error mapping must not echo the key or the raw `Authorization` header.

## Design

### Rust

New module `src-tauri/src/secrets.rs`:

- `voice_set_api_key(value: String)` writes the key to the keychain.
- `voice_clear_api_key()` deletes it.
- `voice_has_api_key() -> Result<bool, String>` reports presence only.
- A crate-internal `read_api_key() -> Result<String, String>` used by `transcribe.rs`; not exposed as an IPC command.

New module `src-tauri/src/transcribe.rs`:

- `transcribe_audio(audio: Vec<u8>, mime: String, model: String, language: Option<String>, prompt: Option<String>) -> Result<String, String>`.
- Reads the key from the keychain. If absent, returns a typed "missing key" error the frontend turns into "open Settings".
- Builds a `multipart/form-data` body with a boundary (no new dependency; `ureq` is already used) containing `file`, `model`, optional `language`, and optional `prompt`.
- Sends with a 60s timeout. Parses the JSON `text` field.
- Maps status codes to friendly, key-free messages: 401 -> invalid key, 429 -> rate limit, 413 -> audio too large, other -> generic API error.
- Guards request size against the 25 MB limit and returns "audio too large" without uploading.

Commands are registered in `src-tauri/src/lib.rs`.

### Frontend

New `src/lib/transcribe.ts`:

- Picks the best supported `MediaRecorder` mime type (prefer AAC/MP4 on WKWebView, then Opus/WebM).
- `startRecording()` / `stopRecording(): Promise<Blob>` and a `cancelRecording()`.
- `insertAtCursor(textarea, text)` inserts at the current selection, adding a separating space when needed, and returns the new value.
- `transcribeBlob(blob, opts)` invokes `transcribe_audio`.

New `src/hooks/useDictation.ts`:

- State machine `idle -> recording -> transcribing -> idle | error`, with an elapsed timer and cancel.
- Owns the `MediaRecorder`, stream tracks, and cleanup on unmount.

`src/chrome/Composer.tsx`:

- Adds a microphone button in the action row, immediately left of `ComposerAction`.
- Uses the existing `ToolButton`/`Tooltip` primitives and new icons in `src/chrome/icons.tsx` (mic, stop, spinner).
- Recording: red stop icon plus elapsed time; tooltip "Stop recording". Transcribing: spinner; tooltip "Transcribing…". Idle: microphone; tooltip "Dictate".
- Esc cancels the current recording.

`src/surfaces/SettingsView.tsx` and `src/lib/settings.ts`:

- Voice input section: enable toggle, model select (`gpt-4o-transcribe` default, `gpt-4o-mini-transcribe`), language (`Auto`, `pt`, `en`, …), context prompt text area, and an API key field with Save/Remove plus a Test button.
- The key field shows a stored/not-stored state and never re-displays the saved value.
- The microphone button only appears when voice input is enabled.

### Data flow

Microphone -> `MediaRecorder` -> `Blob` -> `ArrayBuffer` -> `invoke("transcribe_audio")` -> Rust reads key + posts multipart -> text -> `insertAtCursor` -> composer focused.

### macOS

- `src-tauri/Info.plist`: add `NSMicrophoneUsageDescription`.
- `src-tauri/Entitlements.plist`: add `com.apple.security.device.audio-input`.
- Check and request native microphone permission before `getUserMedia`, so the OS prompt appears once and errors are clear.
- Verify `getUserMedia` works in the WKWebView on both `tauri dev` and a notarized release; if the webview blocks media capture, handle the webview media-capture permission delegate.

### Error handling

- No key: toast plus open the Voice input Settings section.
- Permission denied: toast pointing to System Settings > Privacy & Security > Microphone.
- Network/API error: toast with a key-free message; discard the audio and let the user record again.
- Empty transcription: toast asking the user to try again.

## Testing and verification

- Frontend unit tests: `insertAtCursor` (empty field, cursor in the middle, trailing space), and the `useDictation` state machine with a fake `MediaRecorder`.
- Rust unit tests: multipart body builder and response parser as pure functions; error mapping does not include the key.
- Run the web test suite, TypeScript check, and the Rust check.
- Manually verify on macOS: enable voice input, save a key, record, insert text, cancel with Esc, missing-key and denied-permission paths, and the Test button.
- Confirm the key is absent from localStorage and from the settings payload.
