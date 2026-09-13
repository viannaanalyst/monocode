use std::sync::Mutex;
#[cfg(target_os = "macos")]
use tauri::menu::{AboutMetadata, Menu, MenuItemBuilder, SubmenuBuilder};
#[cfg(target_os = "macos")]
use tauri::Wry;
use tauri::{AppHandle, Emitter, Manager};

static MENU_LOCALE: Mutex<String> = Mutex::new(String::new());

#[cfg(target_os = "macos")]
fn tr(en: &str) -> String {
    let locale = MENU_LOCALE
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_default();
    if locale != "pt-BR" {
        return en.to_string();
    }
    match en {
        "Settings…" => "Ajustes…",
        "Check for Updates…" => "Buscar atualizações…",
        "New Window" => "Nova janela",
        "Open Project…" => "Abrir projeto…",
        "Go to File…" => "Ir para arquivo…",
        "Search…" => "Buscar…",
        "Inbox" => "Inbox",
        "Notes" => "Notas",
        "New Tab" => "Nova aba",
        "New Terminal" => "Novo terminal",
        "New Terminal Tab" => "Nova aba de terminal",
        "Toggle Terminal" => "Alternar terminal",
        "Split Pane Right" => "Dividir painel à direita",
        "Split Pane Down" => "Dividir painel abaixo",
        "Close Pane" => "Fechar painel",
        "Close Other Tabs" => "Fechar outras abas",
        "Close All Tabs" => "Fechar todas as abas",
        "Next Tab" => "Próxima aba",
        "Previous Tab" => "Aba anterior",
        "Go Back" => "Voltar",
        "Go Forward" => "Avançar",
        "Focus Pane Left" => "Focar painel à esquerda",
        "Focus Pane Right" => "Focar painel à direita",
        "Focus Pane Up" => "Focar painel acima",
        "Focus Pane Down" => "Focar painel abaixo",
        "Toggle Sidebar" => "Alternar barra lateral",
        "Switch Model…" => "Trocar modelo…",
        "Sidebar Appearance…" => "Aparência da barra lateral…",
        "Zoom In" => "Aumentar zoom",
        "Zoom Out" => "Diminuir zoom",
        "Reset Zoom" => "Redefinir zoom",
        "Find" => "Localizar",
        "Find in Files…" => "Buscar nos arquivos…",
        "File" => "Arquivo",
        "View" => "Exibir",
        "Edit" => "Editar",
        "Quit MonoCode" => "Sair do MonoCode",
        "Window" => "Janela",
        _ => en,
    }
    .to_string()
}

#[tauri::command]
pub fn set_menu_locale(app: AppHandle, locale: String) -> Result<(), String> {
    if let Ok(mut guard) = MENU_LOCALE.lock() {
        *guard = locale;
    }
    install(&app).map_err(|e| e.to_string())
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    app.set_menu(build(app)?)?;
    let _ = app;
    Ok(())
}

pub fn dispatch(app: &AppHandle, id: &str) {
    match id {
        "new_window" => {
            let _ = crate::window::open_new_window(app);
        }
        "quit" => crate::window::request_quit(app),
        "new_tab" | "close_tab" | "close_other_tabs" | "next_tab" | "prev_tab" | "back_tab"
        | "forward_tab" | "split_right" | "split_down" | "focus_left" | "focus_right"
        | "focus_up" | "focus_down" | "toggle_sidebar" | "sidebar_opacity" | "open_project"
        | "go_to_file" | "open_search" | "open_inbox" | "open_notes" | "find_in_project"
        | "find" | "new_terminal" | "new_terminal_tab" | "toggle_terminal"
        | "open_model_picker" | "open_settings" | "check_for_updates" => {
            let _ = app.emit(id, ());
        }
        // Zoom and Close All Tabs target one window: a broadcast would make
        // every window act on a single menu click.
        "zoom_in" | "zoom_out" | "zoom_reset" | "close_all_tabs" => emit_to_focused(app, id),
        _ => {}
    }
}

