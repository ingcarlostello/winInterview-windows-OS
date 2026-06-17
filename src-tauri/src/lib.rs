use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};

use base64::Engine;
use image::{imageops, codecs::jpeg::JpegEncoder, DynamicImage};
use tauri::{Emitter, LogicalSize, Manager, Size};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use xcap::Monitor;

/// Thread-safe flags shared between shortcut handlers and commands.
static GHOST_MODE: AtomicBool = AtomicBool::new(false);
static CONTENT_PROTECTED: AtomicBool = AtomicBool::new(true);
static SHORTCUTS_ENABLED: AtomicBool = AtomicBool::new(false);
static INVISIBLE_MODE_ENABLED: AtomicBool = AtomicBool::new(false);
static GHOST_MODE_ENABLED: AtomicBool = AtomicBool::new(false);

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
async fn capture_screen(window: tauri::Window) -> Result<String, String> {
    let current_monitor_name = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .and_then(|m| m.name().map(|n| n.to_string()))
        .unwrap_or_default();

    tauri::async_runtime::spawn_blocking(move || {
        let monitors = Monitor::all().map_err(|e| format!("Failed to enumerate monitors: {e}"))?;
        let monitor = monitors
            .into_iter()
            .find(|m| m.name() == current_monitor_name)
            .or_else(|| Monitor::all().ok()?.into_iter().next())
            .ok_or_else(|| "No monitors found".to_string())?;

        let raw = monitor
            .capture_image()
            .map_err(|e| format!("Failed to capture monitor '{}': {e}", monitor.name()))?;
        let image = DynamicImage::ImageRgba8(raw);

        // Aspect-preserving resize with a fast filter
        let image = if image.width() > 1280 {
            image.resize(1280, u32::MAX, imageops::FilterType::Triangle)
        } else {
            image
        };

        let rgb_image = image.into_rgb8();

        let mut jpeg_bytes: Vec<u8> = Vec::new();
        {
            let mut cursor = Cursor::new(&mut jpeg_bytes);
            let mut encoder = JpegEncoder::new_with_quality(&mut cursor, 75);
            encoder
                .encode(
                    rgb_image.as_raw(),
                    rgb_image.width(),
                    rgb_image.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|e| format!("Failed to encode JPEG: {e}"))?;
        }

        Ok(base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes))
    })
    .await
    .map_err(|e| format!("Capture task panicked: {e}"))?
}

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
    let width = if expanded { 1400.0 } else { 730.0 };
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

#[tauri::command]
fn update_plan_permissions(
    shortcuts_enabled: bool,
    invisible_mode_enabled: bool,
    ghost_mode_enabled: bool,
) {
    SHORTCUTS_ENABLED.store(shortcuts_enabled, Ordering::SeqCst);
    INVISIBLE_MODE_ENABLED.store(invisible_mode_enabled, Ordering::SeqCst);
    GHOST_MODE_ENABLED.store(ghost_mode_enabled, Ordering::SeqCst);
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
                        let new_state = !always_on_top;
                        let _ = window.set_always_on_top(new_state);
                        let _ = window.emit("always-on-top-changed", new_state);
                    }
                }
            })?;

            // ── Ctrl+Shift+G → toggle ghost / click-through mode ────────
            let handle2 = app.handle().clone();
            app.global_shortcut().on_shortcut("Ctrl+Shift+G", move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if !GHOST_MODE_ENABLED.load(Ordering::SeqCst) {
                        return;
                    }
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
                    if !SHORTCUTS_ENABLED.load(Ordering::SeqCst) {
                        return;
                    }
                    if let Some(window) = handle3.get_webview_window("main") {
                        let _ = window.emit("capture-screen-shortcut", ());
                    }
                }
            })?;

            // ── Ctrl+Shift+P → pause / resume listening ─────────────────
            let handle4 = app.handle().clone();
            app.global_shortcut().on_shortcut("Ctrl+Shift+P", move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if !SHORTCUTS_ENABLED.load(Ordering::SeqCst) {
                        return;
                    }
                    if let Some(window) = handle4.get_webview_window("main") {
                        let _ = window.emit("pause-resume-shortcut", ());
                    }
                }
            })?;

            // ── Ctrl+Shift+B → toggle content protection ────────────────
            let handle5 = app.handle().clone();
            app.global_shortcut().on_shortcut("Ctrl+Shift+B", move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if !INVISIBLE_MODE_ENABLED.load(Ordering::SeqCst) {
                        return;
                    }
                    if let Some(window) = handle5.get_webview_window("main") {
                        let new_state = !CONTENT_PROTECTED.load(Ordering::SeqCst);
                        CONTENT_PROTECTED.store(new_state, Ordering::SeqCst);
                        let _ = window.set_content_protected(new_state);
                        let _ = window.emit("content-protected-changed", new_state);
                    }
                }
            })?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_screen,
            toggle_always_on_top,
            toggle_content_protected,
            set_window_expanded,
            get_stealth_state,
            update_plan_permissions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
