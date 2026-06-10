// Evita que se abra una consola en Windows release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sshpanel_lib::run()
}
