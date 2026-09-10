use std::sync::mpsc;
use std::time::Duration;

use base64::Engine;
use tauri::Manager;

fn webview(
    app: &tauri::AppHandle,
    label: &str,
) -> Result<tauri::Webview<tauri::Wry>, String> {
    app.get_webview(label)
        .ok_or_else(|| format!("webview not found: {label}"))
}

#[tauri::command]
pub async fn browser_eval(
    app: tauri::AppHandle,
    label: String,
    script: String,
) -> Result<(), String> {
    webview(&app, &label)?
        .eval(script)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn browser_eval_js(
    app: tauri::AppHandle,
    label: String,
    script: String,
) -> Result<String, String> {
    let view = webview(&app, &label)?;
    let (tx, rx) = mpsc::channel();
    view.eval_with_callback(script, move |result| {
        let _ = tx.send(result);
    })
    .map_err(|err| err.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(Duration::from_secs(4))
            .map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn browser_url(app: tauri::AppHandle, label: String) -> Result<String, String> {
    webview(&app, &label)?
        .url()
        .map(|url| url.to_string())
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn browser_reload(app: tauri::AppHandle, label: String) -> Result<(), String> {
    webview(&app, &label)?
        .reload()
        .map_err(|err| err.to_string())
}

/// Screen-space capture of the webview (logical points). macOS only.
#[tauri::command]
pub async fn browser_screenshot_rect(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        if width < 2.0 || height < 2.0 {
            return Err("browser pane is too small to capture".into());
        }
        let path = std::env::temp_dir().join(format!(
            "monocode-browser-{}.png",
            std::process::id()
        ));
        let region = format!("{x},{y},{width},{height}");
        let path_str = path.to_str().ok_or("bad temp path")?;
        let status = std::process::Command::new("screencapture")
            .args(["-x", "-t", "png", "-R", &region, path_str])
            .status()
            .map_err(|err| err.to_string())?;
        if !status.success() {
            return Err("screencapture failed".into());
        }
        let bytes = std::fs::read(&path).map_err(|err| err.to_string())?;
        let _ = std::fs::remove_file(&path);
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (x, y, width, height);
        Err("screenshot is only available on macOS".into())
    }
}
