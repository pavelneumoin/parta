import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Парта-палитра — спокойная, школьная, не «стартап-неон».
        // Бумага off-white, не #fff — иначе на планшете под лампой бликует.
        paper: "#fbfaf6",
        ink:   "#0f1115",
        chalk: "#f4f1e8",
        rule:  "#e3dfd1",
        // CTA — тёмная зелень «школьной доски», не edtech-синий
        accent: "#1e6f5c",
        red:   "#d11a2a",
        blue:  "#1f5fc9",
        green: "#2e8b3d",
        toolbar: "#1a1f2b",
        toolbarHover: "#2a3142",
        toolbarActive: "#3a4360",
        dim:   "#7a7468"
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto",
          '"Helvetica Neue"', "sans-serif"
        ],
        mono: [
          "ui-monospace", '"SF Mono"', "Menlo", "Consolas", "monospace"
        ]
      }
    }
  },
  plugins: []
};

export default config;
