import { useState } from "react";
import { X, ChevronRight, Copy, Check } from "lucide-react";
import type { ExecResult } from "../lib/api";
import { cn } from "../lib/utils";
import { useEscapeClose } from "../lib/hooks";

interface Props {
  open: boolean;
  hostName: string;
  result: ExecResult | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

export function ExecResultModal({
  open,
  hostName,
  result,
  loading,
  error,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);

  useEscapeClose(open, onClose);

  if (!open) return null;

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.stdout || result.stderr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const ok = result && result.exit_code === 0;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-start justify-center p-4 pt-[10vh] animate-fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative flex h-[70vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 font-mono text-sm">
            <ChevronRight size={14} className="flex-shrink-0 text-brand-indigo" />
            <span className="truncate text-text-primary">
              {result?.command ?? "…"}
            </span>
            <span className="text-text-dim">en</span>
            <span className="truncate text-brand-violet">{hostName}</span>
          </div>
          <div className="flex items-center gap-1">
            {result && (
              <button
                onClick={handleCopy}
                className="rounded-md p-1.5 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
                title="Copiar output"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-text-dim transition hover:bg-bg-hover hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        {/* Status pill */}
        {result && (
          <div className="border-b border-border px-5 py-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
                ok
                  ? "bg-brand-emerald/10 text-brand-emerald"
                  : "bg-brand-rose/10 text-brand-rose"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  ok ? "bg-brand-emerald" : "bg-brand-rose"
                )}
              />
              exit {result.exit_code}
            </span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-bg-base p-4 font-mono text-xs leading-relaxed">
          {loading ? (
            <div className="text-text-dim">Ejecutando…</div>
          ) : error ? (
            <pre className="whitespace-pre-wrap text-brand-rose">{error}</pre>
          ) : result ? (
            <>
              {result.stdout && (
                <pre className="whitespace-pre-wrap text-text-primary">
                  {result.stdout}
                </pre>
              )}
              {result.stderr && (
                <pre className="mt-3 whitespace-pre-wrap border-l-2 border-brand-rose/50 pl-3 text-brand-rose">
                  {result.stderr}
                </pre>
              )}
              {!result.stdout && !result.stderr && (
                <div className="text-text-dim">(sin output)</div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
