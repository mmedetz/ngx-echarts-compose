import { ChartFeature } from '../core/chart-feature';

export abstract class AxisFeature extends ChartFeature {
  abstract override readonly slot: 'xAxis' | 'yAxis';
}
