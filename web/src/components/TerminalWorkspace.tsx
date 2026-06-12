import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Plus, X, Columns2, Square, TerminalSquare } from "lucide-react";
import { SSHTerminal } from "./SSHTerminal";
import { cn } from "../lib/utils";

interface Props {
  hostId: string;
  hostName: string;
  /** Si el workspace es el que está visible (host + tab terminal activos). */
  active: boolean;
}

interface Session {
  id: string;
  /** Número incremental para el label (#1, #2, …). */
  n: number;
  /** Nombre custom de la pestaña (si el user la renombró). */
  title?: string;
}

type Focus = "A" | "B";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Maneja N sesiones SSH como pestañas sobre un mismo host, con opción de
 * split para ver dos a la vez. Se monta de forma persistente (uno por host),
 * así las sesiones y su scrollback sobreviven al cambiar de host o de tab.
 */
export function TerminalWorkspace({ hostId, hostName, active }: Props) {
  const counter = useRef(1);
  const [sessions, setSessions] = useState<Session[]>(() => [{ id: newId(), n: 1 }]);
  const [paneA, setPaneA] = useState<string>(() => sessions[0].id);
  const [paneB, setPaneB] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>("A");
  const [editingId, setEditingId] = useState<string | null>(null);

  const split = paneB !== null;

  const labelOf = (s: Session) => s.title?.trim() || `ssh ${s.n}`;

  const renameSession = useCallback((id: string, title: string) => {
    const clean = title.trim();
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: clean || undefined } : s))
    );
    setEditingId(null);
  }, []);

  const makeSession = useCallback((): Session => {
    counter.current += 1;
    return { id: newId(), n: counter.current };
  }, []);

  const addSession = useCallback(() => {
    const s = makeSession();
    setSessions((prev) => [...prev, s]);
    // La sesión nueva entra en el panel enfocado.
    if (focus === "B" && split) setPaneB(s.id);
    else setPaneA(s.id);
  }, [focus, split, makeSession]);

  // Asigna una sesión al panel enfocado (evita que ambos muestren la misma).
  const selectTab = useCallback(
    (id: string) => {
      if (!split) {
        setPaneA(id);
        return;
      }
      if (focus === "A") {
        if (id === paneB) setPaneB(paneA); // swap
        setPaneA(id);
      } else {
        if (id === paneA) setPaneA(paneB!); // swap
        setPaneB(id);
      }
    },
    [split, focus, paneA, paneB]
  );

  const toggleSplit = useCallback(() => {
    if (split) {
      setPaneB(null);
      setFocus("A");
      return;
    }
    // Buscamos otra sesión distinta a paneA; si no hay, creamos una.
    const other = sessions.find((s) => s.id !== paneA);
    if (other) {
      setPaneB(other.id);
    } else {
      const s = makeSession();
      setSessions((prev) => [...prev, s]);
      setPaneB(s.id);
    }
    setFocus("B");
  }, [split, sessions, paneA, makeSession]);

  const closeSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== id);
        // Siempre dejamos al menos una sesión viva.
        if (remaining.length === 0) {
          counter.current += 1;
          const fresh = { id: newId(), n: counter.current };
          setPaneA(fresh.id);
          setPaneB(null);
          setFocus("A");
          return [fresh];
        }
        // Reparamos los paneles para que apunten a sesiones válidas y distintas.
        setPaneA((a) => {
          setPaneB((b) => {
            const nextA = a === id ? remaining[0].id : a;
            // El panel B se colapsa si se cerró, o si quedó igual que A.
            if (b === id || b === nextA) {
              setFocus("A");
              return null;
            }
            return b;
          });
          return a === id ? remaining[0].id : a;
        });
        return remaining;
      });
    },
    []
  );

  // Atajos sólo cuando el workspace está visible.
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        addSession();
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        toggleSplit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, addSession, toggleSplit]);

  const roleOf = (id: string): "A" | "B" | "hidden" =>
    id === paneA ? "A" : id === paneB ? "B" : "hidden";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-base">
      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b border-border bg-bg-surface/40 px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {sessions.map((s) => {
            const role = roleOf(s.id);
            const isOpen = role !== "hidden";
            const isFocused = split && role === focus;
            const editing = editingId === s.id;
            return (
              <div
                key={s.id}
                onClick={() => !editing && selectTab(s.id)}
                onDoubleClick={() => setEditingId(s.id)}
                onMouseDown={(e) => {
                  // Evita el cursor de auto-scroll del navegador con la rueda.
                  if (e.button === 1) e.preventDefault();
                }}
                onAuxClick={(e) => {
                  // Botón del medio (rueda) → cerrar la pestaña.
                  if (e.button === 1) {
                    e.preventDefault();
                    closeSession(s.id);
                  }
                }}
                className={cn(
                  "group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition",
                  isOpen
                    ? "border-brand-indigo/40 bg-brand-indigo/10 text-text-primary"
                    : "border-transparent text-text-muted hover:bg-bg-hover hover:text-text-primary",
                  isFocused && "ring-1 ring-brand-indigo/60"
                )}
                title="Doble click para renombrar · click central para cerrar"
              >
                <TerminalSquare size={12} className={isOpen ? "text-brand-indigo" : "text-text-dim"} />
                {editing ? (
                  <input
                    autoFocus
                    defaultValue={s.title ?? `ssh ${s.n}`}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => renameSession(s.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameSession(s.id, e.currentTarget.value);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="w-24 bg-transparent font-mono text-text-primary outline-none"
                  />
                ) : (
                  <span className="font-mono">{labelOf(s)}</span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSession(s.id);
                  }}
                  className="rounded p-0.5 text-text-dim opacity-0 transition hover:bg-brand-rose/15 hover:text-brand-rose group-hover:opacity-100"
                  title="Cerrar terminal"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
          <button
            onClick={addSession}
            className="shrink-0 rounded-md p-1 text-text-dim transition hover:bg-bg-hover hover:text-brand-indigo"
            title="Nueva terminal (Ctrl/Cmd+Shift+T)"
          >
            <Plus size={14} />
          </button>
        </div>

        <button
          onClick={toggleSplit}
          className={cn(
            "shrink-0 rounded-md p-1.5 transition",
            split
              ? "bg-brand-indigo/15 text-brand-indigo"
              : "text-text-dim hover:bg-bg-hover hover:text-text-primary"
          )}
          title={split ? "Volver a una terminal (Ctrl/Cmd+Shift+D)" : "Dividir en dos (Ctrl/Cmd+Shift+D)"}
        >
          {split ? <Square size={14} /> : <Columns2 size={14} />}
        </button>
      </div>

      {/* Panes — todas montadas; visibilidad y geometría según el rol */}
      <div className="relative flex-1 overflow-hidden">
        {sessions.map((s) => {
          const role = roleOf(s.id);
          return (
            <div
              key={s.id}
              onMouseDown={() => {
                if (split && role !== "hidden") setFocus(role as Focus);
              }}
              className={cn(
                "absolute top-0 bottom-0",
                split && role === "A" && "border-r border-border"
              )}
              style={paneStyle(role, split)}
            >
              <SSHTerminal
                hostId={hostId}
                hostName={hostName}
                label={`${labelOf(s)} — ${hostName}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function paneStyle(role: "A" | "B" | "hidden", split: boolean): CSSProperties {
  if (role === "hidden") {
    return { left: 0, right: 0, visibility: "hidden", pointerEvents: "none" };
  }
  if (!split) return { left: 0, right: 0 };
  if (role === "A") return { left: 0, width: "50%" };
  return { left: "50%", right: 0 };
}
