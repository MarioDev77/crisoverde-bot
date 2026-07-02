import type { Config } from "tailwindcss";

// ─── Sistema de tokens — Crisoverde ────────────────────────────────────────
// Paleta pensada a partir do assunto: reflorestamento/reciclagem (verdes),
// a Crisomoeda (dourado envelhecido, não um dourado genérico de "prêmio"),
// e um papel com leve matiz esverdeada em vez do bege genérico comum em UI
// gerada por IA.

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#EEF2EA",       // fundo base — papel com matiz verde-acinzentado
        ink: "#152018",         // texto principal — quase preto, puxado pra verde
        forest: {
          DEFAULT: "#1F5C3F",
          dark: "#123826",
          light: "#2F7A54",
        },
        moss: "#5C7A64",
        gold: {
          DEFAULT: "#C69B3A",   // Crisomoeda
          dark: "#9C7A28",
        },
        rust: "#B3492F",        // usado só para erro/alerta, com moderação
        line: "#D9DFD2",        // bordas e divisores
        surface: "#FFFFFF",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        card: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(21,32,24,0.04), 0 8px 24px -12px rgba(21,32,24,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
