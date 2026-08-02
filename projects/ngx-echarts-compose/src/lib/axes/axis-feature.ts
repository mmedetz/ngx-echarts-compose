import { ChartFeature } from '../core/chart-feature';
import type { AnyChartOption } from '../core/types';

export abstract class AxisFeature<
  TOption extends AnyChartOption = Record<string, unknown>,
> extends ChartFeature<TOption> {
  abstract override readonly slot: 'xAxis' | 'yAxis';
}
