import type { ExplorerMenuItem } from "./ExplorerMenu";
import { reminderTime } from "../lib/sessionReminders";
import { t } from "../i18n";

export function sessionReminderPresets(now = new Date()) {
  const timeInHours = (hours: 1 | 3) => {
    const date = new Date(reminderTime(`reminder:${hours}h`, now)!);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  return [
    {
      kind: "item",
      id: "reminder:1h",
      label: t("In 1 hour ({time})", { time: timeInHours(1) }),
    },
    {
      kind: "item",
      id: "reminder:3h",
      label: t("In 3 hours ({time})", { time: timeInHours(3) }),
    },
    {
      kind: "item",
      id: "reminder:evening",
      label: t("This evening (18:00)"),
      disabled: reminderTime("reminder:evening", now) == null,
    },
    { kind: "item", id: "reminder:tomorrow", label: t("Tomorrow (9:00)") },
    {
      kind: "item",
      id: "reminder:next-week",
      label: t("Next week (Mon 9:00)"),
    },
  ] satisfies ExplorerMenuItem[];
}
