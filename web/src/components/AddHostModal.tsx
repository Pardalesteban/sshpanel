import { useEffect, useState } from "react";
import { X, Plus, Save, Plug, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { api, type Host } from "../lib/api";
import { useEscapeClose } from "../lib/hooks";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: Host | null;
}

const EMPTY = {
  name: "",
  host: "",
  port: 22,
  username: "root",
  password: "",
  sudo_password: "",
  tags: "",
};

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; uname: string | null }
  | { status: "fail"; error: string };

export function AddHostModal({ open, onClose, onSaved, editing }: Props) {
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ status: "idle" });

  const isEdit = !!editing;

  useEscapeClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTest({ status: "idle" });
    if (editing) {
      setForm({
        name: editing.name,
        host: editing.host,
        port: editing.port,
        username: editing.username,
        password: "",
        sudo_password: "",
        tags: editing.tags ?? "",
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, editing]);

  if (!open) return null;

  const handleTest = async () => {
    if (!form.host) return;
    setTest({ status: "testing" });
    try {
      const res = await api.testConnection({
        host: form.host,
        port: form.port,
        username: form.username,
        password: form.password || undefined,
        // En edit, el backend completa credenciales vacías con las guardadas
        host_id: editing?.id,
      });
      setTest(
        res.ok
          ? { status: "ok", uname: res.uname ?? null }
          : { status: "fail", error: res.error ?? "Error desconocido" }
      );
    } catch (e: any) {
      setTest({ status: "fail", error: e.message ?? "Error de red" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isEdit && editing) {
        // En edit: passwords vacías = no tocar (mantener actuales)
        const payload: any = {
          name: form.name,
          host: form.host,
          port: form.port,
          username: form.username,
          tags: form.tags,
        };
        if (form.password) payload.password = form.password;
        if (form.sudo_password) payload.sudo_password = form.sudo_password;
        await api.updateHost(editing.id, payload);
      } else {
        await api.createHost({
          name: form.name,
          host: form.host,
          port: form.port,
          username: form.username,
          password: form.password || undefined,
          sudo_password: form.sudo_password || undefined,
          tags: form.tags || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Error al guardar el host");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-bg-elevated p-6 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {isEdit ? "Editar host" : "Nuevo host SSH"}
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {isEdit
                ? "Dejá las contraseñas vacías para mantener las actuales."
                : "Las credenciales se cifran antes de guardarse."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <Field
            label="Nombre"
            placeholder="produccion"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            required
            autoFocus
          />
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <Field
              label="Host / IP"
              placeholder="192.168.1.10"
              value={form.host}
              onChange={(v) => setForm({ ...form, host: v })}
              mono
              required
            />
            <Field
              label="Puerto"
              type="number"
              value={String(form.port)}
              onChange={(v) => setForm({ ...form, port: parseInt(v) || 22 })}
              mono
            />
          </div>
          <Field
            label="Usuario"
            value={form.username}
            onChange={(v) => setForm({ ...form, username: v })}
            mono
            required
          />
          <Field
            label="Contraseña SSH"
            type="password"
            placeholder={
              isEdit
                ? "Vacío = mantener la actual"
                : "Opcional si usás llave SSH"
            }
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
          />
          <Field
            label="Contraseña sudo"
            type="password"
            placeholder={
              isEdit
                ? "Vacío = mantener la actual"
                : "Vacío = usa la contraseña SSH"
            }
            value={form.sudo_password}
            onChange={(v) => setForm({ ...form, sudo_password: v })}
          />
          <Field
            label="Tags"
            placeholder="prod, web, vps  (separados por coma)"
            value={form.tags}
            onChange={(v) => setForm({ ...form, tags: v })}
            mono
          />

          {error && (
            <div className="rounded-md border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-xs text-brand-rose">
              {error}
            </div>
          )}

          {test.status === "ok" && (
            <div className="flex items-center gap-2 rounded-md border border-brand-emerald/30 bg-brand-emerald/10 px-3 py-2 text-xs text-brand-emerald">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>
                Conexión exitosa{test.uname ? ` — ${test.uname}` : ""}
              </span>
            </div>
          )}
          {test.status === "fail" && (
            <div className="flex items-center gap-2 rounded-md border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-xs text-brand-rose">
              <XCircle size={14} className="shrink-0" />
              <span className="break-all">{test.error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={test.status === "testing" || !form.host}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-muted transition hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
            >
              {test.status === "testing" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plug size={14} />
              )}
              {test.status === "testing" ? "Probando…" : "Probar conexión"}
            </button>
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-violet px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-violet-hover hover:shadow-glow disabled:opacity-50"
            >
              {isEdit ? <Save size={14} /> : <Plus size={14} />}
              {saving
                ? "Guardando…"
                : isEdit
                  ? "Guardar cambios"
                  : "Crear host"}
            </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
  required?: boolean;
  autoFocus?: boolean;
}

function Field({ label, value, onChange, type = "text", placeholder, mono, required, autoFocus }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-luxe text-text-dim">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        className={`w-full rounded-md border border-border bg-bg-base/60 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-dim transition focus:border-brand-violet/60 focus:outline-none focus:ring-2 focus:ring-brand-violet/20 ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}
