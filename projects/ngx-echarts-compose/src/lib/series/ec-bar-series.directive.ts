import { Directive, Signal, computed, input } from '@angular/core';
import { BarChart } from 'echarts/charts';
import type { BarSeriesOption } from 'echarts';
import { useChartModules } from '../core/use-chart-modules';
import { SeriesFeature } from './series-feature';

@Directive({
  selector: 'ec-bar-series',
  exportAs: 'ecBarSeries',
  host: { style: 'display: none' },
})
export class EcBarSeriesDirective extends SeriesFeature<BarSeriesOption> {
  override readonly slot = 'series' as const;

  readonly name = input<string>();

  override readonly fragment: Signal<BarSeriesOption> = computed(() => ({
    type: 'bar' as const,
    ...(this.data() != null && { data: this.data() }),
    ...(this.name() != null && { name: this.name() }),
  }));

  constructor() {
    super();
    useChartModules(BarChart);
  }
}
