import { useEffect, useMemo, useRef, useState } from "react";
import { Cpu, MemoryStick, HardDrive, Activity, Zap, Clock, Search, Skull, ShieldAlert, Check, X } from "lucide-react";
import { api, APIError, wsUrl, type SystemSnapshot, type ProcessInfo } from "../lib/api";
import { Sparkline } from "./Sparkline";
import { setLatency, clearLatency } from "../lib/latencyStore";
import { cn } from "../lib/utils";

interface Props {
  hostId: string;
}

type KillState =
  | { stage: "idle" }
  | { stage: "confirm"; pid: number; sudo: boolean }
  | { stage: "sending"; pid: number }
  | { stage: "error"; pid: number; message: string; needsSudo: boolean };

const MAX_SAMPLES = 60; // ~2 min de historia a 2s/snapshot
const COLORS = {
  cpu: "#8b5cf6",      // violet
  mem: "#22d3ee",      // cyan
  disk: "#10b981",     // emerald
  net_rx: "#6366f1",   // indigo
  net_tx: "#ec4899",   // pink
  latency: "#f59e0b",  // amber
};

export function SystemPanel({ hostId }: Props) {
  const [snapshots, setSnapshots] = useState<SystemSnapshot[]>([]);
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(wsUrl(`/api/hosts/${hostId}/system/stream`));
    wsRef.current = ws;

    ws.onopen = () => setStatus("open");
    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus("closed");
    ws.onmessage = (e) => {
      try {
        const snap = JSON.parse(e.data);
        if (snap.error) {
          setError(snap.error);
          return;
        }
        setError(null);
        setLatency(hostId, snap.latency_ms);
        setSnapshots((prev) => {
          const next = [...prev, snap as SystemSnapshot];
          if (next.length > MAX_SAMPLES) next.shift();
          return next;
        });
      } catch {}
    };

    return () => {
      ws.close();
      clearLatency(hostId);
    };
  }, [hostId]);

  const latest = snapshots[snapshots.length - 1];
  const prev = snapshots[snapshots.length - 2];

  const cpuSeries = useMemo(() => snapshots.map((s) => s.cpu_percent), [snapshots]);
  const memSeries = useMemo(
    () =>
      snapshots.map((s) =>
        s.mem_total_bytes ? (s.mem_used_bytes / s.mem_total_bytes) * 100 : 0
      ),
    [snapshots]
  );
  const latencySeries = useMemo(() => snapshots.map((s) => s.latency_ms), [snapshots]);

  // Network: calculamos delta entre snapshots para mostrar throughput
  const netRxSeries = useMemo(
    () => deltaSeries(snapshots, (s) => sum(s.net.map((n) => n.rx_bytes))),
    [snapshots]
  );
  const netTxSeries = useMemo(
    () => deltaSeries(snapshots, (s) => sum(s.net.map((n) => n.tx_bytes))),
    [snapshots]
  );

  if (status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <div className="mb-2 text-sm font-medium text-brand-rose">
            Error de conexión al stream de sistema
          </div>
          {error && <pre className="font-mono text-xs text-text-dim">{error}</pre>}
        </div>
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-dim">
        Esperando el primer snapshot…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Top bar — OS + load avg + uptime + latency */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-5 text-xs">
          <OSBadge os={latest.os} />
          <Metric label="Load" value={latest.load_avg.map((n) => n.toFixed(2)).join("  ")} mono />
          <Metric label="Uptime" value={formatUptime(latest.uptime_seconds)} />
        </div>
        <LatencyPill value={latest.latency_ms} />
      </div>

      {error && (
        <div className="border-b border-brand-amber/30 bg-brand-amber/10 px-6 py-2 text-xs text-brand-amber">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        <StatCard
          icon={<Cpu size={16} />}
          color={COLORS.cpu}
          label="CPU"
          value={`${latest.cpu_percent.toFixed(1)}%`}
          series={cpuSeries}
          max={100}
        />
        <StatCard
          icon={<MemoryStick size={16} />}
          color={COLORS.mem}
          label="Memoria"
          value={`${formatBytes(latest.mem_used_bytes)} / ${formatBytes(latest.mem_total_bytes)}`}
          series={memSeries}
          max={100}
          sub={`${((latest.mem_used_bytes / Math.max(latest.mem_total_bytes, 1)) * 100).toFixed(0)}%`}
        />
        <StatCard
          icon={<Activity size={16} />}
          color={COLORS.net_rx}
          label="Network ↓"
          value={netRxSeries.length ? formatRate(netRxSeries[netRxSeries.length - 1]) : "—"}
          series={netRxSeries}
        />
        <StatCard
          icon={<Activity size={16} />}
          color={COLORS.net_tx}
          label="Network ↑"
          value={netTxSeries.length ? formatRate(netTxSeries[netTxSeries.length - 1]) : "—"}
          series={netTxSeries}
        />
      </div>

      {/* Disks */}
      <section className="px-6 pb-4">
        <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-dim">
          Discos
        </h3>
        <div className="space-y-1.5">
          {latest.disks.map((d) => (
            <DiskBar key={d.mount} disk={d} />
          ))}
          {latest.disks.length === 0 && (
            <div className="text-xs text-text-dim">Sin datos de disco</div>
          )}
        </div>
      </section>

      {/* Process list */}
      <section className="px-6 pb-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-text-dim">
            Top procesos
          </h3>
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-bg-base/60 px-2">
            <Search size={11} className="text-text-dim" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filtrar…"
              className="w-32 bg-transparent py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none"
            />
          </div>
        </div>
        <ProcessTable processes={latest.top_processes} filter={filter} hostId={hostId} />
      </section>
    </div>
  );
}

function StatCard({
  icon,
  color,
  label,
  value,
  series,
  max,
  sub,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: string;
  series: number[];
  max?: number;
  sub?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-bg-surface/50 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5" style={{ color }}>
            {icon}
            <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
          </div>
          <div className="mt-1 font-mono text-lg font-medium text-text-primary">
            {value}
          </div>
          {sub && <div className="font-mono text-[10px] text-text-dim">{sub}</div>}
        </div>
        <Sparkline values={series} color={color} max={max} width={140} height={44} />
      </div>
    </div>
  );
}

function DiskBar({ disk }: { disk: { mount: string; device: string; percent: number; total_kb: number; used_kb: number } }) {
  const color =
    disk.percent >= 90 ? "bg-brand-rose"
    : disk.percent >= 75 ? "bg-brand-amber"
    : "bg-brand-emerald";
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/70 bg-bg-surface/30 px-3 py-2">
      <HardDrive size={13} className="text-brand-emerald" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between font-mono text-[11px]">
          <span className="text-text-primary">{disk.mount}</span>
          <span className="text-text-dim">
            {formatBytes(disk.used_kb * 1024)} / {formatBytes(disk.total_kb * 1024)} · {disk.percent.toFixed(0)}%
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-base">
          <div className={cn("h-full transition-all", color)} style={{ width: `${disk.percent}%` }} />
        </div>
      </div>
    </div>
  );
}

