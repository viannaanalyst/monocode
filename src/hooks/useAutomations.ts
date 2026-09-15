import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  applyRunOutcome,
  automationTickPlan,
  nextSchedule,
  type RunOutcome,
} from "../lib/automations";
import { nextRunAt, scheduleOf } from "../lib/automationSchedule";
import {
  AUTOMATIONS_CHANGED,
  deleteAutomation,
  listAutomationRuns,
  listAutomations,
  recordAutomationResult,
  recordMissedAutomation,
  setAutomationEnabled,
  takeDueAutomation,
  type Automation,
  type AutomationRun,
} from "../lib/automationStore";

const TICK_MS = 30_000;

export function useAutomations(callbacks: {
  dispatch: (automation: Automation) => Promise<RunOutcome | "skipped">;
}) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<Record<string, AutomationRun[]>>({});
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const automationsRef = useRef(automations);
  automationsRef.current = automations;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const activeRuns = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const items = await listAutomations();
      if (request !== revision.current) return;
      setAutomations(items);
      setError(null);
    } catch (err) {
      if (request === revision.current) setError(String(err));
    }
  }, []);

  const loadRuns = useCallback(async (id: string) => {
    try {
      const history = await listAutomationRuns(id);
      setRuns((current) => ({ ...current, [id]: history }));
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const tick = useCallback(async () => {
    const now = Date.now();
    for (const automation of automationsRef.current) {
      if (!automation.enabled || activeRuns.current.has(automation.id)) continue;
      const plan = automationTickPlan(automation, now);
      for (const slot of plan.missed) {
        const next = nextRunAt(scheduleOf(automation), slot);
        await recordMissedAutomation(automation.id, slot, next).catch(() => false);
      }
      if (plan.missed.length > 0) await refresh();
      if (plan.due == null) continue;
      activeRuns.current.add(automation.id);
      try {
        const next = nextRunAt(scheduleOf(automation), plan.due);
        const claimed = await takeDueAutomation(automation.id, plan.due, next, now);
        if (!claimed) continue;
        await refresh();
        const outcome = await callbacksRef.current.dispatch({
          ...automation,
          nextRunAt: next,
        });
        const applied =
          outcome === "skipped"
            ? {
                consecutiveFailures: automation.consecutiveFailures,
                enabled: automation.enabled,
                pausedReason: automation.pausedReason,
              }
            : applyRunOutcome(automation, outcome);
        await recordAutomationResult({
          automationId: automation.id,
          runId: `${automation.id}:${plan.due}`,
          status: outcome === "skipped" ? "skipped_busy" : outcome,
          error: null,
          ...applied,
        });
        await refresh();
      } catch (err) {
        setError(String(err));
      } finally {
        activeRuns.current.delete(automation.id);
      }
    }
  }, [refresh]);

  const runNow = useCallback(
    async (automation: Automation) => {
      if (activeRuns.current.has(automation.id)) return;
      const now = Date.now();
      const slot = automation.nextRunAt;
      const next = nextSchedule(scheduleOf(automation), slot);
      const claimed = await takeDueAutomation(automation.id, slot, next, now);
      if (!claimed) {
        await refresh();
        return;
      }
      activeRuns.current.add(automation.id);
      try {
        await refresh();
        const outcome = await callbacksRef.current.dispatch({ ...automation, nextRunAt: next });
        const applied =
          outcome === "skipped"
            ? {
                consecutiveFailures: automation.consecutiveFailures,
                enabled: automation.enabled,
                pausedReason: automation.pausedReason,
              }
            : applyRunOutcome(automation, outcome);
        await recordAutomationResult({
          automationId: automation.id,
          runId: `${automation.id}:${slot}`,
          status: outcome === "skipped" ? "skipped_busy" : outcome,
          error: null,
          ...applied,
        });
        await refresh();
      } finally {
        activeRuns.current.delete(automation.id);
      }
    },
    [refresh],
  );

  const toggle = useCallback(
    async (automation: Automation) => {
      await setAutomationEnabled(automation.id, !automation.enabled);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (automation: Automation) => {
      await deleteAutomation(automation.id);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void tick();
    }, TICK_MS);
    const subscriptions: Array<() => void> = [];
    void listen(AUTOMATIONS_CHANGED, () => {
      void refresh();
      void tick();
    }).then((unlisten) => subscriptions.push(unlisten));
    const onFocus = () => {
      void refresh().then(() => tick());
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      for (const unsubscribe of subscriptions) unsubscribe();
    };
  }, [refresh, tick]);

  return { automations, runs, error, refresh, runNow, toggle, remove, loadRuns };
}
