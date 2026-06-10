import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Genera un gradient determinístico a partir de un string (nombre del host).
 * Estilo "identicon" pero con dos colores que combinan.
 */
const GRADIENT_PAIRS: [string, string][] = [
  ["#8b5cf6", "#ec4899"],
  ["#22d3ee", "#6366f1"],
  ["#10b981", "#22d3ee"],
  ["#f59e0b", "#f43f5e"],
  ["#ec4899", "#6366f1"],
  ["#6366f1", "#8b5cf6"],
  ["#10b981", "#6366f1"],
  ["#22d3ee", "#8b5cf6"],
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
