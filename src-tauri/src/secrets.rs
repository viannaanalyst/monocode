#[cfg(target_os = "macos")]
const SERVICE: &str = "MonoCode";
#[cfg(target_os = "macos")]
const ACCOUNT: &str = "openai_api_key";

/// Collapse an underlying error into a fixed, secret-free message. The raw
/// error is deliberately dropped so a failing backend can never leak key
/// material through an IPC error string.
pub(crate) fn sanitize_error(_error: impl std::fmt::Display, fallback: &str) -> String {
    fallback.to_string()
}

/// Read the OpenAI key from the OS keychain. Only ever called inside Rust.
#[cfg(target_os = "macos")]
pub(crate) fn read_api_key() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT)
        .map_err(|error| sanitize_error(error, "Could not read the API key."))?;
    match entry.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(sanitize_error(error, "Could not read the API key.")),
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
        let entry = keyring::Entry::new(SERVICE, ACCOUNT)
            .map_err(|error| sanitize_error(error, "Could not save the API key."))?;
        entry
            .set_password(&value)
            .map_err(|error| sanitize_error(error, "Could not save the API key."))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = value;
        Err("Voice input is available on macOS only for now.".to_string())
    }
}

#[tauri::command]
pub fn voice_clear_api_key() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let entry = keyring::Entry::new(SERVICE, ACCOUNT)
            .map_err(|error| sanitize_error(error, "Could not remove the API key."))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => {
                return Err(sanitize_error(error, "Could not remove the API key."));
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Voice input is available on macOS only for now.".to_string())
    }
}

#[tauri::command]
pub fn voice_has_api_key() -> Result<bool, String> {
    Ok(read_api_key()?.is_some())
}
