/**
 * Parses a timestamp string produced by SQLite CURRENT_TIMESTAMP.
 *
 * SQLite stores UTC time as "YYYY-MM-DD HH:MM:SS" — no timezone marker.
 * JavaScript's Date constructor treats that format as LOCAL time, which
 * causes timestamps to display 3 hours ahead for users in UTC-3 (Brazil).
 *
 * This function forces UTC interpretation so the browser correctly
 * converts to the user's local timezone.
 *
 * Returns null for null/undefined/empty inputs so callers can safely
 * guard with `parseUTCDate(x) ?? "—"` without risking "Invalid time value".
 */
import { format as fnsFormat, formatDistanceToNow as fnsDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Formata uma data UTC do servidor. Retorna "—" se a data for inválida/ausente. */
export function formatUTC(ts: string | null | undefined, pattern: string): string {
  const d = parseUTCDate(ts);
  if (!d) return "—";
  return fnsFormat(d, pattern, { locale: ptBR });
}

/** Retorna "há X horas" para uma data UTC do servidor. Retorna "—" se inválida/ausente. */
export function distanceUTC(ts: string | null | undefined): string {
  const d = parseUTCDate(ts);
  if (!d) return "—";
  return fnsDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

export function parseUTCDate(ts: string | null | undefined): Date | null {
  if (!ts || !ts.trim()) return null;
  // Already has TZ info (contains Z, or +HH:MM / -HH:MM) → trust it
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(ts.trim())) return new Date(ts);
  // Normalize "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SSZ"
  const normalized = ts.trim().replace(" ", "T") + "Z";
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}
