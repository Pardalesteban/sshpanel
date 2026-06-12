import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { X, Pause, Play, Eraser } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "../lib/api";

interface Props {
  hostId: string;
  containerId: string;
  containerName: string;
  onClose: () => void;
}

const THEME = {
  background: "#09090c",
  foreground: "#f2f1f4",
  cursor: "#09090c",
  selectionBackground: "rgba(157, 135, 245, 0.3)",
  black: "#0f0f14",
  red: "#ef5d77",
  green: "#2dd49e",
  yellow: "#e3a857",
  blue: "#7c84f5",
  magenta: "#ef6eae",
  cyan: "#5cd3e6",
  white: "#9596a2",
  brightBlack: "#5d5e6b",
  brightRed: "#f88a9c",
  brightGreen: "#5fe3b6",
  brightYellow: "#eec07f",
  brightBlue: "#9aa2f8",
  brightMagenta: "#f493c4",
  brightCyan: "#8ce5f2",
  brightWhite: "#f2f1f4",
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

    const ws = new WebSocket(
      wsUrl(`/api/hosts/${hostId}/docker/containers/${containerId}/logs`)
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
