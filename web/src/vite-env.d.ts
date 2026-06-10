/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_CHANGELOG_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Plugins de Tauri se cargan dinámicamente con import() y son opcionales en runtime
// (browser puro vs Tauri). Declaramos los módulos como any para que tsc no rompa
// cuando las deps NPM aún no se hayan instalado (CI las instala antes del build real).
declare module "@tauri-apps/api/app";
declare module "@tauri-apps/plugin-updater";
declare module "@tauri-apps/plugin-process";
