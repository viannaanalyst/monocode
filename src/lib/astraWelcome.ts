import type { AgentModel } from "./models";
import { modelBrandEnergy, type ModelEnergy } from "./modelBrand";

export function isAstraModel(model: AgentModel): boolean {
  return [model.id, model.nativeId, model.name].some(
    (value) => value != null && /(^|[^a-z0-9])astra([^a-z0-9]|$)/i.test(value),
  );
}

/** Brand ramp used to recolor the Astra solar welcome for any picked model. */
export function modelWelcomeEnergy(model: AgentModel): ModelEnergy {
  return modelBrandEnergy(
    [model.id, model.nativeId, model.name].filter(Boolean).join(" "),
  );
}
