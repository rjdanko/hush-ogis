import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Design Brief palette anchor; expanded in later phases.
        ink: "#0E1116",
        mist: "#F4F6F8",
      },
    },
  },
  plugins: [],
} satisfies Config;
