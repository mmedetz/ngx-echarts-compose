import { ARRAY_SLOTS, type ChartFeatureLike, type FeatureSlot } from './types';

/**
 * Stable wire id for every feature under assembly, resolved by the caller (`EcChartDirective`)
 * before assembly runs — assembly only ever looks ids up, it never decides them. Every feature
 * reachable from `features` or a ref must have an entry; that's an invariant of the caller, not
 * something assembly re-validates.
 */
export type FeatureIds = ReadonlyMap<ChartFeatureLike, string>;

/**
 * `managedSlots` are slots that have ever held a feature (see `EcChartDirective.managedSlots`).
 * A slot outside that set is left out of the result entirely — rather than emitted as `[]` —
 * so ECharts falls back to its own defaults (e.g. an auto-created grid) when nothing in the
 * template ever touches that slot.
 */
export function assembleOption(
  features: readonly ChartFeatureLike[],
  baseOptions: Record<string, unknown>,
  ids: FeatureIds,
  managedSlots: readonly FeatureSlot[],
): Record<string, unknown> {
  const declarative: Record<string, unknown[]> = {};

  for (const slot of ARRAY_SLOTS) {
    const fromBase = (baseOptions[slot] as unknown[] | undefined) ?? [];
    const fromTemplate = features
      .filter((feature) => feature.slot === slot)
      .map((feature) => ({
        id: ids.get(feature),
        ...feature.options(),
        ...feature.fragment(),
        ...resolveRefs(feature, ids),
      }));

    if (fromBase.length === 0 && fromTemplate.length === 0 && !managedSlots.includes(slot)) {
      continue;
    }

    declarative[slot] = [...fromBase, ...fromTemplate];
  }

  return { ...baseOptions, ...declarative };
}

function resolveRefs(feature: ChartFeatureLike, ids: FeatureIds): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [refKey, target] of Object.entries(feature.refs())) {
    if (target === undefined) continue;

    result[`${refKey}Id`] = typeof target === 'string' ? target : ids.get(target);
  }

  return result;
}
