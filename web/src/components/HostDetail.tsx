import { useState } from "react";
import { Plug, PlugZap, Terminal, Box, Trash2, Info, Pencil, Activity, Key, Layers } from "lucide-react";
import type { Host } from "../lib/api";
import { api } from "../lib/api";
import { HostAvatar } from "./HostAvatar";
import { TerminalWorkspace } from "./TerminalWorkspace";
import { ContainersPanel } from "./ContainersPanel";
import { ContainerLogs } from "./ContainerLogs";
import { SystemPanel } from "./SystemPanel";
import { ComposePanel } from "./ComposePanel";
import { SSHKeysModal } from "./SSHKeysModal";
import { cn } from "../lib/utils";

type Tab = "overview" | "containers" | "compose" | "terminal" | "system";

interface OpenLog {
  hostId: string;
  containerId: string;
  containerName: string;
}

interface Props {
  host: Host;
  onChange: () => void;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  openedTerminals: string[];
  openedSystems: string[];
  openedLogs: OpenLog[];
  onOpenLogs: (hostId: string, containerId: string, containerName: string) => void;
  onCloseLogs: (hostId: string) => void;
  onEdit: () => void;
  hosts: Host[];
}

export function HostDetail({
  host,
  onChange,
  tab,
  onTabChange: setTab,
  openedTerminals,
  openedSystems,
  openedLogs,
  onOpenLogs,
  onCloseLogs,
  onEdit,
  hosts,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.connectHost(host.id);
      onChange();
    } catch (e: any) {
      setError(e.message ?? "Error al conectar");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.disconnectHost(host.id);
      if (tab === "terminal" || tab === "containers") setTab("overview");
      onChange();
    } catch (e: any) {
      setError(e.message ?? "Error al desconectar");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar el host "${host.name}"?`)) return;
    await api.deleteHost(host.id);
    onChange();
  };

  return (
    <div className="flex h-full flex-col animate-fade-in">
      {/* Header */}
      <header className="flex items-center gap-4 border-b border-border px-8 py-5">
        <HostAvatar name={host.name} size={48} connected={host.connected} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {host.name}
            </h1>
            <StatusBadge connected={host.connected} />
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-xs text-text-muted">
            <span>
              {host.username}@{host.host}:{host.port}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {host.connected ? (
            <button
              onClick={handleDisconnect}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm font-medium text-text-muted transition hover:border-brand-rose/40 hover:bg-brand-rose/10 hover:text-brand-rose disabled:opacity-50"
            >
              <PlugZap size={14} />
              {busy ? "Desconectando…" : "Desconectar"}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-violet px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-violet-hover hover:shadow-glow disabled:opacity-50"
            >
              <Plug size={14} />
              {busy ? "Conectando…" : "Conectar"}
            </button>
          )}
          <button
            onClick={() => setKeysOpen(true)}
            className="rounded-md p-2 text-text-dim transition hover:bg-bg-hover hover:text-brand-indigo"
            title="Claves SSH"
          >
            <Key size={14} />
          </button>
          <button
            onClick={onEdit}
            className="rounded-md p-2 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
            title="Editar host"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="rounded-md p-2 text-text-dim transition hover:bg-bg-hover hover:text-brand-rose"
            title="Eliminar host"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-brand-rose/20 bg-brand-rose/10 px-8 py-2.5 text-sm text-brand-rose">
          {error}
        </div>
      )}

      {/* Tabs */}
      <nav className="flex items-center gap-1 border-b border-border px-6">
        <TabButton
          active={tab === "overview"}
          onClick={() => setTab("overview")}
          icon={<Info size={13} />}
          label="Resumen"
        />
        <TabButton
          active={tab === "system"}
          onClick={() => setTab("system")}
          icon={<Activity size={13} />}
          label="Sistema"
          accent="violet"
          disabled={!host.connected}
        />
        <TabButton
          active={tab === "containers"}
          onClick={() => setTab("containers")}
          icon={<Box size={13} />}
          label="Containers"
          accent="cyan"
          disabled={!host.connected}
        />
        <TabButton
          active={tab === "compose"}
          onClick={() => setTab("compose")}
          icon={<Layers size={13} />}
          label="Compose"
          accent="violet"
          disabled={!host.connected}
        />
        <TabButton
          active={tab === "terminal"}
          onClick={() => setTab("terminal")}
          icon={<Terminal size={13} />}
          label="Terminal"
          accent="indigo"
          disabled={!host.connected}
        />
      </nav>

      {/* Tab content
          - overview/containers se remontan al cambiar de host (datos frescos)
          - terminales y logs persisten: se mantienen montados,
            solo se muestra el activo. Así no perdés scrollback ni stream. */}
      <div className="relative flex-1 overflow-hidden">
        {tab === "overview" && <OverviewPanel host={host} onTab={setTab} />}
        {tab === "containers" && (
          <ContainersPanel
            key={host.id}
            hostId={host.id}
            hostName={host.name}
            onOpenLogs={(cid, cname) => onOpenLogs(host.id, cid, cname)}
          />
        )}
        {tab === "compose" && <ComposePanel key={host.id} hostId={host.id} />}

        {/* SystemPanels persistentes (samples se acumulan aunque cambies de tab) */}
        {openedSystems.map((sid) => {
          const active = tab === "system" && sid === host.id;
          if (!hosts.find((h) => h.id === sid)) return null;
          return (
            <div
              key={sid}
              className="absolute inset-0"
              style={{
                visibility: active ? "visible" : "hidden",
                pointerEvents: active ? "auto" : "none",
              }}
            >
              <SystemPanel hostId={sid} />
            </div>
          );
        })}

        {openedTerminals.map((tid) => {
          const active = tab === "terminal" && tid === host.id;
          const tHost = hosts.find((h) => h.id === tid);
          if (!tHost) return null;
          return (
            <div
              key={tid}
              className="absolute inset-0"
              style={{
                visibility: active ? "visible" : "hidden",
                pointerEvents: active ? "auto" : "none",
              }}
            >
              <TerminalWorkspace hostId={tid} hostName={tHost.name} active={active} />
            </div>
          );
        })}

        {openedLogs.map((log) => {
          const active = tab === "containers" && log.hostId === host.id;
          return (
            <div
              key={`${log.hostId}:${log.containerId}`}
              className="absolute inset-0"
              style={{
                visibility: active ? "visible" : "hidden",
                pointerEvents: active ? "auto" : "none",
              }}
            >
              <ContainerLogs
                hostId={log.hostId}
                containerId={log.containerId}
                containerName={log.containerName}
                onClose={() => onCloseLogs(log.hostId)}
              />
            </div>
          );
        })}
      </div>

      <SSHKeysModal
        open={keysOpen}
        hostId={host.id}
        hostName={host.name}
        onClose={() => setKeysOpen(false)}
        onChange={onChange}
      />
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent?: "cyan" | "indigo" | "violet";
  disabled?: boolean;
}

function TabButton({ active, onClick, icon, label, accent, disabled }: TabButtonProps) {
  const accentColor =
    accent === "cyan" ? "text-brand-cyan" :
    accent === "indigo" ? "text-brand-indigo" :
    accent === "violet" ? "text-brand-violet" :
    "text-text-primary";
  const borderColor =
    accent === "cyan" ? "border-brand-cyan" :
    accent === "indigo" ? "border-brand-indigo" :
    "border-brand-violet";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? `${borderColor} ${accentColor}`
          : "border-transparent text-text-muted hover:text-text-primary"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function OverviewPanel({ host, onTab }: { host: Host; onTab: (t: Tab) => void }) {
  return (
    <div className="overflow-y-auto p-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ActionCard
          icon={<Activity size={18} />}
          accent="violet"
          title="Sistema"
          description="CPU, memoria, disco, network y procesos en tiempo real."
          cta="Ver sistema"
          onClick={() => onTab("system")}
          disabled={!host.connected}
        />
        <ActionCard
          icon={<Box size={18} />}
          accent="cyan"
          title="Contenedores Docker"
          description="Ver, iniciar y detener contenedores. Streaming de logs en tiempo real."
          cta="Ver containers"
          onClick={() => onTab("containers")}
          disabled={!host.connected}
        />
        <ActionCard
          icon={<Terminal size={18} />}
          accent="indigo"
          title="Terminal SSH"
          description="Abrir una terminal interactiva en este host desde el browser."
          cta="Abrir terminal"
          onClick={() => onTab("terminal")}
          disabled={!host.connected}
        />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-bg-surface/40 p-5">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-dim">
          Detalles de conexión
        </h3>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <InfoRow label="Host" value={host.host} mono />
          <InfoRow label="Puerto" value={String(host.port)} mono />
          <InfoRow label="Usuario" value={host.username} mono />
          <InfoRow label="Estado" value={host.connected ? "Conectado" : "Desconectado"} />
        </dl>
      </div>
    </div>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        connected
          ? "bg-brand-emerald/10 text-brand-emerald"
          : "bg-bg-elevated text-text-dim"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          connected ? "bg-brand-emerald animate-pulse-soft" : "bg-text-dim"
        )}
      />
      {connected ? "online" : "offline"}
    </span>
  );
}

interface ActionCardProps {
  icon: React.ReactNode;
  accent: "cyan" | "indigo" | "violet";
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
  disabled?: boolean;
}

function ActionCard({ icon, accent, title, description, cta, onClick, disabled }: ActionCardProps) {
  const accentText =
    accent === "cyan" ? "text-brand-cyan" :
    accent === "indigo" ? "text-brand-indigo" :
    "text-brand-violet";
  const accentGradient =
    accent === "cyan" ? "from-brand-cyan/10" :
    accent === "indigo" ? "from-brand-indigo/10" :
    "from-brand-violet/10";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative overflow-hidden rounded-lg border border-border bg-bg-surface/50 p-5 text-left transition",
        disabled
          ? "opacity-50"
          : "hover:border-border-strong hover:bg-bg-surface/80"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-50",
          accentGradient
        )}
      />
      <div className="relative">
        <div className={cn("mb-3", accentText)}>{icon}</div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{description}</p>
        <span
          className={cn(
            "mt-4 inline-flex items-center gap-1 text-xs font-medium transition group-hover:gap-2",
            accentText
          )}
        >
          {cta} →
        </span>
      </div>
    </button>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-text-dim">{label}</dt>
      <dd className={cn("text-text-primary", mono && "font-mono text-xs")}>{value}</dd>
    </>
  );
}