/// Emit `id` to the focused window, falling back to a visible one, then any.
fn emit_to_focused(app: &AppHandle, id: &str) {
    let mut windows: Vec<_> = app.webview_windows().into_values().collect();
    windows.sort_by(|a, b| a.label().cmp(b.label()));
    let target = windows
        .iter()
        .find(|window| window.is_focused().unwrap_or(false))
        .or_else(|| {
            windows
                .iter()
                .find(|window| window.is_visible().unwrap_or(false))
        })
        .or(windows.first());
    match target {
        Some(window) => {
            let _ = app.emit_to(window.label(), id, ());
        }
        None => {
            let _ = app.emit(id, ());
        }
    }
}

#[cfg(target_os = "macos")]
fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let open_settings = MenuItemBuilder::with_id("open_settings", tr("Settings…"))
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let check_for_updates =
        MenuItemBuilder::with_id("check_for_updates", tr("Check for Updates…")).build(app)?;
    let new_window = MenuItemBuilder::with_id("new_window", tr("New Window"))
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;
    let open_project = MenuItemBuilder::with_id("open_project", tr("Open Project…"))
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let go_to_file = MenuItemBuilder::with_id("go_to_file", tr("Go to File…"))
        .accelerator("CmdOrCtrl+P")
        .build(app)?;
    let open_search = MenuItemBuilder::with_id("open_search", tr("Search…"))
        .accelerator("CmdOrCtrl+K")
        .build(app)?;
    let open_inbox = MenuItemBuilder::with_id("open_inbox", tr("Inbox")).build(app)?;
    let open_notes = MenuItemBuilder::with_id("open_notes", tr("Notes")).build(app)?;
    let new_tab = MenuItemBuilder::with_id("new_tab", tr("New Tab"))
        .accelerator("CmdOrCtrl+T")
        .build(app)?;
    let new_terminal = MenuItemBuilder::with_id("new_terminal", tr("New Terminal"))
        .accelerator("CmdOrCtrl+`")
        .build(app)?;
    let new_terminal_tab = MenuItemBuilder::with_id("new_terminal_tab", tr("New Terminal Tab"))
        .accelerator("CmdOrCtrl+Shift+`")
        .build(app)?;
    let toggle_terminal = MenuItemBuilder::with_id("toggle_terminal", tr("Toggle Terminal"))
        .accelerator("CmdOrCtrl+J")
        .build(app)?;
    let split_right = MenuItemBuilder::with_id("split_right", tr("Split Pane Right"))
        .accelerator("CmdOrCtrl+D")
        .build(app)?;
    let split_down = MenuItemBuilder::with_id("split_down", tr("Split Pane Down"))
        .accelerator("CmdOrCtrl+Shift+D")
        .build(app)?;
    let close_tab = MenuItemBuilder::with_id("close_tab", tr("Close Pane"))
        .accelerator("CmdOrCtrl+W")
        .build(app)?;
    let close_other_tabs = MenuItemBuilder::with_id("close_other_tabs", tr("Close Other Tabs"))
        .accelerator("CmdOrCtrl+Alt+T")
        .build(app)?;
    let close_all_tabs = MenuItemBuilder::with_id("close_all_tabs", tr("Close All Tabs"))
        .accelerator("CmdOrCtrl+Shift+W")
        .build(app)?;
    let next_tab = MenuItemBuilder::with_id("next_tab", tr("Next Tab"))
        .accelerator("CmdOrCtrl+Shift+]")
        .build(app)?;
    let prev_tab = MenuItemBuilder::with_id("prev_tab", tr("Previous Tab"))
        .accelerator("CmdOrCtrl+Shift+[")
        .build(app)?;
    let back_tab = MenuItemBuilder::with_id("back_tab", tr("Go Back"))
        .accelerator("CmdOrCtrl+[")
        .build(app)?;
    let forward_tab = MenuItemBuilder::with_id("forward_tab", tr("Go Forward"))
        .accelerator("CmdOrCtrl+]")
        .build(app)?;

    let focus_left = MenuItemBuilder::with_id("focus_left", tr("Focus Pane Left"))
        .accelerator("CmdOrCtrl+Alt+Left")
        .build(app)?;
    let focus_right = MenuItemBuilder::with_id("focus_right", tr("Focus Pane Right"))
        .accelerator("CmdOrCtrl+Alt+Right")
        .build(app)?;
    let focus_up = MenuItemBuilder::with_id("focus_up", tr("Focus Pane Up"))
        .accelerator("CmdOrCtrl+Alt+Up")
        .build(app)?;
    let focus_down = MenuItemBuilder::with_id("focus_down", tr("Focus Pane Down"))
        .accelerator("CmdOrCtrl+Alt+Down")
        .build(app)?;

    let toggle_sidebar = MenuItemBuilder::with_id("toggle_sidebar", tr("Toggle Sidebar"))
        .accelerator("CmdOrCtrl+B")
        .build(app)?;
    let open_model_picker = MenuItemBuilder::with_id("open_model_picker", tr("Switch Model…"))
        .accelerator("CmdOrCtrl+.")
        .build(app)?;
    let sidebar_opacity =
        MenuItemBuilder::with_id("sidebar_opacity", tr("Sidebar Appearance…")).build(app)?;
    // No accelerators here on purpose: the webview key handler owns
    // CmdOrCtrl + - 0, and a menu accelerator would fire the same command
    // a second time on top of it.
    let zoom_in = MenuItemBuilder::with_id("zoom_in", tr("Zoom In")).build(app)?;
    let zoom_out = MenuItemBuilder::with_id("zoom_out", tr("Zoom Out")).build(app)?;
    let zoom_reset = MenuItemBuilder::with_id("zoom_reset", tr("Reset Zoom")).build(app)?;
    let find = MenuItemBuilder::with_id("find", tr("Find"))
        .accelerator("CmdOrCtrl+F")
        .build(app)?;

    let find_in_project = MenuItemBuilder::with_id("find_in_project", tr("Find in Files…"))
        .accelerator("CmdOrCtrl+Shift+F")
        .build(app)?;

    let file = SubmenuBuilder::new(app, tr("File"))
        .item(&new_window)
        .item(&open_project)
        .item(&open_search)
        .item(&go_to_file)
        .item(&find_in_project)
        .separator()
        .item(&new_tab)
        .item(&new_terminal)
        .item(&new_terminal_tab)
        .item(&split_right)
        .item(&split_down)
        .item(&close_tab)
        .item(&close_other_tabs)
        .item(&close_all_tabs)
        .separator()
        .item(&prev_tab)
        .item(&next_tab)
        .item(&back_tab)
        .item(&forward_tab)
        .build()?;

    let view = SubmenuBuilder::new(app, tr("View"))
        .item(&toggle_sidebar)
        .item(&open_inbox)
        .item(&open_notes)
        .item(&toggle_terminal)
        .item(&open_model_picker)
        .separator()
        .item(&focus_left)
        .item(&focus_right)
        .item(&focus_up)
        .item(&focus_down)
        .separator()
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&zoom_reset)
        .separator()
        .item(&sidebar_opacity)
        .build()?;

    let edit = SubmenuBuilder::new(app, tr("Edit"))
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&find)
        .build()?;

    #[cfg(target_os = "macos")]
    {
        let quit = MenuItemBuilder::with_id("quit", tr("Quit MonoCode"))
            .accelerator("CmdOrCtrl+Q")
            .build(app)?;
        let app_menu = SubmenuBuilder::new(app, tr("MonoCode"))
            .about(Some(AboutMetadata::default()))
            .separator()
            .item(&open_settings)
            .item(&check_for_updates)
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .item(&quit)
            .build()?;
        let window_menu = SubmenuBuilder::new(app, tr("Window")).build()?;
        window_menu.set_as_windows_menu_for_nsapp()?;
        return Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window_menu]);
    }

    #[allow(unreachable_code)]
    Menu::with_items(app, &[&file, &edit, &view])
}
