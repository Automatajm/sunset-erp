import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // NetSuite-inspired dark theme
        background: "#0f172a", // slate-900
        foreground: "#f1f5f9", // slate-100
        primary: {
          DEFAULT: "#1e40af", // Deep blue
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#334155", // slate-700
          foreground: "#f1f5f9",
        },
        muted: {
          DEFAULT: "#1e293b", // slate-800
          foreground: "#94a3b8", // slate-400
        },
        accent: {
          DEFAULT: "#3b82f6", // blue-500
          foreground: "#ffffff",
        },
        card: {
          DEFAULT: "#1e293b", // slate-800
          foreground: "#f1f5f9",
        },
        border: "#334155", // slate-700
        success: "#22c55e", // green-500
        warning: "#f59e0b", // amber-500
        danger: "#ef4444", // red-500
      },
    },
  },
  plugins: [],
};

export default config;
