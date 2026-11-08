/**
 * Início da semana (segunda-feira, 00:00) num fuso horário IANA, como instante UTC.
 * O ranking semanal zera nesse momento.
 */
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function startOfWeek(now: Date, timeZone: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const localAsUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  const offsetMs = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const daysSinceMonday = WEEKDAY_INDEX[parts.weekday!] ?? 0;
  const localMidnightMonday = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day! - daysSinceMonday);
  return new Date(localMidnightMonday - offsetMs);
}
