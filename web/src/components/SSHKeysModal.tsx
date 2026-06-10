import { useEffect, useState } from "react";
import { X, Key, Sparkles, ClipboardPaste, Copy, Check, Trash2, AlertCircle, ShieldCheck } from "lucide-react";
import { api, type KeyStatus } from "../lib/api";
import { cn } from "../lib/utils";
import { useEscapeClose } from "../lib/hooks";

interface Props {
  open: boolean;
  hostId: string;
  hostName: string;
  onClose: () => void;
  onChange?: () => void; // dispara refresh del host (private_key_path puede haber cambiado)
}

type Mode = "generate" | "paste";

export function SSHKeysModal({ open, hostId, hostName, onClose, onChange }: Props) {
  const [mode, setMode] = useState<Mode>("generate");
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [pastedKey, setPastedKey] = useState("");
  const [comment, setComment] = useState("sshpanel");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ public_key: string; fingerprint: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    setPastedKey("");
    setMode("generate");
    api.keyStatus(hostId).then(setStatus).catch(() => setStatus(null));
  }, [open, hostId]);

  // No cerrar con Esc mientras instala (el request sigue corriendo en el remoto)
  useEscapeClose(open && !working, onClose);

  if (!open) return null;

  const handleInstall = async () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      const body = mode === "generate"
        ? { generate: true, comment }
        : { generate: false, public_key: pastedKey };
      const res = await api.installKey(hostId, body);
      setResult({
        public_key: res.public_key,
        fingerprint: res.fingerprint,
        message: res.message,
      });
      // Refresca status para el footer
      api.keyStatus(hostId).then(setStatus).catch(() => {});
      onChange?.();
    } catch (e: any) {
      setError(e.message ?? "Error");
    } finally {
      setWorking(false);
    }
  };

  const handleDeleteLocal = async () => {
    if (!confirm("¿Borrar la clave guardada localmente? Esto NO la quita del remoto.")) return;
    setWorking(true);
    try {
      await api.deleteLocalKey(hostId);
      const next = await api.keyStatus(hostId);
      setStatus(next);
      setResult(null);
      onChange?.();
    } catch (e: any) {
      setError(e.message ?? "Error");
    } finally {
      setWorking(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-xl rounded-xl border border-border bg-bg-elevated p-6 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-md text-white"
              style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
            >
              <Key size={16} />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Claves SSH</h2>
              <p className="mt-0.5 text-xs text-text-muted">
                <span className="font-mono">{hostName}</span> · instalar clave pública en
                <span className="font-mono"> ~/.ssh/authorized_keys</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Status actual */}
        {status && (
          <div className="mb-4 rounded-md border border-border bg-bg-base/40 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              {status.in_use_by_host ? (
                <span className="inline-flex items-center gap-1 text-brand-emerald">
                  <ShieldCheck size={12} />
                  Este host está usando key-auth
                </span>
              ) : status.has_local_key ? (
                <span className="inline-flex items-center gap-1 text-brand-amber">
                  <Key size={12} />
                  Hay una clave local guardada pero el host usa contraseña
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-text-dim">
                  <Key size={12} />
                  Sin clave local para este host
                </span>
              )}
            </div>
            {status.fingerprint && (
              <div className="mt-1 font-mono text-[10px] text-text-dim">
                {status.fingerprint}
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-md bg-bg-base/60 p-1">
          <TabBtn active={mode === "generate"} onClick={() => setMode("generate")} icon={<Sparkles size={12} />}>
            Generar nueva
          </TabBtn>
          <TabBtn active={mode === "paste"} onClick={() => setMode("paste")} icon={<ClipboardPaste size={12} />}>
            Pegar existente
          </TabBtn>
        </div>

        {/* Body */}
        {mode === "generate" ? (
          <div className="space-y-3">
            <p className="text-xs text-text-muted">
              Genera un par ed25519 localmente. La privada se guarda cifrada en
              <span className="font-mono"> ~/.sshpanel/keys/</span> con permisos 0600 y
              se asocia automáticamente al host (próxima conexión usa key-auth).
            </p>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-dim">
                Comentario
              </span>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="sshpanel"
                className="w-full rounded-md border border-border bg-bg-base/60 px-3 py-1.5 font-mono text-sm text-text-primary focus:border-brand-violet/60 focus:outline-none focus:ring-2 focus:ring-brand-violet/20"
              />
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-text-muted">
              Pegá una clave pública existente (formato OpenSSH:
              <span className="font-mono"> ssh-ed25519 AAAA…</span>). Se appendea
              al <span className="font-mono">authorized_keys</span> del remoto sin duplicar.
            </p>
            <textarea
              value={pastedKey}
              onChange={(e) => setPastedKey(e.target.value)}
              placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... usuario@host"
              rows={4}
              className="w-full resize-none rounded-md border border-border bg-bg-base/60 px-3 py-2 font-mono text-[11px] text-text-primary focus:border-brand-violet/60 focus:outline-none focus:ring-2 focus:ring-brand-violet/20"
            />
          </div>
        )}

        {/* Errores */}
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-xs text-brand-rose">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className="mt-4 space-y-2 rounded-md border border-brand-emerald/30 bg-brand-emerald/10 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-brand-emerald">
              <Check size={12} />
              {result.message || "Instalada correctamente"}
            </div>
            <div className="rounded border border-border bg-bg-base/60 p-2">
              <div className="flex items-start justify-between gap-2">
                <pre className="flex-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] text-text-muted">
                  {result.public_key}
                </pre>
                <button
                  onClick={() => copy(result.public_key)}
                  title="Copiar pública"
                  className="flex-shrink-0 rounded p-1 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
                >
                  {copied ? <Check size={12} className="text-brand-emerald" /> : <Copy size={12} />}
                </button>
              </div>
              {result.fingerprint && (
                <div className="mt-1 font-mono text-[10px] text-text-dim">
                  {result.fingerprint}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between gap-2">
          {status?.has_local_key ? (
            <button
              onClick={handleDeleteLocal}
              disabled={working}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-text-dim transition hover:bg-brand-rose/10 hover:text-brand-rose disabled:opacity-50"
            >
              <Trash2 size={11} />
              Borrar clave local
            </button>
          ) : <span />}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
            >
              Cerrar
            </button>
            <button
              onClick={handleInstall}
              disabled={working || (mode === "paste" && !pastedKey.trim())}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-violet px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-violet-hover hover:shadow-glow disabled:opacity-50"
            >
              <Key size={13} />
              {working ? "Instalando…" : mode === "generate" ? "Generar e instalar" : "Instalar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition",
        active
          ? "bg-bg-elevated text-text-primary shadow-sm"
          : "text-text-dim hover:text-text-muted"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
