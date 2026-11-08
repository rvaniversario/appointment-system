import { addDays, dayParts, formatDateLabel, formatTimeLabel, manilaInstant, timeToMinutes, weekdayOf } from "./time";

/** Weekly hours, in Manila local time. weekday 0 = Sunday. */
export interface WeeklyRule {
  weekday: number;
  startTime: string;
  endTime: string;
}

/** Any time the attorney can't be booked: leave, holidays, and existing appointments. */
export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
}

export interface Slot {
  startsAt: string;
  label: string;
}

export interface DaySlots {
  date: string;
  dow: string;
  day: number;
  label: string;
  slots: Slot[];
}

export interface SlotOptions {
  rules: WeeklyRule[];
  busy: BusyInterval[];
  durationMinutes: number;
  /** First Manila date to show. */
  fromDate: string;
  days: number;
  now: Date;
  /** Earliest bookable start, measured from now. */
  leadMinutes: number;
  /** Start times fall on this grid within each rule. */
  stepMinutes: number;
}

/**
 * Open start times per day: inside the weekly hours, long enough for the consultation,
 * clear of every busy interval, and at least leadMinutes from now.
 */
export function generateSlots(options: SlotOptions): DaySlots[] {
  const { rules, busy, durationMinutes, fromDate, days, now, leadMinutes, stepMinutes } = options;
  const earliest = now.getTime() + leadMinutes * 60_000;
  const durationMs = durationMinutes * 60_000;
  const result: DaySlots[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, i);
    const weekday = weekdayOf(date);
    const starts = new Set<number>();

    for (const rule of rules.filter((r) => r.weekday === weekday)) {
      const ruleEnd = manilaInstant(date, timeToMinutes(rule.endTime)).getTime();
      for (let m = timeToMinutes(rule.startTime); ; m += stepMinutes) {
        const start = manilaInstant(date, m).getTime();
        const end = start + durationMs;
        if (end > ruleEnd) break;
        if (start < earliest) continue;
        const clashes = busy.some((b) => start < b.endsAt.getTime() && end > b.startsAt.getTime());
        if (!clashes) starts.add(start);
      }
    }

    result.push({
      date,
      ...dayParts(date),
      label: formatDateLabel(date),
      slots: [...starts]
        .sort((a, b) => a - b)
        .map((ms) => ({ startsAt: new Date(ms).toISOString(), label: formatTimeLabel(new Date(ms)) })),
    });
  }

  return result;
}
