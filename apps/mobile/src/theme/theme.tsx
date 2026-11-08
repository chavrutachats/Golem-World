/**
 * Tema do app. Desde a Fase 13 o jogo tem uma cara só, a noite de tekhelet, em qualquer
 * modo do aparelho (como a maioria dos jogos): a paleta clara continua em tokens.ts para
 * quem quiser reativá-la, mas nenhuma tela a usa.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { dark, type Palette } from './tokens';

interface Theme {
  scheme: 'light' | 'dark';
  colors: Palette;
}

const THEME: Theme = { scheme: 'dark', colors: dark };
const ThemeContext = createContext<Theme>(THEME);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={THEME}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
