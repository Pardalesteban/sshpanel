import { useEffect, useRef, useState } from "react";
import { X, Download, Upload, Lock } from "lucide-react";
import { useEscapeClose } from "../lib/hooks";
import { apiUrl } from "../lib/api";

type Mode = "export" | "import" | null;

export function ConfigDialog() {
  const [mode, setMode] = useState<Mode>(null);
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onExport = () => {
      reset();
      setMode("export");
    };
    const onImport = () => {
      reset();
      setMode("import");
    };
    window.addEventListener("sshpanel:export", onExport);
    window.addEventListener("sshpanel:import", onImport);
    return () => {
      window.removeEventListener("sshpanel:export", onExport);
      window.removeEventListener("sshpanel:import", onImport);
    };
  }, []);

  const reset = () => {
    setPassword("");
    setFile(null);
    setError(null);
    setDone(null);
    setBusy(false);
  };

  const close = () => {
    setMode(null);
    reset();
  };

  useEscapeClose(mode !== null, close);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "export") {
        const res = await fetch(apiUrl("/api/hosts/export"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!res.ok) throw new Error("Error exportando la config");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "sshpanel-config.enc";
        a.click();
        URL.revokeObjectURL(url);
        setDone("Archivo descargado");
      } else if (mode === "import" && file) {
        const form = new FormData();
        form.append("file", file);
        form.append("password", password);
        const res = await fetch(apiUrl("/api/hosts/import"), {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || "Error importando");
        }
        const data = await res.json();
        const parts: string[] = [];
        if (data.hosts_imported) parts.push(`${data.hosts_imported} nuevos`);
        if (data.hosts_updated) parts.push(`${data.hosts_updated} actualizados`);
        setDone(parts.length ? parts.join(", ") : "No había hosts en el archivo");
      }
    } catch (e: any) {
      setError(e.message ?? "Error");
    } finally {
      setBusy(false);
    }
  };

  if (!mode) return null;

  const isExport = mode === "export";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in"
      onClick={close}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-bg-elevated p-6 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-md text-brand-amber"
              style={{ background: "rgba(245, 158, 11, 0.12)" }}
            >
              {isExport ? <Download size={16} /> : <Upload size={16} />}
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {isExport ? "Exportar configuración" : "Importar configuración"}
              </h2>
              <p className="mt-0.5 text-xs text-text-muted">
                {isExport
                  ? "Tu config cifrada con la contraseña que elijas."
                  : "Subí el archivo y la contraseña con la que se cifró."}
              </p>
            </div>
          </div>
          <button
            onClick={close}
            className="rounded-md p-1 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="rounded-md border border-brand-emerald/30 bg-brand-emerald/10 px-3 py-3 text-sm text-brand-emerald">
            {done}
            <div className="mt-3">
              <button
                onClick={close}
                className="rounded-md bg-bg-elevated px-3 py-1.5 text-sm text-text-primary transition hover:bg-bg-hover"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3.5">
            {!isExport && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-luxe text-text-dim">
                  Archivo
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".enc,.json"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  required
                  className="block w-full text-sm text-text-primary file:mr-3 file:rounded-md file:border-0 file:bg-bg-base file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text-muted hover:file:bg-bg-hover"
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-luxe text-text-dim">
                <Lock size={10} />
                Contraseña
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                placeholder={
                  isExport
                    ? "Elegí una contraseña fuerte"
                    : "La contraseña usada al exportar"
                }
                className="w-full rounded-md border border-border bg-bg-base/60 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-dim transition focus:border-brand-violet/60 focus:outline-none focus:ring-2 focus:ring-brand-violet/20"
              />
            </label>

            {error && (
              <div className="rounded-md border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-xs text-brand-rose">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                className="rounded-md px-3 py-1.5 text-sm text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-violet px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-violet-hover hover:shadow-glow disabled:opacity-50"
              >
                {isExport ? <Download size={14} /> : <Upload size={14} />}
                {busy
                  ? "Procesando…"
                  : isExport
                    ? "Descargar"
                    : "Importar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
