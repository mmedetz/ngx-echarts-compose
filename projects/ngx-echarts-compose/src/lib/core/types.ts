export type FeatureSlot = 'grid' | 'xAxis' | 'yAxis' | 'series';

export const ARRAY_SLOTS: readonly FeatureSlot[] = ['grid', 'xAxis', 'yAxis', 'series'];

/** The public surface `assembleOption` needs — satisfied structurally by `ChartFeature`. */
export interface ChartFeatureLike {
  readonly slot: FeatureSlot;
  options(): Record<string, unknown>;
  fragment(): Record<string, unknown>;
  refs(): Record<string, ChartFeatureLike | string | (ChartFeatureLike | string)[] | null>;
}
