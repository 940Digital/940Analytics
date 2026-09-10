import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "charcoal-dark": "#1B1D21",
        "charcoal-mid": "#1E2125",
        "charcoal-text": "#2B2E33",
        "blue-accent": "#3194E0",
        "blue-hover": "#2570AE",
        sand: "#F7F1E7",
        "grey-light": "#B8BBC2",
        "grey-muted": "#7B7E85",
        "brown-muted": "#8A8272",
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
