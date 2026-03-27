type DayName = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const DAY_MAP: Record<DayName, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * Parse an "HH:MM" string into hours and minutes.
 */
function parseTime(time: string): { hours: number; minutes: number } {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid time format: "${time}" — expected HH:MM`);
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23) throw new Error(`Invalid hour: ${hours}`);
  if (minutes < 0 || minutes > 59) throw new Error(`Invalid minute: ${minutes}`);
  return { hours, minutes };
}

/**
 * Convert a timezone-aware time to a UTC cron expression.
 *
 * This is a simplified conversion that handles fixed UTC offsets and common
 * IANA timezone names. For full timezone support, consider using a library.
 */
function toUtcTime(
  hours: number,
  minutes: number,
  timezone: string,
): { hours: number; minutes: number; dayShift: number } {
  if (timezone === 'UTC') return { hours, minutes, dayShift: 0 };

  // Try to get offset from Intl
  try {
    const now = new Date();
    const utcDate = new Date(
      now.toLocaleString('en-US', { timeZone: 'UTC' }),
    );
    const tzDate = new Date(
      now.toLocaleString('en-US', { timeZone: timezone }),
    );
    const offsetMinutes = (tzDate.getTime() - utcDate.getTime()) / 60_000;

    let totalMinutes = hours * 60 + minutes - offsetMinutes;
    let dayShift = 0;

    if (totalMinutes < 0) {
      totalMinutes += 24 * 60;
      dayShift = -1;
    } else if (totalMinutes >= 24 * 60) {
      totalMinutes -= 24 * 60;
      dayShift = 1;
    }

    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
      dayShift,
    };
  } catch {
    // If timezone is not recognized, assume UTC
    return { hours, minutes, dayShift: 0 };
  }
}

/**
 * Build a cron expression from a local time, days, and timezone.
 *
 * Returns a UTC cron expression string (5-field).
 */
export function cronFromTime(
  time: string,
  days: DayName[],
  timezone: string = 'UTC',
): string {
  const { hours, minutes } = parseTime(time);
  const utc = toUtcTime(hours, minutes, timezone);

  let cronDays: number[];
  if (days.length === 7) {
    cronDays = []; // will use '*'
  } else {
    cronDays = days
      .map((d) => {
        let num = DAY_MAP[d];
        if (utc.dayShift !== 0) {
          num = (num + utc.dayShift + 7) % 7;
        }
        return num;
      })
      .sort((a, b) => a - b);
  }

  const daysPart = cronDays.length === 0 ? '*' : cronDays.join(',');

  return `${utc.minutes} ${utc.hours} * * ${daysPart}`;
}

/**
 * Add hours to a time string, returning a new "HH:MM" string.
 * Wraps around midnight if needed.
 */
export function addHours(time: string, hoursToAdd: number): string {
  const { hours, minutes } = parseTime(time);
  const totalMinutes = hours * 60 + minutes + Math.round(hoursToAdd * 60);
  const wrappedMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrappedMinutes / 60);
  const m = wrappedMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
