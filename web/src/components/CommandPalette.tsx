import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plug,
  PlugZap,
  Terminal,
  Box,
  Plus,
  Pencil,
  Trash2,
  Server,
  Upload,
  Download,
  Activity,
  ChevronRight,
  Command as CommandIcon,
} from "lucide-react";
import { api, type Host } from "../lib/api";
import { cn, hashGradient, initials, MOD_KEY } from "../lib/utils";

export interface PaletteContext {
  hosts: Host[];
  selectedHost: Host | null;
  onSelectHost: (id: string) => void;
  onAddHost: () => void;
  onEditHost: (host: Host) => void;
  onOpenTab: (tab: "overview" | "containers" | "terminal" | "system") => void;
  onRefresh: () => void;
  onExecCommand: (hostId: string, command: string) => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  ctx: PaletteContext;
}

type Item = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ReactNode;
  accent?: "violet" | "cyan" | "emerald" | "amber" | "rose" | "indigo" | "pink";
  shortcut?: string[];
  keywords?: string;
  action: () => void | Promise<void>;
};

export function CommandPalette({ open, onClose, ctx }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];

    // Hosts navigation
    for (const h of ctx.hosts) {
      list.push({
        id: `host:${h.id}`,
        label: h.name,
        hint: `${h.username}@${h.host}`,
        group: "Hosts",
        icon: <HostMini name={h.name} />,
        keywords: `${h.name} ${h.host} ${h.username}`,
        action: () => {
          ctx.onSelectHost(h.id);
          onClose();
        },
      });
    }

    // Generic actions
    list.push({
      id: "host:add",
      label: "Nuevo host SSH",
      group: "Acciones",
      icon: <Plus size={14} />,
      accent: "violet",
      action: () => {
        ctx.onAddHost();
        onClose();
      },
    });

    if (ctx.selectedHost) {
      const h = ctx.selectedHost;
      list.push({
        id: "open:overview",
        label: "Ver resumen del host",
        hint: h.name,
        group: "Navegación",
        icon: <Server size={14} />,
        accent: "violet",
        action: () => {
          ctx.onOpenTab("overview");
          onClose();
        },
      });
      if (h.connected) {
        list.push({
          id: "open:system",
          label: "Ver sistema (CPU/RAM/disco)",
          hint: h.name,
          group: "Navegación",
          icon: <Activity size={14} />,
          accent: "violet",
          shortcut: [MOD_KEY, "S"],
          action: () => {
            ctx.onOpenTab("system");
            onClose();
          },
        });
        list.push({
          id: "open:terminal",
          label: "Abrir terminal",
          hint: h.name,
          group: "Navegación",
          icon: <Terminal size={14} />,
          accent: "indigo",
          shortcut: [MOD_KEY, "T"],
          action: () => {
            ctx.onOpenTab("terminal");
            onClose();
          },
        });
        list.push({
          id: "open:containers",
          label: "Ver containers Docker",
          hint: h.name,
          group: "Navegación",
          icon: <Box size={14} />,
          accent: "cyan",
          shortcut: [MOD_KEY, "D"],
          action: () => {
            ctx.onOpenTab("containers");
            onClose();
          },
        });
        list.push({
          id: "host:disconnect",
          label: "Desconectar host",
          hint: h.name,
          group: "Acciones",
          icon: <PlugZap size={14} />,
          accent: "rose",
          action: async () => {
            await api.disconnectHost(h.id);
            ctx.onRefresh();
            onClose();
          },
        });
      } else {
        list.push({
          id: "host:connect",
          label: "Conectar al host",
          hint: h.name,
          group: "Acciones",
          icon: <Plug size={14} />,
          accent: "violet",
          action: async () => {
            await api.connectHost(h.id);
            ctx.onRefresh();
            onClose();
          },
        });
      }
      list.push({
        id: "host:edit",
        label: "Editar host",
        hint: h.name,
        group: "Acciones",
        icon: <Pencil size={14} />,
        accent: "violet",
        action: () => {
          ctx.onEditHost(h);
          onClose();
        },
      });
      list.push({
        id: "host:delete",
        label: "Eliminar host",
        hint: h.name,
        group: "Acciones",
        icon: <Trash2 size={14} />,
        accent: "rose",
        action: async () => {
          if (confirm(`¿Eliminar el host "${h.name}"?`)) {
            await api.deleteHost(h.id);
            ctx.onRefresh();
            onClose();
          }
        },
      });
    }

    if (ctx.selectedHost?.connected) {
      list.push({
        id: "exec:hint",
        label: "Ejecutar un comando…",
        hint: `tipeá > seguido del comando`,
        group: "Terminal",
        icon: <ChevronRight size={14} />,
        accent: "indigo",
        action: () => {
          // No cierra el palette — solo prefija el input
          setQuery("> ");
          setActive(0);
        },
      });
    }

    // System
    list.push(
      {
        id: "sys:export",
        label: "Exportar configuración",
        group: "Sistema",
        icon: <Download size={14} />,
        accent: "amber",
        keywords: "backup config",
        action: () => {
          window.dispatchEvent(new CustomEvent("sshpanel:export"));
          onClose();
        },
      },
      {
        id: "sys:import",
        label: "Importar configuración",
        group: "Sistema",
        icon: <Upload size={14} />,
        accent: "amber",
        keywords: "restore config",
        action: () => {
          window.dispatchEvent(new CustomEvent("sshpanel:import"));
          onClose();
        },
      }
    );

    return list;
  }, [ctx, onClose]);

  // Modo comando: el query empieza con ">"
  const commandMode = query.trim().startsWith(">");
  const command = commandMode ? query.trim().slice(1).trim() : "";

  const filtered = useMemo(() => {
    if (commandMode) {
      if (!ctx.selectedHost?.connected || !command) return [];
      return [
        {
          id: "exec:run",
          label: `Ejecutar "${command}"`,
          hint: `en ${ctx.selectedHost.name}`,
          group: "Terminal",
          icon: <ChevronRight size={14} />,
          accent: "indigo" as const,
          shortcut: ["↵"],
          action: () => {
            ctx.onExecCommand(ctx.selectedHost!.id, command);
            onClose();
          },
        },
      ];
    }
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      const hay = `${i.label} ${i.hint ?? ""} ${i.group} ${i.keywords ?? ""}`.toLowerCase();
      return fuzzyMatch(hay, q);
    });
  }, [items, query, commandMode, command, ctx, onClose]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const i of filtered) {
      const arr = map.get(i.group) ?? [];
      arr.push(i);
      map.set(i.group, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const flat = useMemo(() => grouped.flatMap(([, arr]) => arr), [grouped]);

  useEffect(() => {
    if (active >= flat.length) setActive(0);
  }, [flat.length, active]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, flat.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        flat[active]?.action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flat, active, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let runningIdx = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh] animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="glass relative w-full max-w-xl overflow-hidden rounded-xl border border-border-strong shadow-elevated"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow:
            "0 24px 60px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(139, 92, 246, 0.15)",
        }}
      >
        {/* Search */}
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          {commandMode ? (
            <ChevronRight size={15} className="text-brand-indigo" />
          ) : (
            <Search size={15} className="text-text-dim" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder={
              commandMode
                ? `comando para ${ctx.selectedHost?.name ?? "ningún host"}…`
                : "Buscar acciones, hosts, comandos… (> para ejecutar)"
            }
            spellCheck={false}
            className={cn(
              "flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-dim focus:outline-none",
              commandMode && "font-mono"
            )}
          />
          <kbd className="rounded border border-border bg-bg-base/60 px-1.5 py-0.5 font-mono text-[10px] text-text-dim">
            esc
          </kbd>
        </div>

        {/* List */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1.5">
          {grouped.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-dim">
              {commandMode
                ? !ctx.selectedHost
                  ? "Seleccioná un host primero"
                  : !ctx.selectedHost.connected
                    ? `Conectá ${ctx.selectedHost.name} para ejecutar comandos`
                    : "Escribí un comando después de >"
                : `Nada para "${query}"`}
            </div>
          ) : (
            grouped.map(([group, arr]) => (
              <div key={group} className="mb-1">
                <div className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-text-dim">
                  {group}
                </div>
                {arr.map((item) => {
                  runningIdx++;
                  const idx = runningIdx;
                  return (
                    <PaletteRow
                      key={item.id}
                      item={item}
                      active={idx === active}
                      idx={idx}
                      onHover={() => setActive(idx)}
                      onClick={() => item.action()}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-bg-base/40 px-4 py-2 text-[10px] text-text-dim">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-bg-elevated px-1 py-0.5 font-mono">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-bg-elevated px-1 py-0.5 font-mono">↵</kbd>
              ejecutar
            </span>
          </div>
          <span className="flex items-center gap-1.5">
            <CommandIcon size={10} />
            SSHPanel
          </span>
        </div>
      </div>
    </div>
  );
}

function PaletteRow({
  item,
  active,
  idx,
  onHover,
  onClick,
}: {
  item: Item;
  active: boolean;
  idx: number;
  onHover: () => void;
  onClick: () => void;
}) {
  const accentMap: Record<string, string> = {
    violet: "text-brand-violet",
    cyan: "text-brand-cyan",
    emerald: "text-brand-emerald",
    amber: "text-brand-amber",
    rose: "text-brand-rose",
    indigo: "text-brand-indigo",
    pink: "text-brand-pink",
  };
  const accent = item.accent ? accentMap[item.accent] : "text-text-muted";

  return (
    <button
      data-idx={idx}
      onMouseMove={onHover}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-1.5 text-left transition",
        active ? "bg-bg-hover" : "hover:bg-bg-hover/60"
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md transition",
          active ? "bg-bg-elevated" : "bg-bg-base/40",
          accent
        )}
      >
        {item.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-text-primary">{item.label}</div>
        {item.hint && (
          <div className="truncate font-mono text-[11px] text-text-dim">
            {item.hint}
          </div>
        )}
      </div>
      {item.shortcut && (
        <div className="flex items-center gap-1">
          {item.shortcut.map((k) => (
            <kbd
              key={k}
              className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-dim"
            >
              {k}
            </kbd>
          ))}
        </div>
      )}
      {active && !item.shortcut && (
        <ChevronRight size={13} className="text-text-dim" />
      )}
    </button>
  );
}

function HostMini({ name }: { name: string }) {
  return (
    <div
      className="flex h-5 w-5 items-center justify-center rounded text-[9px] font-semibold text-white"
      style={{ background: hashGradient(name) }}
    >
      {initials(name)}
    </div>
  );
}

/**
 * Fuzzy match super simple: todos los chars del query deben aparecer en orden.
 */
function fuzzyMatch(haystack: string, needle: string): boolean {
  let i = 0;
  for (const c of haystack) {
    if (c === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}
