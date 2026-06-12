import { Server, Plus } from "lucide-react";

interface Props {
  onAdd: () => void;
}

export function EmptyState({ onAdd }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center animate-fade-in">
      <div className="relative mb-6">
        <div
          className="absolute inset-0 blur-2xl opacity-30"
          style={{
            background: "linear-gradient(135deg, #9d87f5 0%, #ef6eae 100%)",
          }}
        />
        <div
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl text-white"
          style={{
            background: "linear-gradient(135deg, #9d87f5 0%, #ef6eae 100%)",
          }}
        >
          <Server size={28} strokeWidth={2} />
        </div>
      </div>

      <h2 className="font-display text-3xl tracking-wide text-text-primary">
        Conectá tu primer servidor
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-text-muted">
        Guardá tus conexiones SSH y administrá Docker, logs y terminales en un
        solo lugar.
      </p>

      <button
        onClick={onAdd}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-brand-violet px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-violet-hover hover:shadow-glow"
      >
        <Plus size={16} />
        Agregar host
      </button>
    </div>
  );
}
