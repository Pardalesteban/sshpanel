use std::sync::Mutex;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_autostart::{ManagerExt, MacosLauncher};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

struct BackendProcess(Mutex<Option<CommandChild>>);

/// Mata el sidecar y todo su árbol de procesos.
///
/// En Windows el sidecar es un onefile de PyInstaller: el bootloader spawnea
/// un proceso hijo que también mantiene abierto el .exe. Un kill() simple
/// solo mata al padre y el hijo deja el binario lockeado — eso hacía fallar
/// al instalador NSIS durante el auto-update. taskkill /T baja el árbol entero.
fn kill_backend_tree(child: CommandChild) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let pid = child.pid();
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = child.kill();
    }
}

/// Invocado desde el frontend justo antes de instalar un update, para que
/// el instalador no encuentre el binario del sidecar en uso.
#[tauri::command]
fn kill_backend(state: tauri::State<'_, BackendProcess>) {
    if let Some(child) = state.0.lock().unwrap().take() {
        kill_backend_tree(child);
    }
}

#[allow(dead_code)]
fn spawn_backend(app: &tauri::AppHandle) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let sidecar = app.shell().sidecar("sshpanel-backend")?;
    let (mut rx, child) = sidecar.spawn()?;

    // Drain stdout/stderr en background — solo descartamos
    tauri::async_runtime::spawn(async move {
        while let Some(_event) = rx.recv().await {
            // No logueamos; el backend ya escribe a su archivo si lo configurás
        }
    });

    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None, // sin args extras al autostart
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![kill_backend])
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            // Spawn del backend Python (solo en release; en dev usás `sshpanel app`)
            #[cfg(not(debug_assertions))]
            {
                match spawn_backend(&app.handle()) {
                    Ok(child) => {
                        let state: tauri::State<BackendProcess> = app.state();
                        *state.0.lock().unwrap() = Some(child);
                    }
                    Err(e) => {
                        eprintln!("No se pudo iniciar el backend: {}", e);
                    }
                }
            }
            // Estado inicial del autostart
            let autostart_manager = app.autolaunch();
            let autostart_enabled = autostart_manager.is_enabled().unwrap_or(false);

            // System tray menu
            let show_item = MenuItem::with_id(app, "show", "Mostrar SSHPanel", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Ocultar", true, None::<&str>)?;
            let autostart_item = CheckMenuItem::with_id(
                app,
                "autostart",
                "Iniciar con el sistema",
                true,
                autostart_enabled,
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show_item,
                    &hide_item,
                    &separator,
                    &autostart_item,
                    &separator,
                    &quit_item,
                ],
            )?;

            let _tray = TrayIconBuilder::with_id("main")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("SSHPanel")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "autostart" => {
                        let mgr = app.autolaunch();
                        let now_enabled = mgr.is_enabled().unwrap_or(false);
                        if now_enabled {
                            let _ = mgr.disable();
                        } else {
                            let _ = mgr.enable();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Click izquierdo en el icono = toggle visibilidad
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Cerrar la ventana minimiza al tray en vez de salir
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error fatal en SSHPanel")
        .run(|app_handle, event| {
            // Cuando la app está saliendo (no minimizando), matamos el backend
            if let tauri::RunEvent::ExitRequested { .. } = event {
                let state: tauri::State<BackendProcess> = app_handle.state();
                let mut guard = state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    kill_backend_tree(child);
                }
            }
        });
}
