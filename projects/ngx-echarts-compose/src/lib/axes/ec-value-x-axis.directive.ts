import { Directive, computed } from '@angular/core';
import { GridComponent } from 'echarts/components';
import { useChartModules } from '../core/use-chart-modules';
import { AxisFeature } from './axis-feature';

@Directive({
  selector: 'ec-value-x-axis',
  exportAs: 'ecValueXAxis',
  host: { style: 'display: none' },
})
export class EcValueXAxisDirective extends AxisFeature {
  override readonly slot = 'xAxis' as const;

  override readonly fragment = computed(() => ({ type: 'value' as const }));

  constructor() {
    super();
    useChartModules(GridComponent);
  }
}
