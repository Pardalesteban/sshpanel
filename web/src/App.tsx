import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { EmptyState } from "./components/EmptyState";
import { HostDetail } from "./components/HostDetail";
import { OverviewPanel } from "./components/OverviewPanel";
import { UpdateBanner } from "./components/UpdateBanner";
import { AboutPanel } from "./components/AboutPanel";
import { updater } from "./lib/updater";
import { AddHostModal } from "./components/AddHostModal";
import { CommandPalette } from "./components/CommandPalette";
import { ConfigDialog } from "./components/ConfigDialog";
import { ExecResultModal } from "./components/ExecResultModal";
import { api, type Host, type ExecResult } from "./lib/api";

export type Tab = "overview" | "containers" | "compose" | "terminal" | "system" | "agent";

const TABS_KEY = "sshpanel:tabs";

function loadTabs(): Record<string, Tab> {
  try {
    return JSON.parse(localStorage.getItem(TABS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export default function App() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"host" | "overview">("host");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tabs, setTabs] = useState<Record<string, Tab>>(loadTabs);
  const [openedTerminals, setOpenedTerminals] = useState<string[]>([]);
  const [openedSystems, setOpenedSystems] = useState<string[]>([]);
  const [openedAgents, setOpenedAgents] = useState<string[]>([]);
  const [openedLogs, setOpenedLogs] = useState<
    Array<{ hostId: string; containerId: string; containerName: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [exec, setExec] = useState<{
    open: boolean;
    hostName: string;
    result: ExecResult | null;
    loading: boolean;
    error: string | null;
  }>({ open: false, hostName: "", result: null, loading: false, error: null });

  const runCommand = async (hostId: string, command: string) => {
    const host = hosts.find((h) => h.id === hostId);
    setExec({
      open: true,
      hostName: host?.name ?? "",
      result: null,
      loading: true,
      error: null,
    });
    try {
      const result = await api.execCommand(hostId, command);
      setExec((s) => ({ ...s, result, loading: false }));
    } catch (e: any) {
      setExec((s) => ({
        ...s,
        error: e.message ?? "Error al ejecutar",
        loading: false,
      }));
    }
  };

  const tab: Tab = selectedId ? (tabs[selectedId] ?? "overview") : "overview";

  const setTab = (next: Tab) => {
    if (!selectedId) return;
    if (next === "terminal") {
      setOpenedTerminals((prev) =>
        prev.includes(selectedId) ? prev : [...prev, selectedId]
      );
    }
    if (next === "system") {
      setOpenedSystems((prev) =>
        prev.includes(selectedId) ? prev : [...prev, selectedId]
      );
    }
    if (next === "agent") {
      setOpenedAgents((prev) =>
        prev.includes(selectedId) ? prev : [...prev, selectedId]
      );
    }
    setTabs((prev) => {
      const updated = { ...prev, [selectedId]: next };
      localStorage.setItem(TABS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const refresh = async () => {
    try {
      const data = await api.listHosts();
      setHosts(data);
      // functional update para evitar stale closure del polling
      setSelectedId((current) =>
        current ?? (data.length > 0 ? data[0].id : null)
      );
      const ids = new Set(data.map((h) => h.id));
      // limpia tabs guardados para hosts que ya no existen
      setTabs((prev) => {
        const cleaned = Object.fromEntries(
          Object.entries(prev).filter(([id]) => ids.has(id))
        );
        if (Object.keys(cleaned).length !== Object.keys(prev).length) {
          localStorage.setItem(TABS_KEY, JSON.stringify(cleaned));
        }
        return cleaned;
      });
      // limpia terminales, system panels y logs abiertos de hosts eliminados
      setOpenedTerminals((prev) => prev.filter((id) => ids.has(id)));
      setOpenedSystems((prev) => prev.filter((id) => ids.has(id)));
      setOpenedAgents((prev) => prev.filter((id) => ids.has(id)));
      setOpenedLogs((prev) => prev.filter((l) => ids.has(l.hostId)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  // Auto-updater: chequea al arranque (debounce 2s) + cada 6h
  useEffect(() => {
    updater.init();
    return () => updater.dispose();
  }, []);

  // Atajos globales
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((p) => !p);
      }
      if (mod && e.key.toLowerCase() === "t" && selected?.connected) {
        e.preventDefault();
        setTab("terminal");
      }
      if (mod && e.key.toLowerCase() === "d" && selected?.connected) {
        e.preventDefault();
        setTab("containers");
      }
      if (mod && e.key.toLowerCase() === "s" && selected?.connected) {
        e.preventDefault();
        setTab("system");
      }
      if (mod && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setView("overview");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, hosts]);

  const selected = hosts.find((h) => h.id === selectedId) ?? null;

  const handleSelectHost = (id: string) => {
    setSelectedId(id);
    setView("host");
    // el tab se recupera del map por host — no resetear acá
  };

  const openLogs = (hostId: string, containerId: string, containerName: string) => {
    // máx 1 log activo por host — abrir uno nuevo cierra el anterior
    setOpenedLogs((prev) => [
      ...prev.filter((l) => l.hostId !== hostId),
      { hostId, containerId, containerName },
    ]);
  };

  const closeLogs = (hostId: string) => {
    setOpenedLogs((prev) => prev.filter((l) => l.hostId !== hostId));
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <UpdateBanner onOpenAbout={() => setAboutOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
      <Sidebar
        hosts={hosts}
        selectedId={view === "host" ? selectedId : null}
        overviewActive={view === "overview"}
        onSelect={handleSelectHost}
        onOpenOverview={() => setView("overview")}
        onAddHost={() => setModalOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
      />

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-text-dim">
            Cargando…
          </div>
        ) : view === "overview" && hosts.length > 0 ? (
          <OverviewPanel onSelectHost={handleSelectHost} />
        ) : selected ? (
          <HostDetail
            host={selected}
            onChange={refresh}
            tab={tab}
            onTabChange={setTab}
            openedTerminals={openedTerminals}
            openedSystems={openedSystems}
            openedAgents={openedAgents}
            openedLogs={openedLogs}
            onOpenLogs={openLogs}
            onCloseLogs={closeLogs}
            onEdit={() => {
              setEditingHost(selected);
              setModalOpen(true);
            }}
            hosts={hosts}
          />
        ) : (
          <EmptyState onAdd={() => setModalOpen(true)} />
        )}
      </main>

      <AddHostModal
        open={modalOpen}
        editing={editingHost}
        onClose={() => {
          setModalOpen(false);
          setEditingHost(null);
        }}
        onSaved={refresh}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        ctx={{
          hosts,
          selectedHost: selected,
          onSelectHost: handleSelectHost,
          onAddHost: () => setModalOpen(true),
          onEditHost: (h) => {
            setEditingHost(h);
            setModalOpen(true);
          },
          onOpenTab: setTab,
          onRefresh: refresh,
          onExecCommand: runCommand,
        }}
      />

      <ConfigDialog />

      <ExecResultModal
        open={exec.open}
        hostName={exec.hostName}
        result={exec.result}
        loading={exec.loading}
        error={exec.error}
        onClose={() => setExec((s) => ({ ...s, open: false }))}
      />

      <AboutPanel open={aboutOpen} onClose={() => setAboutOpen(false)} />
      </div>
    </div>
  );
}
