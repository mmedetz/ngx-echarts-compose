export type FeatureSlot = 'grid' | 'xAxis' | 'yAxis' | 'series';

export const ARRAY_SLOTS: readonly FeatureSlot[] = ['grid', 'xAxis', 'yAxis', 'series'];

/**
 * Upper bound for `ChartFeature<TOption>`'s type parameter, and the erased shape used wherever a
 * feature is handled generically, independent of its concrete `TOption` (the host,
 * `assembleOption`, `ChartFeatureRef`). Not `Record<string, unknown>`: that requires a string
 * index signature, which ECharts' own option interfaces (`XAXisComponentOption`,
 * `LineSeriesOption`, ...) don't declare, so none of them would widen to it — every concrete
 * feature (`AxisFeature<XAXisComponentOption>`, etc.) would fail to compile at its declaration.
 */
export type AnyChartOption = object;

/**
 * The public surface `assembleOption` needs — satisfied structurally by `ChartFeature<TOption>`
 * for any `TOption`.
 */
export interface ChartFeatureLike {
  readonly slot: FeatureSlot;
  options(): AnyChartOption;
  fragment(): AnyChartOption;
  refs(): Record<string, ChartFeatureLike | string | undefined>;
}
