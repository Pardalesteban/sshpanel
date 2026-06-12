import { useEffect, useState } from "react";
import { Cpu, MemoryStick, Box, Zap, AlertCircle, RefreshCw, Clock } from "lucide-react";
import { api, type HostOverview } from "../lib/api";
import { HostAvatar } from "./HostAvatar";
import { cn } from "../lib/utils";

interface Props {
  onSelectHost: (id: string) => void;
}

const POLL_INTERVAL = 5000;

export function OverviewPanel({ onSelectHost }: Props) {
  const [items, setItems] = useState<HostOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const data = await api.overview();
      setItems(data.hosts);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(t);
  }, []);

  // Agregados para el header
  const total = items.length;
  const connected = items.filter((h) => h.connected).length;
  const totalRunning = items.reduce((acc, h) => acc + h.containers_running, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Overview</h1>
          <p className="mt-0.5 text-xs text-text-muted">
            {connected}/{total} hosts conectados · {totalRunning} containers corriendo
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="rounded-md p-1.5 text-text-dim transition hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
          title="Refrescar"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 border-b border-brand-rose/20 bg-brand-rose/10 px-6 py-2.5 text-sm text-brand-rose">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <pre className="whitespace-pre-wrap font-mono text-xs">{error}</pre>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="text-center text-sm text-text-dim">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="text-center text-sm text-text-dim">
            No hay hosts configurados.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((h) => (
              <OverviewCard key={h.host_id} data={h} onClick={() => onSelectHost(h.host_id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewCard({ data, onClick }: { data: HostOverview; onClick: () => void }) {
  const hasError = !data.connected || !!data.error;

  const borderColor = hasError
    ? "border-l-brand-rose"
    : data.cpu_percent > 80 || data.mem_percent > 90
    ? "border-l-brand-amber"
    : "border-l-brand-emerald";

  return (
    <div
      onClick={onClick}
      className={cn(
        "group cursor-pointer overflow-hidden rounded-lg border border-border border-l-2 bg-bg-surface/50 p-4 transition hover:border-border-strong hover:bg-bg-surface/70",
        borderColor
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <HostAvatar name={data.name} size={32} connected={data.connected} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {data.name}
            </h3>
            {data.os && <OSBadge os={data.os} />}
          </div>
          <div className="truncate font-mono text-[11px] text-text-dim">
            {data.username}@{data.host}
          </div>
        </div>
        <LatencyPill ms={data.latency_ms} connected={data.connected} />
      </div>

      {hasError ? (
        <div className="mt-3 rounded-md border border-brand-rose/20 bg-brand-rose/10 px-2.5 py-2 text-[11px] text-brand-rose">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertCircle size={11} />
            {data.connected ? "Error" : "Desconectado"}
          </div>
          {data.error && (
            <div className="mt-0.5 truncate font-mono text-[10px] opacity-80">
              {data.error}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Métricas — data-driven: agregás un item al array y se renderiza */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricBar
              icon={<Cpu size={11} />}
              color="#9d87f5"
              label="CPU"
              value={data.cpu_percent}
              display={`${data.cpu_percent.toFixed(1)}%`}
            />
            <MetricBar
              icon={<MemoryStick size={11} />}
              color="#5cd3e6"
              label="MEM"
              value={data.mem_percent}
              display={`${data.mem_percent.toFixed(0)}%`}
              sub={`${formatBytes(data.mem_used_bytes)} / ${formatBytes(data.mem_total_bytes)}`}
            />
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px]">
            <div className="flex items-center gap-1.5 text-text-dim">
              <Box size={11} className="text-brand-cyan" />
              {data.docker_available ? (
                <span>
                  <span className="text-brand-cyan">{data.containers_running}</span>
                  <span className="text-text-dim"> / {data.containers_total} containers</span>
                </span>
              ) : (
                <span className="text-text-dim">docker n/d</span>
              )}
            </div>
            <div className="flex items-center gap-1 text-text-dim">
              <Clock size={10} />
              {formatUptime(data.uptime_seconds)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricBar({
  icon,
  color,
  label,
  value,
  display,
  sub,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: number;
  display: string;
  sub?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="rounded-md border border-border/60 bg-bg-base/40 px-2 py-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-luxe" style={{ color }}>
          {icon}
          {label}
        </span>
        <span className="font-mono text-[11px] text-text-primary">{display}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-base">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {sub && (
        <div className="mt-0.5 truncate font-mono text-[9px] text-text-dim">{sub}</div>
      )}
    </div>
  );
}

function LatencyPill({ ms, connected }: { ms: number; connected: boolean }) {
  if (!connected || !ms) {
    return (
      <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] font-medium text-text-dim">
        —
      </span>
    );
  }
  const color =
    ms < 50 ? "bg-brand-emerald/15 text-brand-emerald" :
    ms < 200 ? "bg-brand-amber/15 text-brand-amber" :
    "bg-brand-rose/15 text-brand-rose";
  return (
    <span className={cn("inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", color)}>
      <Zap size={9} />
      {ms.toFixed(0)} ms
    </span>
  );
}

function OSBadge({ os }: { os: string }) {
  const display = os === "Darwin" ? "macOS" : os === "Linux" ? "Linux" : os;
  const color =
    os === "Darwin" ? "bg-brand-pink/15 text-brand-pink" :
    os === "Linux" ? "bg-brand-emerald/15 text-brand-emerald" :
    "bg-bg-elevated text-text-dim";
  return (
    <span className={cn("inline-flex flex-shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[9px] font-medium", color)}>
      {display}
    </span>
  );
}

function formatBytes(b: number): string {
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(0)} MB`;
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
}

function formatUptime(secs: number): string {
  if (!secs) return "—";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
