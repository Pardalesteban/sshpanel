import { useEffect, useState } from "react";
import { X, Info, RefreshCw, Download, Check, RotateCw, AlertCircle, ExternalLink } from "lucide-react";
import { updater, type UpdaterState } from "../lib/updater";
import { cn } from "../lib/utils";
import { useEscapeClose } from "../lib/hooks";

/**
 * Panel "Acerca de" — muestra versión actual, estado del updater y changelog
 * de las últimas versiones (fetched del CHANGELOG.md del repo).
 *
 * Botón "Buscar actualizaciones" fuerza un chequeo manual.
 * Si hay update lista: botón prominente "Restart to update".
 */
const CHANGELOG_URL =
  import.meta.env.VITE_CHANGELOG_URL ??
  "https://raw.githubusercontent.com/Pardalesteban/sshpanel/main/CHANGELOG.md";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Release {
  version: string;
  body: string;
}

export function AboutPanel({ open, onClose }: Props) {
  const [s, setS] = useState<UpdaterState>(updater.getState());
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [loadingChangelog, setLoadingChangelog] = useState(false);

  useEffect(() => updater.subscribe(setS), []);

  useEscapeClose(open, onClose);

  useEffect(() => {
    if (!open || releases) return;
    setLoadingChangelog(true);
    fetch(CHANGELOG_URL)
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((text) => setReleases(parseChangelog(text)))
      .catch(() => setReleases([]))
      .finally(() => setLoadingChangelog(false));
  }, [open, releases]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-border p-5">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="SSHPanel" className="h-10 w-10 rounded-md" />
            <div>
              <h2 className="text-lg font-semibold tracking-tight">SSHPanel</h2>
              <p className="font-mono text-xs text-text-muted">v{s.currentVersion}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        {s.enabled && (
          <div className="border-b border-border bg-bg-surface/40 px-5 py-3">
            <UpdateStatusRow state={s} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-dim">
            <Info size={11} />
            Últimos cambios
          </h3>

          {loadingChangelog ? (
            <div className="text-xs text-text-dim">Cargando changelog…</div>
          ) : !releases || releases.length === 0 ? (
            <div className="text-xs text-text-dim">
              No se pudo cargar el changelog.
              {" "}
              <a
                href="https://github.com/Pardalesteban/sshpanel/blob/main/CHANGELOG.md"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-brand-violet hover:underline"
              >
                Ver en GitHub <ExternalLink size={10} />
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              {releases.slice(0, 5).map((r) => (
                <article key={r.version} className="rounded-md border border-border/60 bg-bg-base/40 p-3">
                  <header className="mb-2 flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold",
                        r.version === s.currentVersion
                          ? "bg-brand-emerald/15 text-brand-emerald"
                          : "bg-bg-elevated text-text-muted"
                      )}
                    >
                      v{r.version}
                    </span>
                    {r.version === s.currentVersion && (
                      <span className="text-[10px] text-text-dim">— versión actual</span>
                    )}
                  </header>
                  <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-text-muted">
                    {r.body.trim()}
                  </pre>
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border bg-bg-surface/40 px-5 py-3">
          <a
            href="https://github.com/Pardalesteban/sshpanel"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-text-dim transition hover:text-text-primary"
          >
            GitHub <ExternalLink size={10} />
          </a>
          {s.enabled && (
            <button
              onClick={() => updater.check()}
              disabled={s.stage === "checking" || s.stage === "downloading"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-base/60 px-3 py-1.5 text-xs text-text-muted transition hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
            >
              <RefreshCw
                size={11}
                className={s.stage === "checking" ? "animate-spin" : ""}
              />
              Buscar actualizaciones
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function UpdateStatusRow({ state: s }: { state: UpdaterState }) {
  if (s.stage === "checking") {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <RefreshCw size={12} className="animate-spin text-brand-violet" />
        Buscando actualizaciones…
      </div>
    );
  }
  if (s.stage === "uptodate" || s.stage === "idle") {
    return (
      <div className="flex items-center gap-2 text-xs text-brand-emerald">
        <Check size={12} />
        Estás en la última versión.
      </div>
    );
  }
  if (s.stage === "available") {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-brand-violet">
          <Download size={12} />
          v{s.availableVersion} disponible
        </span>
        <button
          onClick={() => updater.downloadAndInstall()}
          className="inline-flex items-center gap-1 rounded-md bg-brand-violet px-2.5 py-1 text-[11px] font-semibold text-white transition hover:shadow-glow"
        >
          Descargar
        </button>
      </div>
    );
  }
  if (s.stage === "downloading") {
    const pct = s.progress?.total ? (s.progress.downloaded / s.progress.total) * 100 : 0;
    return (
      <div>
        <div className="flex items-center justify-between text-xs text-brand-violet">
          <span>Descargando v{s.availableVersion}…</span>
          <span className="font-mono text-[10px]">{pct.toFixed(0)}%</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-base">
          <div className="h-full bg-brand-violet transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  if (s.stage === "ready") {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-brand-emerald">
          <Check size={12} />
          v{s.availableVersion} lista para instalar
        </span>
        <button
          onClick={() => updater.restart()}
          className="inline-flex items-center gap-1 rounded-md bg-brand-emerald px-3 py-1 text-[11px] font-semibold text-bg-base shadow-sm transition hover:shadow-glow"
        >
          <RotateCw size={11} />
          Restart to update
        </button>
      </div>
    );
  }
  if (s.stage === "error") {
    return (
      <div className="flex items-start gap-2 text-xs text-brand-rose">
        <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
        <span className="break-all">{s.error}</span>
      </div>
    );
  }
  return null;
}

/**
 * Parsea CHANGELOG.md (formato Keep a Changelog).
 * Divide por headings `## [version]` y devuelve cada sección.
 */
function parseChangelog(md: string): Release[] {
  const lines = md.split("\n");
  const releases: Release[] = [];
  let current: Release | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+\[([^\]]+)\]/);
    if (m) {
      if (current) releases.push(current);
      const version = m[1].replace(/^v/, "");
      // Skip "Unreleased" del listado visible — solo lo muestra si no hay nada más.
      current = { version, body: "" };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current) releases.push(current);
  // Filtrar "Unreleased" del default visible (queda visible si es lo único).
  const stable = releases.filter((r) => !/unreleased/i.test(r.version));
  return stable.length > 0 ? stable : releases;
}
