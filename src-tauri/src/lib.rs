use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Emitter, LogicalSize, Manager, Size};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Thread-safe flags shared between shortcut handlers and commands.
static GHOST_MODE: AtomicBool = AtomicBool::new(false);
static CONTENT_PROTECTED: AtomicBool = AtomicBool::new(true);

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn toggle_always_on_top(window: tauri::Window) {
    let always_on_top = window.is_always_on_top().unwrap_or(false);
    window.set_always_on_top(!always_on_top).unwrap();
}

#[tauri::command]
fn toggle_content_protected(window: tauri::Window) -> bool {
    let new_state = !CONTENT_PROTECTED.load(Ordering::SeqCst);
    CONTENT_PROTECTED.store(new_state, Ordering::SeqCst);
    let _ = window.set_content_protected(new_state);
    let _ = window.emit("content-protected-changed", new_state);
    new_state
}

#[tauri::command]
fn set_window_expanded(window: tauri::Window, expanded: bool) -> Result<(), String> {
    let width = if expanded { 1200.0 } else { 730.0 };
    window
        .set_size(Size::Logical(LogicalSize { width, height: 730.0 }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_stealth_state() -> serde_json::Value {
    serde_json::json!({
        "ghostMode": GHOST_MODE.load(Ordering::SeqCst),
        "contentProtected": CONTENT_PROTECTED.load(Ordering::SeqCst),
    })
}

// ── App entry ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ── Screen capture exclusion (on by default) ────────────────
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_content_protected(true);
            }

            // ── Ctrl+Shift+Space → toggle always-on-top ─────────────────
            let handle = app.handle().clone();
            app.global_shortcut().on_shortcut("Ctrl+Shift+Space", move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if let Some(window) = handle.get_webview_window("main") {
                        let always_on_top = window.is_always_on_top().unwrap_or(false);
                        let _ = window.set_always_on_top(!always_on_top);
                    }
                }
            })?;

            // ── Ctrl+Shift+G → toggle ghost / click-through mode ────────
            let handle2 = app.handle().clone();
            app.global_shortcut().on_shortcut("Ctrl+Shift+G", move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if let Some(window) = handle2.get_webview_window("main") {
                        let new_state = !GHOST_MODE.load(Ordering::SeqCst);
                        GHOST_MODE.store(new_state, Ordering::SeqCst);
                        let _ = window.set_ignore_cursor_events(new_state);
                        let _ = window.emit("ghost-mode-changed", new_state);
                    }
                }
            })?;

            // ── Ctrl+Shift+C → capture screen ───────────────────────────
            let handle3 = app.handle().clone();
            app.global_shortcut().on_shortcut("Ctrl+Shift+C", move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if let Some(window) = handle3.get_webview_window("main") {
                        let _ = window.emit("capture-screen-shortcut", ());
                    }
                }
            })?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_always_on_top,
            toggle_content_protected,
            set_window_expanded,
            get_stealth_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
