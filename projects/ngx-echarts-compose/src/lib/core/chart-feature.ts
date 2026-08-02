import {
  DestroyRef,
  Directive,
  ElementRef,
  InjectionToken,
  Signal,
  inject,
  input,
  signal,
} from '@angular/core';
import type { AnyChartOption, FeatureSlot } from './types';

export interface ChartHost {
  register(feature: ChartFeature<AnyChartOption>): void;
  unregister(feature: ChartFeature<AnyChartOption>): void;
}

export const EC_CHART_HOST = new InjectionToken<ChartHost>('EC_CHART_HOST');

export type ChartFeatureRef = ChartFeature<AnyChartOption> | string;

/**
 * `TOption` is the ECharts sub-option shape this feature contributes to (e.g.
 * `XAXisComponentOption`, `LineSeriesOption`) — it types both the `[options]` escape hatch and
 * `fragment`. Code that only needs to route features generically (the host, `assembleOption`)
 * works against `ChartFeature<AnyChartOption>` or the erased `ChartFeatureLike`, never a specific
 * `TOption`.
 */
@Directive()
export abstract class ChartFeature<TOption extends AnyChartOption = Record<string, unknown>> {
  readonly elementRef = inject(ElementRef<Element>);
  private readonly host = inject(EC_CHART_HOST);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input<string>();
  readonly localId = input<string>();
  readonly options = input<Partial<TOption>>({});

  abstract readonly slot: FeatureSlot;
  abstract readonly fragment: Signal<TOption>;
  readonly refs: Signal<Record<string, ChartFeatureRef | undefined>> = signal({});

  constructor() {
    this.host.register(this);
    this.destroyRef.onDestroy(() => this.host.unregister(this));
  }
}
