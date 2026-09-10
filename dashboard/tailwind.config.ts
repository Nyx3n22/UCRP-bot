import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101320",        // tło - głęboki granat/atrament
        parchment: "#efe8d8",  // tekst podstawowy - pergamin
        brass: "#c9a15a",      // akcent - mosiądz/złoto
        brasslight: "#dcbf85", // jaśniejszy mosiądz (hovers, highlights)
        burgundy: "#8a2547",   // akcent drugorzędny / stany negatywne
        panel: "#171b29",      // tło kart
        linesoft: "#232839",   // delikatne linie wewnętrzne
        line: "#2b3047",       // linie/obramowania
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        body: ["var(--font-outfit)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px -6px rgba(201, 161, 90, 0.45)",
        "glow-soft": "0 0 40px -12px rgba(201, 161, 90, 0.35)",
        card: "inset 0 1px 0 rgba(239, 232, 216, 0.045), 0 14px 34px -22px rgba(0, 0, 0, 0.85)",
        "card-hover":
          "inset 0 1px 0 rgba(239, 232, 216, 0.05), 0 18px 40px -20px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(201, 161, 90, 0.12)",
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(180deg, #d7ae67 0%, #c3964d 100%)",
        "gold-text": "linear-gradient(120deg, #f0d9a0 0%, #c9a15a 45%, #e9cd8a 70%, #c9a15a 100%)",
      },
      keyframes: {
        "page-rise": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(24px, -20px) scale(1.06)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        shine: {
          "0%": { transform: "translateX(-120%) skewX(-18deg)" },
          "100%": { transform: "translateX(240%) skewX(-18deg)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(0.82)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(201, 161, 90, 0.35)" },
          "50%": { boxShadow: "0 0 0 7px rgba(201, 161, 90, 0)" },
        },
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        pop: {
          "0%": { opacity: "0", transform: "scale(0.92)" },
          "60%": { opacity: "1", transform: "scale(1.02)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "page-rise": "page-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        float: "float 5s ease-in-out infinite",
        "float-slow": "float-slow 14s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        shine: "shine 0.9s ease",
        "pulse-dot": "pulse-dot 1.8s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2.6s ease-in-out infinite",
        "spin-slow": "spin-slow 14s linear infinite",
        "gradient-pan": "gradient-pan 7s ease-in-out infinite",
        pop: "pop 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
export default config;
