import { Directive, Signal, computed, input } from '@angular/core';
import { LineChart } from 'echarts/charts';
import type { LineSeriesOption } from 'echarts';
import { useChartModules } from '../core/use-chart-modules';
import { SeriesFeature } from './series-feature';

@Directive({
  selector: 'ec-line-series',
  exportAs: 'ecLineSeries',
  host: { style: 'display: none' },
})
export class EcLineSeriesDirective extends SeriesFeature<LineSeriesOption> {
  override readonly slot = 'series' as const;

  readonly smooth = input<boolean>();
  readonly name = input<string>();

  override readonly fragment: Signal<LineSeriesOption> = computed(() => ({
    type: 'line' as const,
    ...(this.data() != null && { data: this.data() }),
    ...(this.smooth() != null && { smooth: this.smooth() }),
    ...(this.name() != null && { name: this.name() }),
  }));

  constructor() {
    super();
    useChartModules(LineChart);
  }
}
