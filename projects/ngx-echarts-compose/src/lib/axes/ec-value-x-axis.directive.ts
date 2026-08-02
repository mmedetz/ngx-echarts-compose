import { Directive, Signal, computed } from '@angular/core';
import { GridComponent } from 'echarts/components';
import type { XAXisComponentOption } from 'echarts';
import { useChartModules } from '../core/use-chart-modules';
import { AxisFeature } from './axis-feature';

@Directive({
  selector: 'ec-value-x-axis',
  exportAs: 'ecValueXAxis',
  host: { style: 'display: none' },
})
export class EcValueXAxisDirective extends AxisFeature<XAXisComponentOption> {
  override readonly slot = 'xAxis' as const;

  override readonly fragment: Signal<XAXisComponentOption> = computed(() => ({
    type: 'value' as const,
  }));

  constructor() {
    super();
    useChartModules(GridComponent);
  }
}
