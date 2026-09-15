export type ScheduleKind = "hourly" | "daily" | "weekdays" | "weekly";

export type AutomationSchedule = {
  kind: ScheduleKind;
  intervalHours: number;
  weekday: number;
  hour: number;
  minute: number;
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function scheduleOf(automation: {
  scheduleKind: ScheduleKind;
  intervalHours: number;
  weekday: number;
  hour: number;
  minute: number;
}): AutomationSchedule {
  return {
    kind: automation.scheduleKind,
    intervalHours: automation.intervalHours,
    weekday: automation.weekday,
    hour: automation.hour,
    minute: automation.minute,
  };
}

function startOfDay(from: number): Date {
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Local wall-clock slot on the given day offset, optionally pushed to a weekday. */
function slotOn(from: number, dayOffset: number, schedule: AutomationSchedule): number {
  const day = startOfDay(from);
  day.setDate(day.getDate() + dayOffset);
  day.setHours(schedule.hour, schedule.minute, 0, 0);
  return day.getTime();
}

export function nextRunAt(schedule: AutomationSchedule, from: number): number {
  if (schedule.kind === "hourly") {
    const interval = Math.min(24, Math.max(1, Math.round(schedule.intervalHours)));
    const base = startOfDay(from).getTime() + schedule.minute * 60_000;
    const step = interval * 3_600_000;
    const index = from < base ? 0 : Math.floor((from - base) / step) + 1;
    return base + index * step;
  }
  if (schedule.kind === "daily") {
    const today = slotOn(from, 0, schedule);
    return today > from ? today : slotOn(from, 1, schedule);
  }
  if (schedule.kind === "weekdays") {
    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = slotOn(from, offset, schedule);
      const weekday = new Date(candidate).getDay();
      if (candidate > from && weekday !== 0 && weekday !== 6) return candidate;
    }
    return slotOn(from, 8, schedule);
  }
  const weekly = slotOn(from, 0, schedule);
  const target = ((schedule.weekday % 7) + 7) % 7;
  const shifted = new Date(weekly);
  shifted.setDate(shifted.getDate() + ((target - shifted.getDay() + 7) % 7));
  const candidate = shifted.getTime();
  if (candidate > from) return candidate;
  shifted.setDate(shifted.getDate() + 7);
  return shifted.getTime();
}

export function missedSlots(
  schedule: AutomationSchedule,
  from: number,
  now: number,
): number[] {
  const slots: number[] = [];
  let cursor = from;
  for (let guard = 0; guard < 50; guard += 1) {
    if (cursor >= now) break;
    slots.push(cursor);
    cursor = nextRunAt(schedule, cursor);
  }
  return slots;
}

export function formatScheduleTime(schedule: AutomationSchedule): string {
  const hour = String(Math.min(23, Math.max(0, schedule.hour))).padStart(2, "0");
  const minute = String(Math.min(59, Math.max(0, schedule.minute))).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function describeSchedule(schedule: AutomationSchedule): string {
  const time = formatScheduleTime(schedule);
  if (schedule.kind === "hourly") {
    const interval = Math.min(24, Math.max(1, Math.round(schedule.intervalHours)));
    return `Every ${interval}h at :${String(schedule.minute).padStart(2, "0")}`;
  }
  if (schedule.kind === "daily") return `Daily at ${time}`;
  if (schedule.kind === "weekdays") return `Weekdays at ${time}`;
  const weekday = WEEKDAYS[((schedule.weekday % 7) + 7) % 7];
  return `Weekly on ${weekday} at ${time}`;
}
