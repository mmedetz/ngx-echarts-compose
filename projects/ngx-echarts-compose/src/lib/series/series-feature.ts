import { Directive, computed, input } from '@angular/core';
import { AxisFeature } from '../axes/axis-feature';
import { ChartFeature } from '../core/chart-feature';
import type { AnyChartOption } from '../core/types';

@Directive()
export abstract class SeriesFeature<
  TOption extends { data?: unknown } = Record<string, unknown>,
> extends ChartFeature<TOption> {
  abstract override readonly slot: 'series';

  /**
   * Declared here (parametrically, over the still-generic `TOption`) rather than on each
   * concrete series directive: TypeScript only needs to print `TOption['data']` symbolically in
   * this class's own `.d.ts` — it's resolved to the real, concrete type (e.g.
   * `LineSeriesOption['data']`) lazily, at each `SeriesFeature<...>` instantiation site. Declaring
   * it directly on a concrete directive instead would force TS to expand and print that resolved
   * type there, which fails (TS4029) for series whose item type isn't exported by `echarts` from
   * any public entry point (true for line/bar's `LineDataItemOption`/`OptionDataValue`).
   */
  readonly data = input<TOption['data']>();

  readonly xAxis = input<AxisFeature<AnyChartOption>>();
  readonly yAxis = input<AxisFeature<AnyChartOption>>();

  override readonly refs = computed(() => ({
    xAxis: this.xAxis() ?? null,
    yAxis: this.yAxis() ?? null,
  }));
}
