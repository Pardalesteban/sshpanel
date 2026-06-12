import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Detección de plataforma para mostrar el modificador correcto en la UI:
 * macOS usa ⌘ (metaKey), Windows/Linux usan Ctrl. Los handlers ya aceptan
 * ambos (metaKey || ctrlKey) — esto es solo presentación.
 */
export const isMac: boolean =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(
    (navigator as any).userAgentData?.platform ?? navigator.platform ?? ""
  );

export const MOD_KEY = isMac ? "⌘" : "Ctrl";

/** "K" → "⌘K" en macOS, "Ctrl+K" en Windows/Linux. */
export function modShortcut(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}

/**
 * Genera un gradient determinístico a partir de un string (nombre del host).
 * Estilo "identicon" pero con dos colores que combinan.
 */
const GRADIENT_PAIRS: [string, string][] = [
  ["#9d87f5", "#ef6eae"],
  ["#5cd3e6", "#7c84f5"],
  ["#2dd49e", "#5cd3e6"],
  ["#e3a857", "#ef5d77"],
  ["#ef6eae", "#7c84f5"],
  ["#7c84f5", "#9d87f5"],
  ["#2dd49e", "#7c84f5"],
  ["#5cd3e6", "#9d87f5"],
];

export function hashGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const [a, b] = GRADIENT_PAIRS[Math.abs(hash) % GRADIENT_PAIRS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function initials(name: string): string {
  return name
    .split(/[\s\-_.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}
