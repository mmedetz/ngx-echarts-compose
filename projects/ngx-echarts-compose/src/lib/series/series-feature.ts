import { Directive, computed, input } from '@angular/core';
import { AxisFeature } from '../axes/axis-feature';
import { ChartFeature } from '../core/chart-feature';

@Directive()
export abstract class SeriesFeature extends ChartFeature {
  abstract override readonly slot: 'series';

  readonly xAxis = input<AxisFeature>();
  readonly yAxis = input<AxisFeature>();

  override readonly refs = computed(() => ({
    xAxis: this.xAxis() ?? null,
    yAxis: this.yAxis() ?? null,
  }));
}
