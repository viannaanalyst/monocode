import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  missedSlots,
  nextRunAt,
  scheduleOf,
  type AutomationSchedule,
} from "./automationSchedule";

function schedule(overrides: Partial<AutomationSchedule> = {}): AutomationSchedule {
  return { kind: "daily", intervalHours: 1, weekday: 1, hour: 9, minute: 0, ...overrides };
}

const at = (iso: string) => new Date(iso).getTime();

describe("nextRunAt", () => {
  it("returns today when the time has not passed", () => {
    const from = at("2026-09-14T07:00:00");
    expect(new Date(nextRunAt(schedule(), from)).getHours()).toBe(9);
    expect(new Date(nextRunAt(schedule(), from)).getDate()).toBe(14);
  });

  it("rolls to tomorrow when the time has passed", () => {
    const from = at("2026-09-14T10:00:00");
    expect(new Date(nextRunAt(schedule(), from)).getDate()).toBe(15);
  });

  it("skips the weekend for weekdays", () => {
    const from = at("2026-09-18T10:00:00"); // Friday after 9:00
    const next = new Date(nextRunAt(schedule({ kind: "weekdays" }), from));
    expect(next.getDay()).toBe(1); // Monday
    expect(next.getDate()).toBe(21);
  });

  it("finds the selected weekday for weekly", () => {
    const from = at("2026-09-14T10:00:00"); // Monday after 9:00
    const next = new Date(nextRunAt(schedule({ kind: "weekly", weekday: 1 }), from));
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(21);
  });

  it("steps hourly slots from local midnight", () => {
    const from = at("2026-09-14T06:10:00");
    const next = new Date(nextRunAt(schedule({ kind: "hourly", intervalHours: 2, minute: 30 }), from));
    expect(next.getHours()).toBe(6);
    expect(next.getMinutes()).toBe(30);
    expect(next.getDate()).toBe(14);
  });

  it("returns today's first slot when the time is before the minute offset", () => {
    const from = at("2026-09-14T00:10:00");
    const next = new Date(nextRunAt(schedule({ kind: "hourly", intervalHours: 2, minute: 30 }), from));
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(30);
    expect(next.getDate()).toBe(14);
  });
});

describe("missedSlots", () => {
  it("lists every slot before now", () => {
    const from = at("2026-09-14T09:00:00");
    const now = at("2026-09-16T10:00:00");
    const slots = missedSlots(schedule(), from, now);
    expect(slots.map((slot) => new Date(slot).getDate())).toEqual([14, 15, 16]);
  });

  it("returns nothing when the next slot is ahead", () => {
    expect(missedSlots(schedule(), at("2026-09-14T09:00:00"), at("2026-09-14T08:00:00"))).toEqual([]);
  });
});

describe("describeSchedule", () => {
  it("labels presets and reads the schedule off an automation", () => {
    expect(describeSchedule(schedule())).toContain("09:00");
    expect(describeSchedule(schedule({ kind: "weekdays" }))).toContain("09:00");
    expect(describeSchedule(schedule({ kind: "hourly", intervalHours: 3 }))).toContain("3");
    const automation = { scheduleKind: "daily" as const, intervalHours: 1, weekday: 1, hour: 8, minute: 5 };
    expect(scheduleOf(automation)).toEqual({
      kind: "daily",
      intervalHours: 1,
      weekday: 1,
      hour: 8,
      minute: 5,
    });
  });
});
