import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12141c",       // tło - głęboki granat/atrament
        parchment: "#efe8d8", // tekst podstawowy - pergamin
        brass: "#c9a15a",     // akcent - mosiądz/złoto
        burgundy: "#7a1f3d",  // akcent drugorzędny
        panel: "#1b1e2b",     // tło kart
        line: "#2c3044",      // linie/obramowania
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
