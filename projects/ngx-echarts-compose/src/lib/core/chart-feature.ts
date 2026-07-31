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
import type { FeatureSlot } from './types';

export interface ChartHost {
  register(feature: ChartFeature): void;
  unregister(feature: ChartFeature): void;
}

export const EC_CHART_HOST = new InjectionToken<ChartHost>('EC_CHART_HOST');

export type ChartFeatureRef = ChartFeature | string;

@Directive()
export abstract class ChartFeature {
  readonly elementRef = inject(ElementRef<Element>);
  private readonly host = inject(EC_CHART_HOST);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input<string>();
  readonly localId = input<string>();
  readonly options = input<Record<string, unknown>>({});

  abstract readonly slot: FeatureSlot;
  abstract readonly fragment: Signal<Record<string, unknown>>;
  readonly refs: Signal<Record<string, ChartFeatureRef | ChartFeatureRef[] | null>> = signal({});

  constructor() {
    this.host.register(this);
    this.destroyRef.onDestroy(() => this.host.unregister(this));
  }
}
