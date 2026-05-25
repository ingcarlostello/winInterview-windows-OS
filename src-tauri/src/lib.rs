use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[tauri::command]
fn toggle_always_on_top(window: tauri::Window) {
    let always_on_top = window.is_always_on_top().unwrap_or(false);
    window.set_always_on_top(!always_on_top).unwrap();
}

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

            let handle = app.handle().clone();
            app.global_shortcut().on_shortcut("Ctrl+Shift+Space", move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if let Some(window) = handle.get_webview_window("main") {
                        let always_on_top = window.is_always_on_top().unwrap_or(false);
                        let _ = window.set_always_on_top(!always_on_top);
                    }
                }
            })?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_always_on_top,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
