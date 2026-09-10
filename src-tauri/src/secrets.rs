const SERVICE: &str = "MonoCode";
const ACCOUNT: &str = "openai_api_key";

/// Read the OpenAI key from the OS keychain. Only ever called inside Rust.
#[cfg(target_os = "macos")]
pub(crate) fn read_api_key() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|error| error.to_string())?;
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
        let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|error| error.to_string())?;
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
        let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|error| error.to_string())?;
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
