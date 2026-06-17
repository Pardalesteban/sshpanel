import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { Sparkles, Download, ShieldCheck, Loader2 } from "lucide-react";
import { api, wsUrl, type AgentStatus } from "../lib/api";

interface Props {
  hostId: string;
  hostName: string;
  /** Solo monta/foco-ea la terminal cuando la tab está activa. */
  active: boolean;
}

// Paleta ANSI acorde al design system (misma curaduría que SSHTerminal).
const THEME = {
  background: "#09090c",
  foreground: "#f2f1f4",
  cursor: "#9d87f5",
  cursorAccent: "#09090c",
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

export function AgentPanel({ hostId, hostName, active }: Props) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = async () => {
    try {
      setStatus(await api.agentStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-base text-sm text-text-dim">
        <Loader2 className="mr-2 animate-spin" size={16} /> Verificando Claude Code…
      </div>
    );
  }

  if (!status?.installed) {
    return <InstallView onInstalled={refreshStatus} />;
  }

  return (
    <AgentTerminal
      hostId={hostId}
      hostName={hostName}
      active={active}
      status={status}
    />
  );
}

/** Pantalla de descarga: corre el instalador oficial y streamea su salida. */
function InstallView({ onInstalled }: { onInstalled: () => void }) {
  const [installing, setInstalling] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const startInstall = () => {
    setInstalling(true);
    setLines([]);
    const ws = new WebSocket(wsUrl("/api/agent/install"));
    ws.onmessage = (e) => {
      const text = String(e.data);
      setLines((prev) => [...prev, text]);
      if (text.includes("[DONE]")) {
        setDone(true);
        ws.close();
        // dar un respiro y re-chequear estado
        setTimeout(onInstalled, 800);
      }
    };
    ws.onerror = () =>
      setLines((prev) => [...prev, "\n[Error de conexión con el instalador]"]);
    ws.onclose = () => setInstalling(false);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-bg-base px-8">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-violet/20 to-brand-pink/20 text-brand-violet">
          <Sparkles size={26} />
        </div>
        <h2 className="text-lg font-semibold text-text-primary">
          Agente IA con Claude Code
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Un Claude Code real, con tu propia suscripción, que opera sobre este host
          por SSH. No puede modificar SSHPanel — solo actúa en el servidor remoto, y
          pide confirmación antes de algo destructivo.
        </p>

        {!installing && !done && (
          <button
            onClick={startInstall}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-violet px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-violet-hover hover:shadow-glow"
          >
            <Download size={15} />
            Descargar Claude Code
          </button>
        )}
      </div>

      {(installing || lines.length > 0) && (
        <pre className="max-h-56 w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-bg-surface/60 p-4 font-mono text-xs leading-relaxed text-text-muted">
          {lines.join("")}
          {installing && !done && (
            <span className="inline-flex items-center gap-1 text-brand-amber">
              <Loader2 className="animate-spin" size={12} /> instalando…
            </span>
          )}
        </pre>
      )}
    </div>
  );
}

/** La terminal real de Claude Code sobre el PTY del backend. */
function AgentTerminal({
  hostId,
  hostName,
  active,
  status,
}: Props & { status: AgentStatus }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connState, setConnState] = useState<
    "connecting" | "open" | "closed" | "error"
  >("connecting");

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
      scrollback: 8000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    const ws = new WebSocket(wsUrl(`/api/hosts/${hostId}/agent/`));
    wsRef.current = ws;

    const sendResize = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    ws.onopen = () => {
      setConnState("open");
      sendResize();
      term.focus();
    };
    ws.onmessage = (e) => term.write(e.data);
    ws.onerror = () => {
      setConnState("error");
      term.writeln("\r\n\x1b[31m[Error de conexión con el agente]\x1b[0m");
    };
    ws.onclose = () => setConnState("closed");

    const disposeData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    let rafId = 0;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        try {
          fit.fit();
          term.refresh(0, term.rows - 1);
          sendResize();
        } catch {}
      });
    };
    window.addEventListener("resize", handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      disposeData.dispose();
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [hostId]);

  // Re-fit + foco cuando la tab vuelve a estar activa
  useEffect(() => {
    if (active) {
      const t = setTimeout(() => {
        termRef.current?.focus();
        window.dispatchEvent(new Event("resize"));
      }, 50);
      return () => clearTimeout(t);
    }
  }, [active]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-base">
      <div className="flex items-center justify-between border-b border-border bg-bg-surface/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-brand-violet" />
          <span className="font-mono text-xs text-text-muted">
            claude — {hostName}
          </span>
          {status.source === "system" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] text-text-dim">
              <ShieldCheck size={10} /> detectado en tu sistema
            </span>
          )}
          {status.logged_in === false && (
            <span className="rounded-full bg-brand-amber/15 px-2 py-0.5 text-[10px] text-brand-amber">
              escribí /login para conectar tu cuenta
            </span>
          )}
        </div>
        <StatusPill status={connState} />
      </div>
      <div ref={containerRef} className="flex-1 px-2 pt-2" />
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: "connecting" | "open" | "closed" | "error";
}) {
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
