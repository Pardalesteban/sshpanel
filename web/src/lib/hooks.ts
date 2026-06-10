import { useEffect } from "react";

/**
 * Cierra un modal con Escape mientras esté abierto. Se registra en captura
 * para ganarle a handlers globales (p. ej. los atajos de App.tsx).
 */
export function useEscapeClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [active, onClose]);
}
