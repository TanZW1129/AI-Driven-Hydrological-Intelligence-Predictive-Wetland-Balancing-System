/**
 * @file timeFormat.ts
 * @description Wall-clock and relative time formatting helpers shared by the
 * timeline scrubber, hydrograph axis and 3D HUD. All wall-clock output is
 * rendered in the Klang operations centre timezone (UTC+8).
 */

import { DISPLAY_TIMEZONE } from '../constants/weatherConstants';

const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const clockWithSecondsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
});

const fullDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "HH:mm" in UTC+8. */
export function formatClock(ms: number): string {
  return clockFormatter.format(ms);
}

/** "HH:mm:ss" in UTC+8. */
export function formatClockWithSeconds(ms: number): string {
  return clockWithSecondsFormatter.format(ms);
}

/** "DD/MM" in UTC+8. */
export function formatShortDate(ms: number): string {
  return dateFormatter.format(ms);
}

/** "YYYY-MM-DD" in UTC+8. */
export function formatFullDate(ms: number): string {
  return fullDateFormatter.format(ms);
}

/** Calendar-day key in UTC+8, used to detect midnight crossings. */
export function dayKey(ms: number): string {
  return fullDateFormatter.format(ms);
}

/** Relative simulation clock "T+HH:mm" from elapsed seconds. */
export function formatRelativeClock(elapsedSec: number): string {
  const totalMinutes = Math.max(0, Math.floor(elapsedSec / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `T+${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Signed offset from NOW, e.g. "+2h 30m", "−45m", "NOW". */
export function formatOffsetFromNow(offsetSec: number): string {
  const roundedMinutes = Math.round(offsetSec / 60);
  if (Math.abs(roundedMinutes) < 3) return 'NOW';
  const sign = roundedMinutes > 0 ? '+' : '−';
  const abs = Math.abs(roundedMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  if (hours === 0) return `${sign}${minutes}m`;
  if (minutes === 0) return `${sign}${hours}h`;
  return `${sign}${hours}h ${minutes}m`;
}
