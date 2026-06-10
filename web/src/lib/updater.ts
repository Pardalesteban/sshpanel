/**
 * Cliente del auto-updater de Tauri.
 *
 * Diseño:
 *   - Una sola instancia (singleton) que mantiene el estado y notifica a subscribers.
 *   - Cuando corre en browser puro (modo dev sin Tauri), es no-op — los componentes
 *     React leen `available=false` y se ocultan.
 *   - Chequeo automático al boot (debounce de 2s) + reintento cada 6h.
 *   - El usuario puede forzar un chequeo desde el panel "Acerca de".
 *
 * Para extender (Fase futura): agregar `notes` parseados como markdown, mostrar
 * percent del download, etc. La forma de Update es estable.
 */

type Stage =
  | "idle"           // sin info aún
  | "checking"       // consultando el feed
  | "uptodate"       // chequeado, no hay update
  | "available"      // hay update — sin descargar todavía
  | "downloading"    // bajando
  | "ready"          // descargada + verificada, listo para reiniciar
  | "error";

export interface UpdaterState {
  stage: Stage;
  currentVersion: string;
  availableVersion?: string;
  notes?: string;
  date?: string;
  progress?: { downloaded: number; total: number };
  error?: string;
  /** True cuando estamos en Tauri (sino los componentes se ocultan). */
  enabled: boolean;
}

type Listener = (s: UpdaterState) => void;

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas
const BOOT_DEBOUNCE_MS = 2000;

let state: UpdaterState = {
  stage: "idle",
  currentVersion: import.meta.env.VITE_APP_VERSION ?? "dev",
  enabled: false,
};
const listeners = new Set<Listener>();
let bootTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
// Update handle del plugin — guardado para poder llamar downloadAndInstall después.
let updateHandle: any = null;

function emit() {
  for (const l of listeners) l(state);
}

function setState(patch: Partial<UpdaterState>) {
  state = { ...state, ...patch };
  emit();
}

function isTauri(): boolean {
  // Tauri 2 expone __TAURI_INTERNALS__ en window. Más fiable que ua-sniff.
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function getCurrentVersion(): Promise<string> {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return import.meta.env.VITE_APP_VERSION ?? "dev";
  }
}

async function checkOnce(opts: { silent?: boolean } = {}): Promise<void> {
  if (!state.enabled) return;
  setState({ stage: "checking", error: undefined });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      setState({ stage: "uptodate" });
      return;
    }
    updateHandle = update;
    setState({
      stage: "available",
      availableVersion: update.version,
      notes: update.body ?? undefined,
      date: update.date ?? undefined,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    // El feed no tiene binarios para esta plataforma (release sin firmar) o
    // directamente no existe — el usuario no puede hacer nada con eso: lo
    // tratamos como "sin updates" en vez de error.
    const noFeed =
      /platforms/i.test(msg) || /could not fetch a valid release/i.test(msg);
    if (noFeed) {
      console.warn("[updater] feed sin binarios para esta plataforma:", msg);
      setState({ stage: "uptodate" });
      return;
    }
    // Chequeo automático (boot / poll): fallar en silencio — un banner de
    // error al abrir la app por un chequeo en background es ruido.
    if (opts.silent) {
      console.warn("[updater] check automático falló:", msg);
      setState({ stage: "idle" });
      return;
    }
    setState({ stage: "error", error: msg });
  }
}

/** Descarga + verifica la firma. No reinicia — eso lo hace `restart()`. */
async function downloadAndInstall(): Promise<void> {
  if (!updateHandle) {
    await checkOnce();
    if (!updateHandle) return;
  }
  setState({ stage: "downloading", progress: { downloaded: 0, total: 0 } });
  try {
    let downloaded = 0;
    let total = 0;
    await updateHandle.downloadAndInstall((event: any) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? 0;
          setState({ progress: { downloaded: 0, total } });
          break;
        case "Progress":
          downloaded += event.data.chunkLength ?? 0;
          setState({ progress: { downloaded, total } });
          break;
        case "Finished":
          setState({ stage: "ready", progress: { downloaded: total, total } });
          break;
      }
    });
    // Si el evento Finished no llegó por alguna razón, igual la marcamos lista.
    if (state.stage !== "ready") setState({ stage: "ready" });
  } catch (e: any) {
    setState({ stage: "error", error: e?.message ?? String(e) });
  }
}

/** Reinicia la app — la versión nueva ya quedó instalada por downloadAndInstall. */
async function restart(): Promise<void> {
  try {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e: any) {
    setState({ stage: "error", error: e?.message ?? String(e) });
  }
}

export const updater = {
  /** Inicializa el módulo: detecta Tauri, lee versión, chequea al boot. */
  async init() {
    const enabled = isTauri();
    const currentVersion = await getCurrentVersion();
    setState({ enabled, currentVersion });
    if (!enabled) return;
    // Debounce inicial para no competir con el primer render
    bootTimer = setTimeout(() => {
      checkOnce({ silent: true });
      pollTimer = setInterval(() => checkOnce({ silent: true }), CHECK_INTERVAL_MS);
    }, BOOT_DEBOUNCE_MS);
  },

  /** Cancela timers — útil para cleanup en tests. */
  dispose() {
    if (bootTimer) clearTimeout(bootTimer);
    if (pollTimer) clearInterval(pollTimer);
    bootTimer = null;
    pollTimer = null;
  },

  /** Subscribe a cambios de estado. Devuelve unsubscribe. */
  subscribe(l: Listener): () => void {
    listeners.add(l);
    l(state); // estado actual al subscribirse
    return () => listeners.delete(l);
  },

  getState(): UpdaterState {
    return state;
  },

  /** Disparar chequeo manual (ej. desde el panel Acerca de) — sí muestra errores. */
  check: () => checkOnce(),
  downloadAndInstall,
  restart,
};
