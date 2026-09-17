import { afterEach, describe, expect, it } from "vitest";
import { resetLocaleForTests, saveLocale } from "../i18n";
import { notificationMuteActions } from "./notificationMuteActions";

afterEach(() => resetLocaleForTests());

describe("notification mute actions", () => {
  it("keeps the preset ids and durations", () => {
    saveLocale("en");
    const actions = notificationMuteActions(new Date("2026-09-16T12:00:00"));
    expect(actions.map((action) => action.id)).toEqual([
      "mute:1",
      "mute:4",
      "mute:8",
      "mute:indefinite",
      "mute:custom",
    ]);
  });

  it("localizes preset labels to pt-BR", () => {
    saveLocale("pt-BR");
    const labels = notificationMuteActions(
      new Date("2026-09-16T12:00:00"),
    ).map((action) => action.label);
    expect(labels[0]).toMatch(/^1 hora \(/);
    expect(labels[1]).toMatch(/^4 horas \(/);
    expect(labels[2]).toMatch(/^8 horas \(/);
    expect(labels[3]).toBe("Até retomar");
    expect(labels[4]).toBe("Escolher data e hora");
  });
});
