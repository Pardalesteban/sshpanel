import { useEffect, useRef, useState } from "react";
import {
  Layers,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  Download,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  FileText,
  X,
  Terminal as TermIcon,
} from "lucide-react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api, wsUrl, type ComposeProject, type ComposeService, type ComposeAction } from "../lib/api";
import { cn } from "../lib/utils";

interface Props {
  hostId: string;
}

export function ComposePanel({ hostId }: Props) {
  const [projects, setProjects] = useState<ComposeProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionPanel, setActionPanel] = useState<{
    project: ComposeProject;
    action: ComposeAction;
  } | null>(null);

  const refresh = async () => {
    try {
      const data = await api.composeProjects(hostId);
      setProjects(data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Error al listar proyectos compose");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [hostId]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="text-xs font-medium uppercase tracking-luxe text-text-dim">
          {projects.length} {projects.length === 1 ? "stack" : "stacks"}
        </span>
        <button
          onClick={refresh}
          className="rounded-md p-1.5 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
          title="Refrescar"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b border-brand-rose/20 bg-brand-rose/10 px-6 py-2.5 text-sm text-brand-rose">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <pre className="whitespace-pre-wrap font-mono text-xs">{error}</pre>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="text-center text-sm text-text-dim">Cargando…</div>
        ) : projects.length === 0 ? (
          <EmptyCompose />
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.Name}
                hostId={hostId}
                project={p}
                expanded={expanded === p.Name}
                onToggle={() => setExpanded(expanded === p.Name ? null : p.Name)}
                onAction={(action) => setActionPanel({ project: p, action })}
              />
            ))}
          </div>
        )}
      </div>

      {actionPanel && (
        <ActionStreamDrawer
          hostId={hostId}
          project={actionPanel.project}
          action={actionPanel.action}
          onClose={() => {
            setActionPanel(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ProjectCard({
  hostId,
  project,
  expanded,
  onToggle,
  onAction,
}: {
  hostId: string;
  project: ComposeProject;
  expanded: boolean;
  onToggle: () => void;
  onAction: (a: ComposeAction) => void;
}) {
  const running = project.Status.toLowerCase().includes("running");
  const files = project.ConfigFiles.split(",").map((f) => f.trim()).filter(Boolean);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border border-l-2 bg-bg-surface/50",
        running ? "border-l-brand-emerald" : "border-l-text-dim"
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <button onClick={onToggle} className="mt-0.5 text-text-dim transition hover:text-text-primary">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Layers size={16} className="mt-0.5 text-brand-violet" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-mono text-sm font-semibold text-text-primary">
              {project.Name}
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-medium",
                running ? "text-brand-emerald" : "text-text-dim"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  running ? "bg-brand-emerald animate-pulse-soft" : "bg-text-dim"
                )}
              />
              {project.Status}
            </span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-text-dim" title={project.ConfigFiles}>
            {files[0] || "—"}
            {files.length > 1 && (
              <span className="ml-1 text-text-muted">(+{files.length - 1})</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {running ? (
            <>
              <ActionBtn icon={<RotateCw size={11} />} label="Restart" accent="amber" onClick={() => onAction("restart")} />
              <ActionBtn icon={<Square size={11} />} label="Down" accent="rose" onClick={() => onAction("down")} />
            </>
          ) : (
            <ActionBtn icon={<Play size={11} />} label="Up" accent="emerald" onClick={() => onAction("up")} />
          )}
          <ActionBtn icon={<Download size={11} />} label="Pull" accent="cyan" onClick={() => onAction("pull")} />
        </div>
      </div>

      {expanded && <ServicesList hostId={hostId} project={project} />}
    </div>
  );
}

function ServicesList({ hostId, project }: { hostId: string; project: ComposeProject }) {
  const [services, setServices] = useState<ComposeService[]>([]);
  const [loading, setLoading] = useState(true);
  const [yaml, setYaml] = useState<string | null>(null);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = project.ConfigFiles.split(",").map((f) => f.trim()).filter(Boolean);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.composeServices(hostId, project.Name, files)
      .then((d) => { if (!cancelled) setServices(d); })
      .catch((e) => { if (!cancelled) setError(e.message ?? "Error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hostId, project.Name, project.ConfigFiles]);

  const showYaml = async () => {
    if (yamlOpen) {
      setYamlOpen(false);
      return;
    }
    if (!yaml) {
      try {
        const res = await api.composeConfig(hostId, project.Name, files);
        setYaml(res.yaml);
      } catch (e: any) {
        setError(e.message ?? "Error al leer config");
        return;
      }
    }
    setYamlOpen(true);
  };

  return (
    <div className="border-t border-border bg-bg-base/30 px-4 py-3">
      {error && <div className="mb-2 text-xs text-brand-rose">{error}</div>}
      {loading ? (
        <div className="text-xs text-text-dim">Cargando servicios…</div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-luxe text-text-dim">
              Servicios
            </span>
            <button
              onClick={showYaml}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
            >
              <FileText size={10} />
              {yamlOpen ? "Ocultar YAML" : "Ver YAML"}
            </button>
          </div>

          {services.length === 0 ? (
            <div className="text-xs text-text-dim">Sin servicios</div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border/60">
              <table className="w-full font-mono text-[11px]">
                <thead className="bg-bg-surface/40 text-text-dim">
                  <tr>
                    <th className="px-3 py-1 text-left font-medium">SERVICIO</th>
                    <th className="px-3 py-1 text-left font-medium">CONTAINER</th>
                    <th className="px-3 py-1 text-left font-medium">IMAGEN</th>
                    <th className="px-3 py-1 text-left font-medium">ESTADO</th>
                    <th className="px-3 py-1 text-left font-medium">PUERTOS</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s, i) => {
                    const isRunning = (s.State || "").toLowerCase() === "running";
                    return (
                      <tr key={`${s.Name}-${i}`} className="border-t border-border/40">
                        <td className="px-3 py-1 text-brand-violet">{s.Service ?? "—"}</td>
                        <td className="px-3 py-1 text-text-muted">{s.Name}</td>
                        <td className="px-3 py-1 text-text-dim">{s.Image ?? "—"}</td>
                        <td className={cn("px-3 py-1", isRunning ? "text-brand-emerald" : "text-text-dim")}>
                          {s.State ?? "—"}
                        </td>
                        <td className="truncate px-3 py-1 text-text-dim">
                          {(s.Publishers || [])
                            .filter((p) => p.PublishedPort)
                            .map((p) => `${p.PublishedPort}→${p.TargetPort}/${p.Protocol}`)
                            .join("  ") || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {yamlOpen && yaml && (
            <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-border/60 bg-bg-base/60 p-3 font-mono text-[10px] text-text-muted">
              {yaml}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

function ActionStreamDrawer({
  hostId,
  project,
  action,
  onClose,
}: {
  hostId: string;
  project: ComposeProject;
  action: ComposeAction;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new XTerm({
      theme: { background: "#09090c", foreground: "#f2f1f4" },
      fontFamily: '"Geist Mono", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.4,
      scrollback: 5000,
      disableStdin: true,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    const files = project.ConfigFiles.split(",").map((f) => f.trim()).filter(Boolean);
    const ws = new WebSocket(
      wsUrl(
        `/api/hosts/${hostId}/compose/projects/${encodeURIComponent(project.Name)}/action/${action}`
      )
    );
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ files }));
    };
    ws.onmessage = (e) => {
      const data = String(e.data);
      term.write(data);
      if (data.includes("[DONE]")) setDone(true);
    };
    ws.onerror = () => term.writeln("\r\n\x1b[31m[Error WS]\x1b[0m");
    ws.onclose = () => setDone(true);

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch {}
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [hostId, project.Name, project.ConfigFiles, action]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-[70vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-elevated">
        <div className="flex items-center justify-between border-b border-border bg-bg-surface/40 px-4 py-2">
          <div className="flex items-center gap-2">
            <TermIcon size={13} className="text-brand-violet" />
            <span className="font-mono text-xs text-text-muted">
              compose <span className="text-brand-violet">{action}</span> — {project.Name}
            </span>
            {done && (
              <span className="ml-2 rounded-full bg-brand-emerald/15 px-2 py-0.5 text-[10px] font-medium text-brand-emerald">
                listo
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
            title="Cerrar"
          >
            <X size={14} />
          </button>
        </div>
        <div ref={containerRef} className="flex-1 px-2 pt-2" />
      </div>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  accent: "emerald" | "rose" | "amber" | "cyan";
  onClick: () => void;
}) {
  const map = {
    emerald: "hover:bg-brand-emerald/10 hover:text-brand-emerald",
    rose: "hover:bg-brand-rose/10 hover:text-brand-rose",
    amber: "hover:bg-brand-amber/10 hover:text-brand-amber",
    cyan: "hover:bg-brand-cyan/10 hover:text-brand-cyan",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted transition",
        map[accent]
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyCompose() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-violet/10 text-brand-violet">
        <Layers size={22} />
      </div>
      <p className="text-sm font-medium text-text-primary">Sin stacks de Compose</p>
      <p className="mt-1 max-w-xs text-xs text-text-muted">
        Cuando levantes un <span className="font-mono">docker-compose</span> en este host
        aparece acá. SSHPanel lo descubre con <span className="font-mono">docker compose ls</span>.
      </p>
    </div>
  );
}
