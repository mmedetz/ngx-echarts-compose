import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
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
import type { FeatureSlot } from './types';

@Directive({
  selector: 'ec-chart',
  exportAs: 'ecChart',
  host: { style: 'display: block' },
  providers: [{ provide: EC_CHART_HOST, useExisting: forwardRef(() => EcChartDirective) }],
})
export class EcChartDirective implements ChartHost {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvas = inject(EcCanvasDirective, { optional: true, self: true });
  private readonly svg = inject(EcSvgDirective, { optional: true, self: true });

  readonly options = input<EChartsOption>({});
  readonly theme = input<string | object | undefined>(undefined);

  private readonly registered = signal<readonly ChartFeature[]>([]);
  private readonly featureIds = new WeakMap<ChartFeature, string>();
  private readonly everManagedSlots = new Set<FeatureSlot>();
  private nextId = 0;
  private instance?: ECharts;
  private firstApply = true;

  /** Features sorted by DOM position — the assembly source of truth. */
  readonly features = computed(() => {
    const list = this.registered();
    if (list.length <= 1) return list;
    return [...list].sort((a, b) => {
      const position = a.elementRef.nativeElement.compareDocumentPosition(
        b.elementRef.nativeElement,
      );
      return position & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : position & Node.DOCUMENT_POSITION_PRECEDING
          ? 1
          : 0;
    });
  });

  readonly managedSlots = computed(() => {
    for (const feature of this.features()) {
      this.everManagedSlots.add(feature.slot);
    }
    return [...this.everManagedSlots];
  });

  readonly assembledOption = computed(() =>
    assembleOption(
      this.features(),
      this.options() as unknown as Record<string, unknown>,
      (feature) => this.ecId(feature as ChartFeature),
      this.managedSlots(),
    ),
  );

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

    afterNextRender(() => {
      this.instance = echarts.init(this.elementRef.nativeElement, this.theme());
      this.destroyRef.onDestroy(() => this.instance?.dispose());
    });

    afterRenderEffect(() => {
      const option = this.assembledOption() as unknown as EChartsOption;
      if (!this.instance) return;

      if (this.firstApply) {
        this.instance.setOption(option, { notMerge: true });
        this.firstApply = false;
      } else {
        this.instance.setOption(option, { replaceMerge: this.managedSlots() });
      }
    });
  }

  register(feature: ChartFeature): void {
    this.registered.update((list) => [...list, feature]);
  }

  unregister(feature: ChartFeature): void {
    this.registered.update((list) => list.filter((f) => f !== feature));
  }

  getInstance(): ECharts | undefined {
    return this.instance;
  }

  private ecId(feature: ChartFeature): string {
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
