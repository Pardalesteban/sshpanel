import { useEffect, useMemo, useState } from "react";
import { Server, Plus, Settings, Search, X, LayoutGrid, Info } from "lucide-react";
import type { Host } from "../lib/api";
import { HostAvatar } from "./HostAvatar";
import { subscribeLatencies } from "../lib/latencyStore";
import { cn } from "../lib/utils";

interface Props {
  hosts: Host[];
  selectedId: string | null;
  overviewActive?: boolean;
  onSelect: (id: string) => void;
  onOpenOverview?: () => void;
  onAddHost: () => void;
  onOpenPalette: () => void;
  onOpenAbout?: () => void;
}

function parseTags(tags: string | undefined): string[] {
  if (!tags) return [];
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}

export function Sidebar({
  hosts,
  selectedId,
  overviewActive,
  onSelect,
  onOpenOverview,
  onAddHost,
  onOpenPalette,
  onOpenAbout,
}: Props) {
  const [latencies, setLatencies] = useState<Map<string, number>>(new Map());
  const [filter, setFilter] = useState("");
  useEffect(() => subscribeLatencies(setLatencies), []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return hosts;
    // Prefijo "#" → match exacto contra tags
    if (q.startsWith("#")) {
      const tag = q.slice(1);
      return hosts.filter((h) =>
        parseTags(h.tags).some((t) => t.toLowerCase() === tag)
      );
    }
    return hosts.filter((h) => {
      const hay = `${h.name} ${h.host} ${h.username} ${h.tags ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [hosts, filter]);

  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-border bg-bg-surface/60">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 pt-5 pb-4">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md text-white"
          style={{
            background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
          }}
        >
          <Server size={15} strokeWidth={2.5} />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">
          SSHPanel
        </span>
      </div>

      {/* Filtro local de hosts — ⌘K sigue abriendo el palette global */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-md border border-border bg-bg-base/50 px-2.5 py-1.5 transition focus-within:border-brand-violet/60 focus-within:ring-2 focus-within:ring-brand-violet/20">
          <Search size={14} className="text-text-dim" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar hosts o #tag"
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
          />
          {filter ? (
            <button
              onClick={() => setFilter("")}
              className="rounded p-0.5 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
              title="Limpiar"
            >
              <X size={12} />
            </button>
          ) : (
            <button
              onClick={onOpenPalette}
              title="Command palette"
              className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-dim transition hover:text-text-muted"
            >
              ⌘K
            </button>
          )}
        </div>
      </div>

      {/* Overview link — vista multi-host */}
      {onOpenOverview && (
        <div className="px-2 pb-1">
          <button
            onClick={onOpenOverview}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition",
              overviewActive
                ? "bg-bg-hover text-text-primary"
                : "text-text-muted hover:bg-bg-hover/60 hover:text-text-primary"
            )}
          >
            <LayoutGrid size={14} className="text-brand-violet" />
            <span className="font-medium">Overview</span>
            <kbd className="ml-auto rounded border border-border bg-bg-elevated px-1 py-0.5 font-mono text-[9px] text-text-dim">
              ⌘H
            </kbd>
          </button>
        </div>
      )}

      {/* Section label */}
      <div className="flex items-center justify-between px-4 pt-2 pb-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-dim">
          Hosts
        </span>
        <button
          onClick={onAddHost}
          className="rounded p-1 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
          title="Agregar host"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Hosts list */}
      <div className="flex-1 overflow-y-auto px-2">
        {hosts.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-text-dim">
            Sin hosts todavía
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-text-dim">
            Sin coincidencias para
            <span className="ml-1 font-mono text-text-muted">"{filter}"</span>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((h) => {
              const tags = parseTags(h.tags);
              return (
                <li key={h.id}>
                  <div
                    onClick={() => onSelect(h.id)}
                    className={cn(
                      "group flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition",
                      selectedId === h.id
                        ? "bg-bg-hover"
                        : "hover:bg-bg-hover/60"
                    )}
                  >
                    <HostAvatar name={h.name} size={26} connected={h.connected} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-text-primary">
                          {h.name}
                        </span>
                        <LatencyDot ms={latencies.get(h.id)} />
                      </div>
                      <div className="truncate font-mono text-[11px] text-text-dim">
                        {h.username}@{h.host}
                      </div>
                      {tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {tags.slice(0, 4).map((t) => (
                            <button
                              key={t}
                              onClick={(e) => {
                                e.stopPropagation();
                                setFilter(`#${t}`);
                              }}
                              className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[9px] text-text-muted transition hover:bg-brand-violet/15 hover:text-brand-violet"
                              title={`Filtrar por ${t}`}
                            >
                              {t}
                            </button>
                          ))}
                          {tags.length > 4 && (
                            <span className="px-1 text-[9px] text-text-dim">
                              +{tags.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="space-y-0.5 border-t border-border px-3 py-2.5">
        <button
          onClick={onOpenPalette}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
        >
          <Settings size={14} />
          Configuración
        </button>
        {onOpenAbout && (
          <button
            onClick={onOpenAbout}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
          >
            <Info size={14} />
            Acerca de
          </button>
        )}
      </div>
    </aside>
  );
}

function LatencyDot({ ms }: { ms?: number }) {
  if (ms == null) return null;
  const color =
    ms < 50 ? "bg-brand-emerald" :
    ms < 200 ? "bg-brand-amber" :
    "bg-brand-rose";
  return (
    <span
      className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", color)}
      title={`${ms.toFixed(0)} ms`}
    />
  );
}
