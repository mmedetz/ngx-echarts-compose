import { Directive, computed, input } from '@angular/core';
import { LineChart } from 'echarts/charts';
import { useChartModules } from '../core/use-chart-modules';
import { SeriesFeature } from './series-feature';

@Directive({
  selector: 'ec-line-series',
  exportAs: 'ecLineSeries',
  host: { style: 'display: none' },
})
export class EcLineSeriesDirective extends SeriesFeature {
  override readonly slot = 'series' as const;

  readonly data = input<unknown[]>();
  readonly smooth = input<boolean>();
  readonly name = input<string>();

  override readonly fragment = computed(() => ({
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