function ProcessTable({ processes, filter, hostId }: { processes: ProcessInfo[]; filter: string; hostId: string }) {
  const [killState, setKillState] = useState<KillState>({ stage: "idle" });

  const filtered = filter
    ? processes.filter(
        (p) =>
          p.command.toLowerCase().includes(filter.toLowerCase()) ||
          p.user.toLowerCase().includes(filter.toLowerCase())
      )
    : processes;

  const doKill = async (pid: number, sudo: boolean) => {
    setKillState({ stage: "sending", pid });
    try {
      await api.killProcess(hostId, pid, { signal: "TERM", sudo });
      setKillState({ stage: "idle" });
    } catch (e: any) {
      const status = e instanceof APIError ? e.status : 0;
      setKillState({
        stage: "error",
        pid,
        message: e.message ?? "Error",
        needsSudo: status === 403 && !sudo,
      });
    }
  };

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      <table className="w-full font-mono text-[11px]">
        <thead className="bg-bg-surface/40 text-text-dim">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">PID</th>
            <th className="px-3 py-1.5 text-left font-medium">USER</th>
            <th className="px-3 py-1.5 text-right font-medium">CPU%</th>
            <th className="px-3 py-1.5 text-right font-medium">MEM%</th>
            <th className="px-3 py-1.5 text-left font-medium">COMMAND</th>
            <th className="w-10 px-2 py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => {
            const isTarget = killState.stage !== "idle" && killState.pid === p.pid;
            return (
              <tr
                key={p.pid}
                className={cn(
                  "group border-t border-border/40 hover:bg-bg-hover/40",
                  isTarget && "bg-brand-rose/5"
                )}
              >
                <td className="px-3 py-1 text-text-dim">{p.pid}</td>
                <td className="px-3 py-1 text-text-muted">{p.user}</td>
                <td
                  className={cn(
                    "px-3 py-1 text-right",
                    p.cpu_percent > 50 ? "text-brand-rose" :
                    p.cpu_percent > 10 ? "text-brand-amber" :
                    "text-text-primary"
                  )}
                >
                  {p.cpu_percent.toFixed(1)}
                </td>
                <td className="px-3 py-1 text-right text-text-primary">{p.mem_percent.toFixed(1)}</td>
                <td className="truncate px-3 py-1 text-text-primary">{p.command}</td>
                <td className="px-2 py-1">
                  <KillCell
                    pid={p.pid}
                    state={isTarget ? killState : { stage: "idle" }}
                    onAsk={(sudo) => setKillState({ stage: "confirm", pid: p.pid, sudo })}
                    onCancel={() => setKillState({ stage: "idle" })}
                    onConfirm={(sudo) => doKill(p.pid, sudo)}
                  />
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-center text-text-dim">
                Sin coincidencias
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function KillCell({
  pid,
  state,
  onAsk,
  onCancel,
  onConfirm,
}: {
  pid: number;
  state: KillState;
  onAsk: (sudo: boolean) => void;
  onCancel: () => void;
  onConfirm: (sudo: boolean) => void;
}) {
  if (state.stage === "idle") {
    return (
      <button
        onClick={() => onAsk(false)}
        title={`Matar PID ${pid}`}
        className="rounded p-1 text-text-dim opacity-0 transition group-hover:opacity-100 hover:bg-brand-rose/10 hover:text-brand-rose"
      >
        <Skull size={12} />
      </button>
    );
  }
  if (state.stage === "sending") {
    return <span className="text-[10px] text-text-dim">…</span>;
  }
  if (state.stage === "confirm") {
    return (
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onConfirm(state.sudo)}
          title={state.sudo ? "Confirmar con sudo" : "Confirmar kill"}
          className="rounded p-1 text-brand-rose transition hover:bg-brand-rose/15"
        >
          <Check size={12} />
        </button>
        <button
          onClick={onCancel}
          title="Cancelar"
          className="rounded p-1 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={12} />
        </button>
      </div>
    );
  }
  // error
  return (
    <div className="flex items-center gap-0.5" title={state.message}>
      {state.needsSudo ? (
        <button
          onClick={() => onConfirm(true)}
          title="Reintentar con sudo"
          className="rounded p-1 text-brand-amber transition hover:bg-brand-amber/15"
        >
          <ShieldAlert size={12} />
        </button>
      ) : (
        <span className="text-brand-rose" title={state.message}>
          <ShieldAlert size={12} />
        </span>
      )}
      <button
        onClick={onCancel}
        title="Cerrar"
        className="rounded p-1 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function LatencyPill({ value }: { value: number }) {
  const color =
    value < 50 ? "bg-brand-emerald/15 text-brand-emerald"
    : value < 200 ? "bg-brand-amber/15 text-brand-amber"
    : "bg-brand-rose/15 text-brand-rose";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", color)}>
      <Zap size={10} />
      {value.toFixed(0)} ms
    </span>
  );
}

function OSBadge({ os }: { os: string }) {
  const display =
    os === "Darwin" ? "macOS" :
    os === "Linux" ? "Linux" :
    os || "?";
  const color =
    os === "Darwin" ? "bg-brand-pink/15 text-brand-pink" :
    os === "Linux" ? "bg-brand-emerald/15 text-brand-emerald" :
    "bg-bg-elevated text-text-dim";
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium", color)}>
      {display}
    </span>
  );
}

function Metric({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <Clock size={11} className="text-text-dim" />
      <span className="text-text-dim">{label}</span>
      <span className={cn("text-text-primary", mono && "font-mono")}>{value}</span>
    </div>
  );
}

// --- helpers ---

function deltaSeries(snaps: SystemSnapshot[], pick: (s: SystemSnapshot) => number): number[] {
  if (snaps.length < 2) return [];
  const out: number[] = [];
  for (let i = 1; i < snaps.length; i++) {
    const dt = Math.max(0.1, snaps[i].timestamp - snaps[i - 1].timestamp);
    const dv = Math.max(0, pick(snaps[i]) - pick(snaps[i - 1]));
    out.push(dv / dt);
  }
  return out;
}

function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b < 1024 ** 4) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  return `${(b / 1024 ** 4).toFixed(2)} TB`;
}

function formatRate(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

function formatUptime(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
