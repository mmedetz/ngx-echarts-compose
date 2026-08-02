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
import { assembleOption, type FeatureIds } from './assembly';
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

  private readonly registered = signal<ReadonlySet<ChartFeature<AnyChartOption>>>(new Set());
  private readonly everManagedSlots = new Set<FeatureSlot>();
  /** Auto-assigned ids, cached per feature so they stay stable across renders. */
  private readonly autoIds = new WeakMap<ChartFeature<AnyChartOption>, string>();
  private nextAutoId = 0;
  /** Every feature's id as of the last assembly run — the single source `getFeatureId` reads. */
  private resolvedIds: FeatureIds = new Map();
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
      const features = this.sortByDomPosition([...this.registered()]);
      const managedSlots = this.trackManagedSlots(features);
      this.resolvedIds = this.resolveIds(features);
      const option = assembleOption(
        features,
        this.options(),
        this.resolvedIds,
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
    this.registered.update((set) => new Set(set).add(feature));
  }

  unregister(feature: ChartFeature<AnyChartOption>): void {
    this.registered.update((set) => {
      const next = new Set(set);
      next.delete(feature);
      return next;
    });
  }

  getInstance(): ECharts | undefined {
    return this.instance;
  }

  /**
   * The stable wire id ECharts sees for `feature` — its explicit `[id]`, or the host-assigned auto
   * id, if one has been resolved yet. Reads straight from `resolvedIds`, the same map the last
   * assembly run gave to `assembleOption`, so it's side-effect free: it never assigns an id, and
   * returns `undefined` for a feature the assembly effect hasn't resolved one for yet.
   */
  getFeatureId(feature: ChartFeature<AnyChartOption>): string | undefined {
    return this.resolvedIds.get(feature);
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

  /**
   * Resolves every feature's stable id in one pass: explicit `[id]` wins, otherwise a
   * previously-assigned auto id, otherwise a freshly-assigned one. First-assignment order must
   * follow DOM order (not registration order) for auto ids to be deterministic across renders —
   * only call post-render, with the DOM-sorted `features` list.
   */
  private resolveIds(features: readonly ChartFeature<AnyChartOption>[]): FeatureIds {
    const ids = new Map<ChartFeature<AnyChartOption>, string>();
    for (const feature of features) {
      let id = feature.id() ?? this.autoIds.get(feature);
      if (!id) {
        id = `__ec_${this.nextAutoId++}`;
        this.autoIds.set(feature, id);
      }
      ids.set(feature, id);
    }
    return ids;
  }
}
