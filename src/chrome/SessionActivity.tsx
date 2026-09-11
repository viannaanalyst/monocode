import { Terminal } from "./icons";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Popover } from "./Popover";
import { sessionActivity } from "../lib/sessionActivity";
import {
  loadSessionActivityEnabled,
  SESSION_ACTIVITY_ENABLED_DEFAULT,
  subscribeSessionActivityEnabled,
} from "../lib/settings";
import type { Session } from "../lib/session";
import { t } from "../i18n";

/**
 * A compact "what this agent did" card: the shell commands a session ran, with
 * tests and commits called out. File changes live in the checkpoint review.
 */
export function SessionActivity({ session }: { session: Session }) {
  const root = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const enabled = useSyncExternalStore(
    subscribeSessionActivityEnabled,
    loadSessionActivityEnabled,
    () => SESSION_ACTIVITY_ENABLED_DEFAULT,
  );
  const activity = useMemo(() => sessionActivity(session), [session.blocks]);
  if (!enabled || activity.commands.length === 0) return null;

  const summary = t(
    activity.commands.length === 1 ? "{count} command" : "{count} commands",
    { count: activity.commands.length },
  );

  return (
    <div className="px-4 pt-1 pb-2 font-sans" data-session-activity-shell>
      <div className="overflow-hidden rounded-xl border border-content/12 bg-content/3">
        <button
          ref={root}
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left hover:bg-content/5"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-content/8 text-content/55">
            <Terminal className="size-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-content/80">
            {summary}
          </span>
          <CountBadge
            count={activity.tests.length}
            singular="{count} test"
            plural="{count} tests"
          />
          <CountBadge
            count={activity.commits.length}
            singular="{count} commit"
            plural="{count} commits"
          />
        </button>
        {open ? (
          <Popover
            anchor={root}
            side="top"
            align="start"
            autoFocus
            onDismiss={() => setOpen(false)}
            aria-label={t("Session activity")}
            className="min-w-[18rem] max-w-[30rem] p-2"
          >
            <ul className="space-y-1">
              {activity.commands.map((command, index) => (
                <li
                  key={`${index}-${command}`}
                  className="flex items-start gap-2 px-1 text-[11px]"
                >
                  <span className="min-w-0 flex-1 break-all font-mono text-content/70">
                    {command}
                  </span>
                  {activity.tests.includes(command) ? (
                    <Tag label={t("test")} />
                  ) : activity.commits.includes(command) ? (
                    <Tag label={t("commit")} />
                  ) : null}
                </li>
              ))}
            </ul>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}

function CountBadge({
  count,
  singular,
  plural,
}: {
  count: number;
  singular: string;
  plural: string;
}) {
  if (count <= 0) return null;
  return (
    <span className="shrink-0 rounded-md bg-content/8 px-1.5 py-0.5 text-[10px] font-medium text-content/55">
      {t(count === 1 ? singular : plural, { count })}
    </span>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="mt-0.5 shrink-0 rounded bg-content/10 px-1 py-px text-[9px] uppercase tracking-wide text-content/45">
      {label}
    </span>
  );
}
