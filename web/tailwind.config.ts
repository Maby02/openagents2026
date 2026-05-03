import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // warm dark palette — slightly green-tinged neutrals
        ink: {
          50: "#f7f7f8",
          100: "#ececef",
          200: "#cdcfd5",
          300: "#a4a8b3",
          400: "#6c7080",
          500: "#5a5e6b",
          600: "#3f424b",
          700: "#2f3139",
          800: "#23252c",
          900: "#181a20",
          925: "#111217",
          950: "#0a0b0e",
        },
        accent: {
          DEFAULT: "#a3e635",       // lime-400 (live, active, paid)
          dim: "#7eb928",
          soft: "#1c2410",
          glow: "rgba(163,230,53,0.18)",
        },
        signal: {
          forecast: "#7dd3fc",      // sky-300
          share: "#fde68a",          // amber-200
          ree: "#c084fc",            // purple-400
          trade: "#f0abfc",           // fuchsia-300
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "Menlo", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        wider2: "0.08em",
      },
    },
  },
  plugins: [],
};

export default config;
