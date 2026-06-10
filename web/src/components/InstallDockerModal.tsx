import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

interface Props {
  hostId: string;
  hostName: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

const THEME = {
  background: "#0c0d10",
  foreground: "#f5f5f7",
  cursor: "#0c0d10",
  selectionBackground: "rgba(139, 92, 246, 0.3)",
  black: "#15171c",
  red: "#f43f5e",
  green: "#10b981",
  yellow: "#f59e0b",
  blue: "#6366f1",
  magenta: "#ec4899",
  cyan: "#22d3ee",
  white: "#9aa0ab",
  brightBlack: "#5c626d",
  brightRed: "#fb7185",
  brightGreen: "#34d399",
  brightYellow: "#fbbf24",
  brightBlue: "#818cf8",
  brightMagenta: "#f472b6",
  brightCyan: "#67e8f9",
  brightWhite: "#f5f5f7",
};

type Status = "idle" | "installing" | "done" | "error";

export function InstallDockerModal({ hostId, hostName, open, onClose, onDone }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (!open) {
      setStatus("idle");
      return;
    }
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: THEME,
      fontFamily: '"Geist Mono", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.5,
      cursorBlink: false,
      disableStdin: true,
      allowTransparency: true,
      scrollback: 5000,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${window.location.host}/api/hosts/${hostId}/docker/install`
    );
    wsRef.current = ws;
    setStatus("installing");

    ws.onmessage = (e) => {
      term.write(e.data);
      // Solo confiar en los marcadores explícitos del backend
      if (e.data.includes("[DONE]")) {
        setStatus("done");
      } else if (e.data.includes("[ERROR]")) {
        setStatus("error");
      }
    };
    ws.onerror = () => setStatus("error");
    ws.onclose = () => {
      setStatus((s) => (s === "installing" ? "error" : s));
    };

    const handleResize = () => {
      try {
        fit.fit();
      } catch {}
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      ws.close();
      term.dispose();
    };
  }, [open, hostId]);

  if (!open) return null;

  const handleClose = () => {
    if (status === "done") onDone();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-start justify-center p-4 pt-[8vh] animate-fade-in"
      onClick={(e) => {
        if (status !== "installing") {
          if (e.target === e.currentTarget) handleClose();
        }
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative flex h-[75vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <StatusIcon status={status} />
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Instalando Docker
              </h2>
              <p className="mt-0.5 font-mono text-[11px] text-text-muted">
                {hostName}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={status === "installing"}
            className="rounded-md p-1.5 text-text-dim transition hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
            title={status === "installing" ? "Esperá a que termine" : "Cerrar"}
          >
            <X size={14} />
          </button>
        </header>

        {/* Body */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden bg-bg-base px-3 pt-3"
        />

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-border bg-bg-base/40 px-5 py-3">
          <StatusLabel status={status} />
          {status === "done" && (
            <button
              onClick={() => {
                onDone();
                onClose();
              }}
              className="rounded-md bg-brand-emerald px-3 py-1.5 text-sm font-medium text-bg-base transition hover:opacity-90"
            >
              Listo
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  switch (status) {
    case "installing":
      return (
        <Loader2 size={18} className="animate-spin text-brand-amber" />
      );
    case "done":
      return <CheckCircle2 size={18} className="text-brand-emerald" />;
    case "error":
      return <AlertCircle size={18} className="text-brand-rose" />;
    default:
      return <Loader2 size={18} className="text-text-dim" />;
  }
}

function StatusLabel({ status }: { status: Status }) {
  const map: Record<Status, { color: string; label: string }> = {
    idle: { color: "text-text-dim", label: "Esperando…" },
    installing: { color: "text-brand-amber", label: "Instalando — no cierres esta ventana" },
    done: { color: "text-brand-emerald", label: "Docker instalado. Cerrá la conexión SSH y reconectá para usar el grupo docker." },
    error: { color: "text-brand-rose", label: "La instalación falló. Revisá el output arriba." },
  };
  const s = map[status];
  return <span className={`text-xs font-medium ${s.color}`}>{s.label}</span>;
}
