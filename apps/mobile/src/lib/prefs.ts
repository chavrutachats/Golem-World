/**
 * Preferências do jogador neste aparelho (hoje: sons ligados ou não).
 * Ficam no AsyncStorage (localStorage na web); se não der para ler, vale o padrão.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'trivia.prefs.v1';

interface Prefs {
  sound: boolean;
}

const DEFAULTS: Prefs = { sound: true };

export const usePrefs = create<Prefs>(() => DEFAULTS);

export async function loadPrefs(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    usePrefs.setState({ sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULTS.sound });
  } catch {
    // Armazenamento indisponível: segue com o padrão.
  }
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  usePrefs.setState({ [key]: value } as Pick<Prefs, K>);
  void AsyncStorage.setItem(KEY, JSON.stringify(usePrefs.getState())).catch(() => undefined);
}
