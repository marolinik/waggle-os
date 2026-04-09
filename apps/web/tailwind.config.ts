import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        /* ── Hive DS: Status colors ──────────────────────────────────── */
        status: {
          healthy: "var(--status-healthy)",
          warning: "var(--status-warning)",
          error: "var(--status-error)",
          info: "var(--status-info)",
          ai: "var(--status-ai)",
        },
        /* ── Hive DS: Honey scale ────────────────────────────────────── */
        honey: {
          50: "var(--honey-50)",
          100: "var(--honey-100)",
          200: "var(--honey-200)",
          300: "var(--honey-300)",
          400: "var(--honey-400)",
          500: "var(--honey-500)",
          600: "var(--honey-600)",
        },
        /* ── Hive DS: Hive grays ─────────────────────────────────────── */
        hive: {
          50: "var(--hive-50)",
          100: "var(--hive-100)",
          200: "var(--hive-200)",
          300: "var(--hive-300)",
          400: "var(--hive-400)",
          500: "var(--hive-500)",
          600: "var(--hive-600)",
          700: "var(--hive-700)",
          800: "var(--hive-800)",
          850: "var(--hive-850)",
          900: "var(--hive-900)",
          950: "var(--hive-950)",
        },
      },
      /* ── Hive DS: Type Scale ──────────────────────────────────────── */
      fontSize: {
        'micro': 'var(--text-micro)',
        'caption': 'var(--text-caption)',
        'body-sm': 'var(--text-body-sm)',
        'body': 'var(--text-body)',
        'title': 'var(--text-title)',
        'heading': 'var(--text-heading)',
        'display': 'var(--text-display)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "dock-bounce": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "window-open": {
          "0%": { opacity: "0", transform: "scale(0.9) translateY(20px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        /* ── Hive DS Animations ─────────────────────────────────────── */
        "honey-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(229, 160, 0, 0)" },
          "50%": { boxShadow: "0 0 12px 4px rgba(229, 160, 0, 0.3)" },
        },
        "heartbeat": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.7", transform: "scale(0.9)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
        "hex-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "card-enter": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "token-fade": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "send-flash": {
          "0%": { borderColor: "var(--honey-500)" },
          "100%": { borderColor: "var(--hive-700)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "dock-bounce": "dock-bounce 0.4s ease-in-out",
        "window-open": "window-open 0.3s ease-out",
        "fade-up": "fade-up 0.4s ease-out",
        /* ── Hive DS Animations ─────────────────────────────────────── */
        "honey-pulse": "honey-pulse 0.6s ease-in-out",
        "heartbeat": "heartbeat 2s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
        "hex-spin": "hex-spin 2s linear infinite",
        "card-enter": "card-enter 0.2s ease-out",
        "token-fade": "token-fade 0.04s ease-in forwards",
        "send-flash": "send-flash 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
