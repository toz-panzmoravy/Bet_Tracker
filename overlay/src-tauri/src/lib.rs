#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sysinfo::{get_current_pid, System};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::ShortcutState;

/// Ukončí ostatní běžící instance této aplikace (stejný název exe), ne aktuální proces.
#[cfg(target_os = "windows")]
fn kill_other_instances() {
    let Ok(self_pid) = get_current_pid() else { return };
    let sys = System::new_all();
    let name_lower = "bettracker-overlay";
    let product_name_lower = "bettracker overlay";

    for (pid, proc_) in sys.processes() {
        if pid == &self_pid {
            continue;
        }
        let pname = proc_.name().to_string_lossy().to_lowercase();
        if pname.contains(name_lower) || pname.contains(product_name_lower) {
            let _ = proc_.kill();
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn kill_other_instances() {}

#[tauri::command]
fn set_always_on_top(window: tauri::Window, value: bool) -> Result<(), String> {
    window.set_always_on_top(value).map_err(|e| e.to_string())
}

/// Zavře modal nastavení ve frontendu (pošle událost).
#[tauri::command]
fn close_settings_modal(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("close-settings", ()).map_err(|e| e.to_string())
}

/// Zajistí, že okno je vidět: vycentruje, odminimalizuje, zobrazí a nastaví fokus.
fn ensure_window_visible(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.center();
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    kill_other_instances();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut("Escape")
                .expect("Escape shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = app.emit("close-settings", ());
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![set_always_on_top, close_settings_modal])
        .setup(|app| {
            let app_handle = app.handle().clone();
            for &ms in &[1500_u64, 3000] {
                let handle = app_handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(ms));
                    let h = handle.clone();
                    handle.run_on_main_thread(move || ensure_window_visible(&h)).ok();
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BetTracker Overlay");
}
