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
  dispatch: (automation: Automation) => Promise<RunOutcome | "skipped" | "timed_out">;
}) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<Record<string, AutomationRun[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const latestAutomation = useCallback(async (automation: Automation) => {
    try {
      const items = await listAutomations();
      return items.find((item) => item.id === automation.id) ?? automation;
    } catch {
      return (
        automationsRef.current.find((item) => item.id === automation.id) ??
        automation
      );
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
      setBusyId(automation.id);
      let claimed = false;
      const slot = plan.due;
      try {
        const next = nextRunAt(scheduleOf(automation), slot);
        claimed = await takeDueAutomation(automation.id, slot, next, now);
        if (!claimed) continue;
        await refresh();
        const latest =
          automationsRef.current.find((item) => item.id === automation.id) ??
          automation;
        const outcome = await callbacksRef.current.dispatch({
          ...latest,
          nextRunAt: next,
        });
        const settled = await latestAutomation(automation);
        const timedOut = outcome === "timed_out";
        const status =
          outcome === "skipped" ? "skipped_busy" : timedOut ? "failed" : outcome;
        const applied =
          outcome === "skipped" || timedOut
            ? {
                consecutiveFailures: settled.consecutiveFailures,
                enabled: settled.enabled,
                pausedReason: settled.pausedReason,
              }
            : applyRunOutcome(settled, outcome);
        await recordAutomationResult({
          automationId: automation.id,
          runId: `${automation.id}:${slot}`,
          status,
          error: timedOut ? "The run did not settle within 30 minutes." : null,
          ...applied,
        });
        await refresh();
      } catch (err) {
        setError(String(err));
        if (claimed) {
          const settled = await latestAutomation(automation);
          const applied = applyRunOutcome(settled, "failed");
          await recordAutomationResult({
            automationId: automation.id,
            runId: `${automation.id}:${slot}`,
            status: "failed",
            error: String(err),
            ...applied,
          }).catch(() => undefined);
          await refresh().catch(() => undefined);
        }
      } finally {
        activeRuns.current.delete(automation.id);
        setBusyId((current) => (current === automation.id ? null : current));
      }
    }
  }, [refresh, latestAutomation]);

  const runNow = useCallback(
    async (automation: Automation) => {
      if (!automation.enabled) {
        setError("Resume the automation before running it.");
        return;
      }
      if (activeRuns.current.has(automation.id)) return;
      const now = Date.now();
      const slot = automation.nextRunAt;
      const next = nextSchedule(scheduleOf(automation), slot);
      let claimed = false;
      try {
        claimed = await takeDueAutomation(automation.id, slot, next, now);
      } catch (err) {
        setError(String(err));
        throw err;
      }
      if (!claimed) {
        await refresh();
        return;
      }
      activeRuns.current.add(automation.id);
      setBusyId(automation.id);
      try {
        await refresh();
        const latest =
          automationsRef.current.find((item) => item.id === automation.id) ??
          automation;
        const outcome = await callbacksRef.current.dispatch({ ...latest, nextRunAt: next });
        const settled = await latestAutomation(automation);
        const timedOut = outcome === "timed_out";
        const status =
          outcome === "skipped" ? "skipped_busy" : timedOut ? "failed" : outcome;
        const applied =
          outcome === "skipped" || timedOut
            ? {
                consecutiveFailures: settled.consecutiveFailures,
                enabled: settled.enabled,
                pausedReason: settled.pausedReason,
              }
            : applyRunOutcome(settled, outcome);
        await recordAutomationResult({
          automationId: automation.id,
          runId: `${automation.id}:${slot}`,
          status,
          error: timedOut ? "The run did not settle within 30 minutes." : null,
          ...applied,
        });
        await refresh();
      } catch (err) {
        setError(String(err));
        const settled = await latestAutomation(automation);
        const applied = applyRunOutcome(settled, "failed");
        await recordAutomationResult({
          automationId: automation.id,
          runId: `${automation.id}:${slot}`,
          status: "failed",
          error: String(err),
          ...applied,
        }).catch(() => undefined);
        await refresh().catch(() => undefined);
        throw err;
      } finally {
        activeRuns.current.delete(automation.id);
        setBusyId((current) => (current === automation.id ? null : current));
      }
    },
    [refresh, latestAutomation],
  );

  const toggle = useCallback(
    async (automation: Automation) => {
      try {
        await setAutomationEnabled(automation.id, !automation.enabled);
        await refresh();
      } catch (err) {
        setError(String(err));
        throw err;
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (automation: Automation) => {
      try {
        await deleteAutomation(automation.id);
        await refresh();
      } catch (err) {
        setError(String(err));
        throw err;
      }
    },
    [refresh],
  );

  useEffect(() => {
    let disposed = false;
    void refresh();
    const interval = window.setInterval(() => {
      void tick();
    }, TICK_MS);
    const subscriptions: Array<() => void> = [];
    void listen(AUTOMATIONS_CHANGED, () => {
      void refresh();
      void tick();
    }).then((unlisten) => {
      if (disposed) unlisten();
      else subscriptions.push(unlisten);
    });
    const onFocus = () => {
      if (document.hidden) return;
      void refresh().then(() => tick());
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      disposed = true;
      revision.current += 1;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      for (const unsubscribe of subscriptions) unsubscribe();
    };
  }, [refresh, tick]);

  return { automations, runs, error, busyId, refresh, runNow, toggle, remove, loadRuns };
}
