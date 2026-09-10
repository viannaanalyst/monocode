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
    let key = crate::secrets::read_api_key()?.ok_or_else(|| "MISSING_KEY".to_string())?;

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
