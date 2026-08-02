import { ARRAY_SLOTS, type FeatureSlot, type IdFeatureLike } from './types';

/**
 * `managedSlots` are slots that have ever held a feature (see `EcChartDirective.managedSlots`).
 * A slot outside that set is left out of the result entirely — rather than emitted as `[]` —
 * so ECharts falls back to its own defaults (e.g. an auto-created grid) when nothing in the
 * template ever touches that slot.
 */
export function assembleOption(
  features: readonly IdFeatureLike[],
  baseOptions: Record<string, unknown>,
  managedSlots: readonly FeatureSlot[],
): Record<string, unknown> {
  const declarative: Record<string, unknown[]> = {};

  for (const slot of ARRAY_SLOTS) {
    const fromBase = (baseOptions[slot] as unknown[] | undefined) ?? [];
    const fromTemplate = features
      .filter((feature) => feature.slot === slot)
      .map((feature) => ({
        id: feature.resolvedId(),
        ...feature.options(),
        ...feature.fragment(),
        ...resolveRefs(feature),
      }));

    if (fromBase.length === 0 && fromTemplate.length === 0 && !managedSlots.includes(slot)) {
      continue;
    }

    declarative[slot] = [...fromBase, ...fromTemplate];
  }

  return { ...baseOptions, ...declarative };
}

function resolveRefs(feature: IdFeatureLike): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [refKey, target] of Object.entries(feature.refs())) {
    if (target === undefined) continue;

    result[`${refKey}Id`] = typeof target === 'string' ? target : target.resolvedId();
  }

  return result;
}
