import { modelsFor } from "../../sessions/model/models";
import {
  isHarnessAvailable,
  probeHarnessAvailability,
} from "../../../integrations/harness/core/availability";
import { orderedHarnesses } from "../../sessions/model/providerOrder";
import { refreshHarnessCatalogs } from "../../../integrations/harness/core/registry";
import { validateOrchestrationSettings } from "./orchestrationPlan";

/** Discover worker choices only when the user sends an orchestration request. */
export async function discoverOrchestrationSettings() {
  await probeHarnessAvailability();
  const installed = orderedHarnesses(isHarnessAvailable);
  await refreshHarnessCatalogs(installed);
  return validateOrchestrationSettings({
    maxWorkers: 2,
    choices: installed
      .filter(isHarnessAvailable)
      .flatMap((harness) =>
        modelsFor(harness).map(({ id, name }) => ({
          harness,
          model: id,
          name,
        })),
      ),
  });
}
