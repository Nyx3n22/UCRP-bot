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
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
