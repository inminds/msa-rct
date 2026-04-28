/**
 * Parses a timestamp string produced by SQLite CURRENT_TIMESTAMP.
 *
 * SQLite stores UTC time as "YYYY-MM-DD HH:MM:SS" — no timezone marker.
 * JavaScript's Date constructor treats that format as LOCAL time, which
 * causes timestamps to display 3 hours ahead for users in UTC-3 (Brazil).
 *
 * This function forces UTC interpretation so the browser correctly
 * converts to the user's local timezone.
 */
export function parseUTCDate(ts: string | null | undefined): Date {
  if (!ts) return new Date(NaN);
  // Already has TZ info (contains Z, or +HH:MM / -HH:MM) → trust it
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(ts.trim())) return new Date(ts);
  // Normalize "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SSZ"
  const normalized = ts.trim().replace(" ", "T") + "Z";
  return new Date(normalized);
}
