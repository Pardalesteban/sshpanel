/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0c0d10",
          surface: "#15171c",
          elevated: "#1e2028",
          hover: "#22252e",
        },
        border: {
          DEFAULT: "#2a2d36",
          strong: "#3a3e4a",
        },
        text: {
          primary: "#f5f5f7",
          muted: "#9aa0ab",
          dim: "#5c626d",
        },
        brand: {
          violet: "#8b5cf6",
          "violet-hover": "#a78bfa",
          cyan: "#22d3ee",
          emerald: "#10b981",
          amber: "#f59e0b",
          rose: "#f43f5e",
          indigo: "#6366f1",
          pink: "#ec4899",
        },
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(139, 92, 246, 0.4), 0 0 20px rgba(139, 92, 246, 0.15)",
        "glow-emerald": "0 0 0 1px rgba(16, 185, 129, 0.4), 0 0 20px rgba(16, 185, 129, 0.15)",
        elevated: "0 8px 24px rgba(0, 0, 0, 0.4)",
      },
      animation: {
        "fade-in": "fadeIn 150ms ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
    },
  },
  plugins: [],
};
