import { Directive, computed } from '@angular/core';
import { GridComponent } from 'echarts/components';
import { useChartModules } from '../core/use-chart-modules';
import { AxisFeature } from './axis-feature';

@Directive({
  selector: 'ec-value-y-axis',
  exportAs: 'ecValueYAxis',
  host: { style: 'display: none' },
})
export class EcValueYAxisDirective extends AxisFeature {
  override readonly slot = 'yAxis' as const;

  override readonly fragment = computed(() => ({ type: 'value' as const }));

  constructor() {
    super();
    useChartModules(GridComponent);
  }
}
