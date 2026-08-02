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
 * The erased shape of any `ChartFeature<TOption>`, independent of `TOption`. Not every feature has
 * an id — only `IdFeatureLike` ones do — so a ref target (`refs()`'s values) is always
 * `IdFeatureLike`, never a plain `ChartFeatureLike`: only an id-bearing feature can be pointed at.
 */
export interface ChartFeatureLike {
  readonly slot: FeatureSlot;
  options(): AnyChartOption;
  fragment(): AnyChartOption;
  refs(): Record<string, IdFeatureLike | string | undefined>;
}

/**
 * A `ChartFeatureLike` that contributes to an id-addressed ECharts array slot (`grid`, `xAxis`,
 * `yAxis`, `series`) — the public surface `assembleOption` needs, satisfied structurally by
 * `IdFeature<TOption>` for any `TOption`.
 */
export interface IdFeatureLike extends ChartFeatureLike {
  resolvedId(): string;
}
