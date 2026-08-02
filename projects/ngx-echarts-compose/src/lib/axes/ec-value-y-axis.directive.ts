import { Directive, Signal, computed } from '@angular/core';
import { GridComponent } from 'echarts/components';
import type { YAXisComponentOption } from 'echarts';
import { useChartModules } from '../core/use-chart-modules';
import { AxisFeature } from './axis-feature';

@Directive({
  selector: 'ec-value-y-axis',
  exportAs: 'ecValueYAxis',
  host: { style: 'display: none' },
})
export class EcValueYAxisDirective extends AxisFeature<YAXisComponentOption> {
  override readonly slot = 'yAxis' as const;

  override readonly fragment: Signal<YAXisComponentOption> = computed(() => ({
    type: 'value' as const,
  }));

  constructor() {
    super();
    useChartModules(GridComponent);
  }
}
