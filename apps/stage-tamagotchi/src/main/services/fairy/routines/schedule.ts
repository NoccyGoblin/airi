import { addDays, differenceInMinutes, format, getDay, isSameDay, set } from 'date-fns'

/**
 * FAIRY: when a routine of the character is due.
 *
 * A routine runs once on each of its days, at its time. When the PC was off or asleep at that time, it still runs once
 * when the app is back within {@link CATCH_UP_MINUTES}.
 */

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type Weekday = typeof WEEKDAYS[number]

/** How late a missed routine may still run. */
export const CATCH_UP_MINUTES = 180

export interface RoutineSchedule {
  /** Local time, for example "09:00". */
  time: string
  /** The days it runs on. Empty means every day. */
  days: Weekday[]
}

/**
 * Reads "9:00", "09:00", or "21:30" into hours and minutes.
 *
 * @example
 * parseTime('9:05') // { hours: 9, minutes: 5 }
 */
export function parseTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  const hours = Number(match?.[1])
  const minutes = Number(match?.[2])
  if (!match || hours > 23 || minutes > 59)
    throw new Error(`"${time}" is not a time like 09:00 or 21:30.`)
  return { hours, minutes }
}

/** The moment the routine is due on the day of `now`, or nothing when it does not run that day. */
export function dueMomentOn(schedule: RoutineSchedule, now: Date): Date | undefined {
  if (schedule.days.length && !schedule.days.includes(WEEKDAYS[getDay(now)]))
    return undefined
  const { hours, minutes } = parseTime(schedule.time)
  return set(now, { hours, minutes, seconds: 0, milliseconds: 0 })
}

/**
 * Whether a routine must run now.
 *
 * @example
 * isDue({ time: '09:00', days: [] }, new Date('2026-11-26T09:01'), undefined) // true
 */
export function isDue(schedule: RoutineSchedule, now: Date, lastRunAt: Date | undefined): boolean {
  const due = dueMomentOn(schedule, now)
  if (!due || now < due)
    return false
  if (differenceInMinutes(now, due) > CATCH_UP_MINUTES)
    return false
  return !lastRunAt || !isSameDay(lastRunAt, now) || lastRunAt < due
}

/**
 * The next moment the routine runs after `now`, for the owner to read. Looks a week ahead.
 *
 * @example
 * nextRun({ time: '09:00', days: [] }, new Date('2026-11-26T10:00')) // '2026-11-27 09:00'
 */
export function nextRun(schedule: RoutineSchedule, now: Date): string | undefined {
  for (let day = 0; day <= 7; day++) {
    const due = dueMomentOn(schedule, addDays(now, day))
    if (due && due > now)
      return format(due, 'yyyy-MM-dd HH:mm')
  }
  return undefined
}
