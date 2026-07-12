export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function assertFiniteInRange(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be a finite number between ${minimum} and ${maximum}`);
  }
}

export function toDate(value: Date | string, label: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError(`${label} must be a valid date`);
  return date;
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function differenceInDays(later: Date, earlier: Date): number {
  return Math.max(0, (later.getTime() - earlier.getTime()) / 86_400_000);
}

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
