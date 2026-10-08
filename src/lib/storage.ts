import { DEFAULT_SETTINGS } from '../calc/routes.ts';
import type { GolaRates, Settings } from './types.ts';
import { validateGola } from '../sources/golavisa.ts';

const GOLA_KEY = 'currency-exchange:gola:v1';
const SETTINGS_KEY = 'currency-exchange:settings:v1';

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // private mode, blocked storage or corrupt JSON: behave as "nothing saved"
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the value just won't persist */
  }
}

export function loadGola(): GolaRates | undefined {
  const v = read(GOLA_KEY) as Partial<GolaRates> | null;
  if (!v || typeof v !== 'object') return undefined;
  try {
    return validateGola({
      twdToVnd: Number(v.twdToVnd),
      vndToTwd: Number(v.vndToTwd),
      usdToVnd: Number(v.usdToVnd),
      vndToUsd: Number(v.vndToUsd),
      updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : null,
      enteredAt: Number(v.enteredAt) || 0,
    });
  } catch {
    return undefined; // saved values failed validation: ignore them rather than show wrong numbers
  }
}

export const saveGola = (g: GolaRates): void => write(GOLA_KEY, g);
export const clearGola = (): void => {
  try {
    localStorage.removeItem(GOLA_KEY);
  } catch {
    /* ignore */
  }
};

export function loadSettings(): Settings {
  const v = read(SETTINGS_KEY) as Partial<Settings> | null;
  const fee = Number(v?.bitoproFee);
  return {
    bitoproMode: v?.bitoproMode === 'otc' ? 'otc' : DEFAULT_SETTINGS.bitoproMode,
    bitoproFee: Number.isFinite(fee) && fee >= 0 && fee <= 0.05 ? fee : DEFAULT_SETTINGS.bitoproFee,
  };
}

export const saveSettings = (s: Settings): void => write(SETTINGS_KEY, s);
