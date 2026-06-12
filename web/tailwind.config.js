/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#09090c",
          surface: "#0f0f14",
          elevated: "#15151c",
          hover: "#1a1a23",
        },
        border: {
          DEFAULT: "#1e1e27",
          strong: "#2b2b38",
        },
        text: {
          primary: "#f2f1f4",
          muted: "#9596a2",
          dim: "#5d5e6b",
        },
        brand: {
          violet: "#9d87f5",
          "violet-hover": "#b6a5fa",
          cyan: "#5cd3e6",
          emerald: "#2dd49e",
          amber: "#e3a857",
          rose: "#ef5d77",
          indigo: "#7c84f5",
          pink: "#ef6eae",
        },
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
        display: ["Instrument Serif", "Georgia", "serif"],
      },
      borderRadius: {
        sm: "7px",
        md: "11px",
        lg: "16px",
        xl: "22px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(157, 135, 245, 0.35), 0 4px 24px -4px rgba(157, 135, 245, 0.25)",
        "glow-emerald": "0 0 0 1px rgba(45, 212, 158, 0.35), 0 4px 24px -4px rgba(45, 212, 158, 0.25)",
        elevated:
          "0 1px 2px rgba(0, 0, 0, 0.5), 0 12px 32px -8px rgba(0, 0, 0, 0.55)",
        card: "inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 1px 3px rgba(0, 0, 0, 0.35)",
      },
      letterSpacing: {
        luxe: "0.18em",
      },
      animation: {
        "fade-in": "fadeIn 200ms cubic-bezier(0.22, 1, 0.36, 1)",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
    },
  },
  plugins: [],
};
