import {
  DestroyRef,
  Directive,
  ElementRef,
  afterRenderEffect,
  forwardRef,
  inject,
  input,
  isDevMode,
  signal,
} from '@angular/core';
import * as echarts from 'echarts/core';
import type { ECharts, EChartsOption } from 'echarts';
import { assembleOption } from './assembly';
import { EC_CHART_HOST, type ChartFeature, type ChartHost } from './chart-feature';
import { EcCanvasDirective, EcSvgDirective } from './renderer.directives';
import type { AnyChartOption, FeatureSlot } from './types';

@Directive({
  selector: 'ec-chart',
  exportAs: 'ecChart',
  host: { style: 'display: block' },
  providers: [{ provide: EC_CHART_HOST, useExisting: forwardRef(() => EcChartDirective) }],
})
export class EcChartDirective implements ChartHost {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvas = inject(EcCanvasDirective, { optional: true, self: true });
  private readonly svg = inject(EcSvgDirective, { optional: true, self: true });

  readonly options = input<EChartsOption>({});
  readonly theme = input<string | object | undefined>(undefined);

  private readonly registered = signal<readonly ChartFeature<AnyChartOption>[]>([]);
  private readonly featureIds = new WeakMap<ChartFeature<AnyChartOption>, string>();
  private readonly everManagedSlots = new Set<FeatureSlot>();
  private nextId = 0;
  private instance?: ECharts;
  private firstApply = true;

  constructor() {
    if (isDevMode()) {
      if (this.canvas && this.svg) {
        throw new Error('ec-chart: Cannot use both ecCanvas and ecSvg. Choose one renderer.');
      }
      if (!this.canvas && !this.svg) {
        console.warn(
          'ec-chart: No renderer directive found. Add `ecCanvas` or `ecSvg` to register a renderer. ' +
            'Without it, echarts.init() will fail with a cryptic error.',
        );
      }
    }

    this.destroyRef.onDestroy(() => this.instance?.dispose());

    afterRenderEffect(() => {
      // DOM-position sort reads live DOM state (compareDocumentPosition), so it — and everything
      // downstream of it — may only run here, post-render. Nothing outside this callback may call
      // sortByDomPosition or trackManagedSlots.
      const features = this.sortByDomPosition(this.registered());
      const managedSlots = this.trackManagedSlots(features);
      const option = assembleOption(
        features,
        this.options(),
        (feature) => this.ecId(feature as ChartFeature<AnyChartOption>),
        managedSlots,
      ) as EChartsOption;

      this.instance ??= echarts.init(this.elementRef.nativeElement, this.theme());

      if (this.firstApply) {
        this.instance.setOption(option, { notMerge: true });
        this.firstApply = false;
      } else {
        this.instance.setOption(option, { replaceMerge: managedSlots });
      }
    });
  }

  register(feature: ChartFeature<AnyChartOption>): void {
    this.registered.update((list) => [...list, feature]);
  }

  unregister(feature: ChartFeature<AnyChartOption>): void {
    this.registered.update((list) => list.filter((f) => f !== feature));
  }

  getInstance(): ECharts | undefined {
    return this.instance;
  }

  /** Sorts by DOM position — the assembly source of truth. Only call post-render. */
  private sortByDomPosition(
    list: readonly ChartFeature<AnyChartOption>[],
  ): readonly ChartFeature<AnyChartOption>[] {
    if (list.length <= 1) return list;
    return [...list].sort((a, b) => {
      const position = a.elementRef.nativeElement.compareDocumentPosition(
        b.elementRef.nativeElement,
      );
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  /** Slots are added and never removed — see the `managedSlots` note in CLAUDE.md. */
  private trackManagedSlots(features: readonly ChartFeature<AnyChartOption>[]): FeatureSlot[] {
    for (const feature of features) {
      this.everManagedSlots.add(feature.slot);
    }
    return [...this.everManagedSlots];
  }

  private ecId(feature: ChartFeature<AnyChartOption>): string {
    const explicit = feature.id() ?? feature.localId();
    if (explicit) return explicit;

    let id = this.featureIds.get(feature);
    if (!id) {
      id = `__ec_${this.nextId++}`;
      this.featureIds.set(feature, id);
    }
    return id;
  }
}
