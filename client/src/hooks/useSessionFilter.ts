import { useState } from "react";

/**
 * Igual ao useState, mas persiste o valor no sessionStorage durante a sessão.
 * Ao fechar/reabrir a aba o valor é limpo automaticamente.
 *
 * @param key   Chave única no sessionStorage (ex: "ncm-search", "rpa-status")
 * @param defaultValue  Valor inicial se não houver nada salvo
 */
export function useSessionFilter<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setAndStore = (newValue: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved =
        typeof newValue === "function"
          ? (newValue as (prev: T) => T)(prev)
          : newValue;
      try {
        sessionStorage.setItem(key, JSON.stringify(resolved));
      } catch { /* quota exceeded — fail silently */ }
      return resolved;
    });
  };

  return [value, setAndStore] as const;
}
