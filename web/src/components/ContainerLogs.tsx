import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { X, Pause, Play, Eraser } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

interface Props {
  hostId: string;
  containerId: string;
  containerName: string;
  onClose: () => void;
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

export function ContainerLogs({ hostId, containerId, containerName, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: THEME,
      fontFamily: '"Geist Mono", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.5,
      cursorBlink: false,
      disableStdin: true,
      allowTransparency: true,
      scrollback: 10000,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    // Ctrl+C siempre copia en logs (no hay stdin que interrumpir).
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      if (isMac) return true;
      if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === "c" || e.key === "C")) {
        const sel = term.getSelection();
        if (sel && sel.length > 0) {
          navigator.clipboard.writeText(sel).catch(() => {});
          term.clearSelection();
          return false;
        }
      }
      return true;
    });

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${window.location.host}/api/hosts/${hostId}/docker/containers/${containerId}/logs`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      term.writeln("\x1b[90m[Conectando al stream de logs…]\x1b[0m");
    };
    ws.onmessage = (e) => {
      if (!pausedRef.current) term.write(e.data);
    };
    ws.onerror = () => {
      term.writeln("\r\n\x1b[31m[Error de conexión]\x1b[0m");
    };
    ws.onclose = () => {
      term.writeln("\r\n\x1b[90m[Stream cerrado]\x1b[0m");
    };

    const handleResize = () => {
      try {
        fit.fit();
      } catch {}
    };
    window.addEventListener("resize", handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(containerRef.current);

    return () => {
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [hostId, containerId]);

  const handleClear = () => termRef.current?.clear();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-base">
      <div className="flex items-center justify-between border-b border-border bg-bg-surface/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand-cyan animate-pulse-soft" />
          <span className="font-mono text-xs text-text-muted">
            logs — <span className="text-brand-cyan">{containerName}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPaused((p) => !p)}
            className="rounded-md p-1.5 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
            title={paused ? "Reanudar" : "Pausar"}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button
            onClick={handleClear}
            className="rounded-md p-1.5 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
            title="Limpiar"
          >
            <Eraser size={13} />
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
            title="Cerrar"
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 px-2 pt-2" />
    </div>
  );
}
