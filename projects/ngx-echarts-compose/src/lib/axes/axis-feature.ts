import { IdFeature } from '../core/chart-feature';
import type { AnyChartOption } from '../core/types';

export abstract class AxisFeature<
  TOption extends AnyChartOption = Record<string, unknown>,
> extends IdFeature<TOption> {
  abstract override readonly slot: 'xAxis' | 'yAxis';
}
