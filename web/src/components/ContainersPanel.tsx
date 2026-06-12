import { useEffect, useRef, useState } from "react";
import {
  Play,
  Square,
  RotateCw,
  FileText,
  RefreshCw,
  Box,
  AlertCircle,
  Download,
  Cpu,
  MemoryStick,
} from "lucide-react";
import { api, APIError, wsUrl, type DockerContainer, type ContainerStats } from "../lib/api";
import { InstallDockerModal } from "./InstallDockerModal";
import { Sparkline } from "./Sparkline";
import { cn } from "../lib/utils";

const STATS_HISTORY = 40; // ~80s a 2s/sample

interface Props {
  hostId: string;
  hostName?: string;
  onOpenLogs: (containerId: string, containerName: string) => void;
}

export function ContainersPanel({ hostId, hostName = "", onOpenLogs }: Props) {
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dockerMissing, setDockerMissing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  // Historia de stats por container.ID → para sparklines vivos
  const [statsHistory, setStatsHistory] = useState<Record<string, { cpu: number[]; mem: number[]; last: ContainerStats }>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const fetchContainers = async () => {
    try {
      const data = await api.listContainers(hostId, showAll);
      setContainers(data);
      setError(null);
      setDockerMissing(false);
    } catch (e: any) {
      if (e instanceof APIError && e.status === 418) {
        setDockerMissing(true);
        setError(null);
      } else {
        setError(e.message ?? "Error al cargar containers");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchContainers();
    const t = setInterval(() => {
      if (!dockerMissing) fetchContainers();
    }, 4000);
    return () => clearInterval(t);
  }, [hostId, showAll, dockerMissing]);

  // WebSocket de stats — reabre por host, se silencia si docker no está
  useEffect(() => {
    if (dockerMissing) return;
    setStatsHistory({});
    const ws = new WebSocket(
      wsUrl(`/api/hosts/${hostId}/docker/stats/stream`)
    );
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.error || !Array.isArray(data.containers)) return;
        setStatsHistory((prev) => {
          const next: typeof prev = {};
          for (const s of data.containers as ContainerStats[]) {
            const prior = prev[s.id];
            const cpu = [...(prior?.cpu ?? []), s.cpu_percent].slice(-STATS_HISTORY);
            const mem = [...(prior?.mem ?? []), s.mem_percent].slice(-STATS_HISTORY);
            next[s.id] = { cpu, mem, last: s };
          }
          return next;
        });
      } catch {}
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [hostId, dockerMissing]);

  const action = async (
    fn: (h: string, c: string) => Promise<any>,
    container: DockerContainer
  ) => {
    setActingOn(container.ID);
    try {
      await fn(hostId, container.ID);
      await fetchContainers();
    } catch (e: any) {
      setError(e.message ?? "Error en la acción");
    } finally {
      setActingOn(null);
    }
  };

  if (dockerMissing) {
    return (
      <>
        <DockerMissingCard onInstall={() => setInstalling(true)} />
        <InstallDockerModal
          hostId={hostId}
          hostName={hostName}
          open={installing}
          onClose={() => setInstalling(false)}
          onDone={() => {
            setDockerMissing(false);
            fetchContainers();
          }}
        />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-luxe text-text-dim">
            {containers.length} {containers.length === 1 ? "container" : "containers"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border bg-bg-base accent-brand-cyan"
            />
            Mostrar detenidos
          </label>
          <button
            onClick={fetchContainers}
            className="rounded-md p-1.5 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
            title="Refrescar"
          >
            <RefreshCw size={13} />
          </button>
        </div>
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
        ) : containers.length === 0 ? (
          <EmptyContainers showAll={showAll} />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {containers.map((c) => (
              <ContainerCard
                key={c.ID}
                container={c}
                stats={statsHistory[c.ID]}
                busy={actingOn === c.ID}
                onStart={() => action(api.startContainer, c)}
                onStop={() => action(api.stopContainer, c)}
                onRestart={() => action(api.restartContainer, c)}
                onLogs={() => onOpenLogs(c.ID, c.Names)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface CardProps {
  container: DockerContainer;
  stats?: { cpu: number[]; mem: number[]; last: ContainerStats };
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onLogs: () => void;
}

function ContainerCard({
  container,
  stats,
  busy,
  onStart,
  onStop,
  onRestart,
  onLogs,
}: CardProps) {
  const running = (container.State ?? "").toLowerCase() === "running" ||
    container.Status?.toLowerCase().startsWith("up");

  const stateColor = running
    ? { dot: "bg-brand-emerald", text: "text-brand-emerald", border: "border-l-brand-emerald" }
    : { dot: "bg-text-dim", text: "text-text-dim", border: "border-l-text-dim" };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border border-border border-l-2 bg-bg-surface/50 p-4 transition hover:border-border-strong",
        stateColor.border
      )}
    >
      <div className="flex items-start gap-3">
        <Box size={16} className="mt-0.5 text-brand-cyan" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-mono text-sm font-semibold text-text-primary">
              {container.Names}
            </h3>
            <span className={cn("flex items-center gap-1 text-[10px] font-medium", stateColor.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", stateColor.dot, running && "animate-pulse-soft")} />
              {running ? "running" : "stopped"}
            </span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-text-muted">
            {container.Image}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-text-dim">
            {container.Status}
          </div>
          {container.Ports && (
            <div className="mt-1.5 truncate font-mono text-[10px] text-text-dim">
              {container.Ports}
            </div>
          )}
        </div>
      </div>

      {running && stats && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatMini
            icon={<Cpu size={11} />}
            color="#9d87f5"
            label="CPU"
            value={`${stats.last.cpu_percent.toFixed(1)}%`}
            series={stats.cpu}
            max={Math.max(100, ...stats.cpu)}
          />
          <StatMini
            icon={<MemoryStick size={11} />}
            color="#5cd3e6"
            label="MEM"
            value={`${stats.last.mem_percent.toFixed(1)}%`}
            sub={formatStatsBytes(stats.last.mem_used_bytes)}
            series={stats.mem}
            max={100}
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
        {running ? (
          <>
            <ActionButton onClick={onStop} disabled={busy} icon={<Square size={12} />} label="Stop" accent="rose" />
            <ActionButton onClick={onRestart} disabled={busy} icon={<RotateCw size={12} />} label="Restart" accent="amber" />
          </>
        ) : (
          <ActionButton onClick={onStart} disabled={busy} icon={<Play size={12} />} label="Start" accent="emerald" />
        )}
        <ActionButton onClick={onLogs} disabled={busy} icon={<FileText size={12} />} label="Logs" accent="cyan" />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  accent: "rose" | "amber" | "emerald" | "cyan";
}

function ActionButton({ onClick, disabled, icon, label, accent }: ActionButtonProps) {
  const accentMap = {
    rose: "hover:bg-brand-rose/10 hover:text-brand-rose",
    amber: "hover:bg-brand-amber/10 hover:text-brand-amber",
    emerald: "hover:bg-brand-emerald/10 hover:text-brand-emerald",
    cyan: "hover:bg-brand-cyan/10 hover:text-brand-cyan",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted transition disabled:opacity-50",
        accentMap[accent]
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function StatMini({
  icon,
  color,
  label,
  value,
  sub,
  series,
  max,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: string;
  sub?: string;
  series: number[];
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-bg-base/40 px-2 py-1.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-luxe" style={{ color }}>
          {icon}
          {label}
        </div>
        <div className="font-mono text-[11px] text-text-primary">{value}</div>
        {sub && <div className="font-mono text-[9px] text-text-dim">{sub}</div>}
      </div>
      <Sparkline values={series} color={color} max={max} width={70} height={28} />
    </div>
  );
}

function formatStatsBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(0)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function EmptyContainers({ showAll }: { showAll: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-cyan/10 text-brand-cyan">
        <Box size={22} />
      </div>
      <p className="text-sm font-medium text-text-primary">
        {showAll ? "No hay contenedores" : "Ningún container corriendo"}
      </p>
      <p className="mt-1 text-xs text-text-muted">
        {showAll
          ? "Este host no tiene contenedores en Docker."
          : "Activá 'Mostrar detenidos' si tenés contenedores parados."}
      </p>
    </div>
  );
}

function DockerMissingCard({ onInstall }: { onInstall: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center animate-fade-in">
      <div className="relative mb-5">
        <div
          className="absolute inset-0 blur-2xl opacity-30"
          style={{ background: "linear-gradient(135deg, #5cd3e6 0%, #9d87f5 100%)" }}
        />
        <div
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, #5cd3e6 0%, #9d87f5 100%)" }}
        >
          <Box size={28} />
        </div>
      </div>

      <h2 className="text-lg font-semibold tracking-tight">
        Docker no está instalado en este host
      </h2>
      <p className="mt-2 max-w-md text-sm text-text-muted">
        Podés instalarlo desde acá usando el script oficial de Docker
        <span className="font-mono text-[11px]"> (get.docker.com)</span>. El proceso tarda
        entre uno y tres minutos.
      </p>

      <button
        onClick={onInstall}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-brand-cyan px-4 py-2 text-sm font-semibold text-bg-base shadow-sm transition hover:opacity-90 hover:shadow-glow"
      >
        <Download size={15} />
        Instalar Docker
      </button>

      <p className="mt-4 max-w-md text-[11px] leading-relaxed text-text-dim">
        Requiere que el usuario SSH tenga permisos sudo. Si no los tiene, instalá
        Docker manualmente y reconectá.
      </p>
    </div>
  );
}
