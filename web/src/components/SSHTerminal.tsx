import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "../lib/api";

interface Props {
  hostId: string;
  hostName: string;
  /** Texto a mostrar en el header. Por defecto `ssh — {hostName}`. */
  label?: string;
}

// Paleta ANSI curada acorde al design system
const THEME = {
  background: "#0c0d10",
  foreground: "#f5f5f7",
  cursor: "#8b5cf6",
  cursorAccent: "#0c0d10",
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

export function SSHTerminal({ hostId, hostName, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">(
    "connecting"
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: THEME,
      fontFamily: '"Geist Mono", ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      allowTransparency: true,
      scrollback: 5000,
      letterSpacing: 0,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const ws = new WebSocket(wsUrl(`/api/hosts/${hostId}/terminal/`));
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      term.focus();
    };
    ws.onmessage = (e) => {
      term.write(e.data);
    };
    ws.onerror = () => {
      setStatus("error");
      term.writeln("\r\n\x1b[31m[Error de conexión WebSocket]\x1b[0m");
    };
    ws.onclose = () => {
      setStatus("closed");
      term.writeln("\r\n\x1b[90m[Conexión cerrada]\x1b[0m");
    };

    const disposeData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    // Ctrl+C copia si hay selección (si no, deja pasar el SIGINT habitual).
    // Ctrl+V pega del portapapeles. En macOS se respeta Cmd+C/Cmd+V nativo del navegador.
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
        return true;
      }
      if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === "v" || e.key === "V")) {
        navigator.clipboard
          .readText()
          .then((text) => {
            if (text && ws.readyState === WebSocket.OPEN) ws.send(text);
          })
          .catch(() => {});
        return false;
      }
      return true;
    });

    const sendResize = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })
      );
    };

    // Notificar resize al abrir (por si la terminal no es 120x32 desde el inicio)
    const disposeOpen = (() => {
      const original = ws.onopen;
      ws.onopen = (e) => {
        original?.call(ws, e);
        sendResize();
      };
      return () => {};
    })();

    let rafId = 0;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        try {
          fit.fit();
          // Forzar redraw del canvas tras el fit (necesario al cambiar zoom)
          term.refresh(0, term.rows - 1);
          sendResize();
        } catch {}
      });
    };
    window.addEventListener("resize", handleResize);

    const ro = new ResizeObserver(handleResize);
    ro.observe(containerRef.current);

    // Detección de cambio de zoom: cuando cambia devicePixelRatio
    // el matchMedia listener se dispara. Nos re-suscribimos cada vez.
    let mql: MediaQueryList | null = null;
    const subscribeZoom = () => {
      mql?.removeEventListener("change", onZoom);
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener("change", onZoom);
    };
    function onZoom() {
      handleResize();
      subscribeZoom();
    }
    subscribeZoom();

    return () => {
      cancelAnimationFrame(rafId);
      disposeData.dispose();
      disposeOpen();
      window.removeEventListener("resize", handleResize);
      mql?.removeEventListener("change", onZoom);
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [hostId]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-base">
      <div className="flex items-center justify-between border-b border-border bg-bg-surface/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-rose/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-amber/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-emerald/70" />
          </div>
          <span className="ml-2 font-mono text-xs text-text-muted">
            {label ?? `ssh — ${hostName}`}
          </span>
        </div>
        <StatusPill status={status} />
      </div>

      <div ref={containerRef} className="flex-1 px-2 pt-2" />
    </div>
  );
}

function StatusPill({ status }: { status: "connecting" | "open" | "closed" | "error" }) {
  const map = {
    connecting: { color: "bg-brand-amber/15 text-brand-amber", label: "conectando" },
    open: { color: "bg-brand-emerald/15 text-brand-emerald", label: "live" },
    closed: { color: "bg-bg-elevated text-text-dim", label: "cerrada" },
    error: { color: "bg-brand-rose/15 text-brand-rose", label: "error" },
  };
  const s = map[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}
