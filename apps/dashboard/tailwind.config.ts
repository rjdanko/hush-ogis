import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paper world — light mode operator dashboard
        paper: "#F5F1EA",
        surface: "#FBF8F2",
        ink: "#22201D",          // warm near-black text
        charcoal: "#4A463F",     // secondary text
        "warm-border": "#E4DDD1",
        "warm-muted": "#6B6560",
        mist: "#F4F6F8",
        // Dark bg — login brand panel, future contrast elements
        "night-bg": "#0E1116",
        // Night world — retained for design system parity with mobile
        "night-card": "#23201A",
        "night-border": "#34301F",
        "night-text": "#F2ECE0",
        "night-muted": "#8A7E6C",
        "night-hint": "#C9C0AE",
        "night-label": "#8A7A54",
        // Quiet Index glow scale — the only place color carries meaning
        "glow-high": "#E8C170",
        "glow-mid": "#D9A85E",
        "glow-low": "#8A98A6",
        "glow-none": "#3A3A3A",
        // Semantic + accent
        accent: "#6B7F6E",
        alert: "#B07A5E",
        reward: "#C9A24B",
      },
      fontFamily: {
        display: ["var(--font-newsreader)", "Georgia", "serif"],
        sans: ["var(--font-hanken)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "12px",
        DEFAULT: "16px",
        lg: "24px",
        full: "9999px",
      },
      keyframes: {
        "qi-breathe": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        "row-flash": {
          "0%": { backgroundColor: "rgba(232,193,112,0.10)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        "qi-breathe": "qi-breathe 4s ease-in-out infinite",
        "row-flash": "row-flash 600ms ease-out forwards",
      },
    },
  },
  plugins: [],
} satisfies Config;
