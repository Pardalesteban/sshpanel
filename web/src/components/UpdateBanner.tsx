import { useEffect, useState } from "react";
import { Download, RotateCw, X, AlertCircle } from "lucide-react";
import { updater, type UpdaterState } from "../lib/updater";
import { cn } from "../lib/utils";

/**
 * Banner global de update. Aparece cuando hay una nueva versión disponible
 * o cuando está descargando / lista para reiniciar.
 *
 * Estados visuales:
 *  - available    → "v0.2 disponible — [Descargar]"
 *  - downloading  → progress bar
 *  - ready        → "v0.2 lista — [Restart to update]"  (CTA prominente)
 *  - error        → mensaje rosa con cerrar
 *
 * Cualquier otro estado: no renderiza nada.
 */
export function UpdateBanner({ onOpenAbout }: { onOpenAbout?: () => void }) {
  const [s, setS] = useState<UpdaterState>(updater.getState());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => updater.subscribe(setS), []);

  if (!s.enabled || dismissed) return null;
  if (s.stage !== "available" && s.stage !== "downloading" && s.stage !== "ready" && s.stage !== "error") {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b px-4 py-2 text-xs animate-fade-in",
        s.stage === "error"
          ? "border-brand-rose/30 bg-brand-rose/10 text-brand-rose"
          : s.stage === "ready"
          ? "border-brand-emerald/40 bg-brand-emerald/10 text-brand-emerald"
          : "border-brand-violet/40 bg-brand-violet/10 text-brand-violet"
      )}
    >
      {s.stage === "error" ? (
        <>
          <AlertCircle size={14} className="flex-shrink-0" />
          <span className="flex-1 truncate">No se pudo actualizar: {s.error}</span>
        </>
      ) : s.stage === "ready" ? (
        <>
          <Download size={14} className="flex-shrink-0" />
          <span className="flex-1">
            <span className="font-medium">SSHPanel v{s.availableVersion}</span> está listo
            para instalarse.
          </span>
          <button
            onClick={() => updater.restart()}
            className="inline-flex items-center gap-1 rounded-md bg-brand-emerald px-3 py-1 text-[11px] font-semibold text-bg-base shadow-sm transition hover:shadow-glow"
          >
            <RotateCw size={11} />
            Restart to update
          </button>
        </>
      ) : s.stage === "downloading" ? (
        <>
          <Download size={14} className="flex-shrink-0 animate-pulse-soft" />
          <span className="flex-1">
            Descargando v{s.availableVersion}…
            {s.progress?.total
              ? ` ${formatBytes(s.progress.downloaded)} / ${formatBytes(s.progress.total)}`
              : ""}
          </span>
          {s.progress?.total ? (
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-bg-base/60">
              <div
                className="h-full bg-brand-violet transition-all"
                style={{ width: `${(s.progress.downloaded / s.progress.total) * 100}%` }}
              />
            </div>
          ) : null}
        </>
      ) : (
        <>
          <Download size={14} className="flex-shrink-0" />
          <span className="flex-1">
            <span className="font-medium">SSHPanel v{s.availableVersion}</span> disponible.
          </span>
          {onOpenAbout && (
            <button
              onClick={onOpenAbout}
              className="rounded-md px-2 py-1 text-[11px] underline-offset-2 transition hover:underline"
            >
              Ver detalles
            </button>
          )}
          <button
            onClick={() => updater.downloadAndInstall()}
            className="inline-flex items-center gap-1 rounded-md bg-brand-violet px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:shadow-glow"
          >
            <Download size={11} />
            Descargar
          </button>
        </>
      )}
      <button
        onClick={() => setDismissed(true)}
        title="Ocultar"
        className="rounded p-0.5 opacity-60 transition hover:bg-bg-hover hover:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}
