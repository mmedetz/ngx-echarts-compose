# Declarative Angular ECharts Wrapper — Architecture

A wrapper where ECharts configuration is expressed as an Angular directive tree instead of a
single options blob. A host `<echart>` owns the ECharts instance; each child directive
contributes one fragment to the final `EChartsOption`. Cross-references use template reference
variables. ECharts modules are registered per-directive so the bundle contains only what the
template actually uses.

```html
<ec-chart #chart ecCanvas [theme]="theme()" [options]="baseOptions()">
  <ec-value-x-axis    #x="ecValueXAxis" />
  <ec-category-y-axis #y="ecCategoryYAxis" [data]="categories()" />
  <ec-line-series [xAxis]="x" [yAxis]="y" [data]="data()" (seriesClick)="onClick($event)" />
</ec-chart>
```

---

## 1. Element model

Everything is a **directive** (not a component): the feature directives have no template, so a
directive with `exportAs` is lighter than a `template: ''` component and is the idiomatic
"this element *is* a referenceable thing" signal (same pattern as the CDK's `cdkOverlayOrigin`).

- `<ec-chart>` — host. Owns the instance, assembly, reference resolution, event routing.
- Feature directives (`ec-value-x-axis`, `ec-line-series`, …) — headless config holders. Each
  exposes a `slot`, a reactive `fragment` signal, and a `refs` map, and registers its own ECharts
  modules.
- Renderer directives (`ecCanvas`, `ecSvg`) — sit on the host element, select the renderer
  by which one is imported.

### DOM visibility

Feature elements are real DOM nodes inside the chart container. They must not interfere with
ECharts' canvas/SVG layout or be visible to the user. Every feature directive hides itself:

```ts
@Directive({
  selector: 'ec-line-series',
  host: { style: 'display: none' },
})
```

The `ec-chart` host itself uses `display: block` (required for `ResizeObserver` to report
meaningful dimensions and for ECharts to size its canvas correctly).

### Directive references require `exportAs`

With a directive, a bare `#x` resolves to the **element**, not the directive instance. The
`="exportAs"` form is **required** to get the directive:

```html
<ec-value-x-axis #x="ecValueXAxis" />   <!-- x is the XAxisValueDirective instance -->
<ec-line-series [xAxis]="x" />           <!-- type-checked against AxisFeature -->
```

Share one `exportAs` name across value/category/time axis variants (e.g. all `exportAs: 'ecXAxis'`)
for ergonomic refs, as long as they live on separate elements.

---

## 2. Feature collection & composability

### Self-registration via DI (inject-up)

Features register themselves with the host via dependency injection rather than the host querying
downward with `contentChildren`. This solves the fundamental limitation of content queries:
they cannot see directives in a wrapper component's **view template** — only projected content.
Self-registration works regardless of nesting depth, preset components, or projection boundaries.

#### Registration token

```ts
import { InjectionToken } from '@angular/core';

export interface ChartHost {
  register(feature: ChartFeature): void;
  unregister(feature: ChartFeature): void;
  /** Subscribe to an ECharts event, filtered to only fire for this feature */
  listenForFeature<T>(feature: ChartFeature, eventName: string): Observable<T>;
}

export const EC_CHART_HOST = new InjectionToken<ChartHost>('EC_CHART_HOST');
```

#### Host provides the registry

```ts
@Directive({
  selector: 'ec-chart',
  exportAs: 'ecChart',
  providers: [{ provide: EC_CHART_HOST, useExisting: forwardRef(() => EcChartDirective) }],
})
export class EcChartDirective implements ChartHost {
  private readonly elementRef = inject(ElementRef);
  private readonly registered = signal<ChartFeature[]>([]);

  /** Features sorted by DOM position — the assembly source of truth */
  readonly features = computed(() => {
    const list = this.registered();
    if (list.length <= 1) return list;
    return [...list].sort((a, b) => {
      const pos = a.elementRef.nativeElement.compareDocumentPosition(b.elementRef.nativeElement);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 :
             pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
    });
  });

  register(feature: ChartFeature): void {
    this.registered.update(list => [...list, feature]);
  }

  unregister(feature: ChartFeature): void {
    this.registered.update(list => list.filter(f => f !== feature));
  }
}
```

#### Feature base class self-registers

```ts
abstract class ChartFeature {
  readonly elementRef = inject(ElementRef);
  private readonly host = inject(EC_CHART_HOST);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.host.register(this);
    this.destroyRef.onDestroy(() => this.host.unregister(this));
  }

  // ... slot, fragment, refs, id — see §4
}
```

Every feature — whether placed directly inside `<ec-chart>` or nested inside a preset component —
injects the same host-provided `EC_CHART_HOST` via the element injector tree and registers
itself. On destroy (`@if` going false, `@for` removing an item, route change), the feature
unregisters automatically via `DestroyRef`.

### Ordering: DOM position as source of truth

Registration order is non-deterministic (it depends on Angular's construction sequencing, which
can vary with `@defer`, conditional creation, etc.). Instead, the host sorts the registered
feature list by **DOM document position** using `compareDocumentPosition`.

This gives the same result as `contentChildren` document-order — the template structure determines
array index — but works across any nesting depth, preset wrappers, and dynamic creation.

Cost is negligible: sorting 3–15 items with a native DOM API, once per registration change.

### No "group" abstraction needed

Because self-registration + DOM-order sorting works transparently through wrapper components,
there is no need for a separate feature-group directive or `hostDirectives` ceremony. A reusable
preset is just a regular component whose view template contains feature directives:

```ts
@Component({
  selector: 'my-ohlc-preset',
  template: `
    <ec-candlestick-series [xAxis]="xAxis()" [localId]="'candle'" [data]="ohlc()" />
    <ec-bar-series [xAxis]="xAxis()" [localId]="'volume'" [data]="volume()" />
    <ec-data-zoom [localId]="'zoom'" />
  `
})
export class OhlcPresetComponent {
  readonly xAxis = input.required<AxisFeature>();
  readonly ohlc = input.required<number[][]>();
  readonly volume = input.required<number[]>();
}
```

Consumer usage — refs cross the preset boundary via normal input bindings:

```html
<ec-chart ecCanvas [theme]="theme()" [options]="baseOptions()">
  <ec-value-x-axis    #x="ecValueXAxis" />
  <ec-category-y-axis #y="ecCategoryYAxis" [data]="categories()" />
  <my-ohlc-preset [xAxis]="x" [ohlc]="ohlcData()" [volume]="volumeData()" />
  <ec-line-series [xAxis]="x" [data]="otherData()" />
</ec-chart>
```

All four features (from the preset + the standalone series) register directly with `ec-chart`.
Their DOM position determines their order in the assembled option arrays. The preset component
is invisible to the chart system.

### Ref-passing rules

| Scenario | How refs work |
|----------|--------------|
| Direct features referencing each other | `#x="exportAs"` → `[xAxis]="x"` (template scope) |
| Preset referencing outside features | Consumer passes ref as input: `[xAxis]="x"` |
| Features inside a preset referencing each other | Normal refs within the preset's own template |

A preset cannot "reach out" on its own — it depends on what the consumer wires in. This keeps data
flow explicit and the template as the single source of truth for relationships.

### Dynamic features (`@if`, `@for`)

- `@if` toggling a feature: construction triggers `register()`, destruction triggers `unregister()`.
  The `registered` signal updates, `features` recomputes with new DOM order, assembly re-runs.
- `@for` with item changes: destroyed features unregister, new ones register. DOM order reflects
  the new template structure. Pair with explicit `[id]` for stable `replaceMerge` identity (§4).

---

## 3. Template references as bindings, not strings

A template variable's **name** is not available at runtime, so `xAxis="#myXAxis"` (string) cannot
be resolved by the library. Used as a **binding expression**, `[xAxis]="x"` evaluates to the
directive instance — type-checked, refactor-safe, no intermediate string id.

Structural boundaries (`@if` / `@for`) isolate ref scope; a ref declared inside one is invisible to
siblings outside it. That single case is the only justification for an optional string-`id`
fallback resolved through a host-built `Map<string, index>`.

---

## 4. Identity is `id`; index is the wire format

ECharts' reference graph is index-based (`xAxisIndex`, `yAxisIndex`, `gridIndex`, `seriesIndex`,
`dataZoom.xAxisIndex`, …), and index-within-slot resolution covers the whole graph including
multi-hop cases (a series in grid 2 references axis 1, which itself carries `gridIndex: 1`). So the
final option **must** emit numbers here.

But index must **not** be the identity across renders:

- Mid-list removal shifts every index below it → `setOption`'s default index-merge blends the wrong
  slots.
- `@for` reorder → animation morphs the wrong series into another.
- A dangling ref resolves to a silent wrong `0` (the `Math.max(0, indexOf())` tell).

So each feature carries a stable `id` (user-supplied or auto), emitted into every fragment to drive
`replaceMerge` matching across updates. Index is computed **fresh from document order at each
emit**, never stored.

### ID resolution hierarchy

Identity within the library uses **object references** — the host holds `ChartFeature` instances
and compares, sorts, and dedupes them by reference. No internal ID string is needed.

At the **ECharts boundary**, the host assigns a stable string `id` into each option fragment for
`replaceMerge` matching. This mapping lives entirely in the host:

```ts
// Inside EcChartDirective
private readonly featureIds = new WeakMap<ChartFeature, string>();
private nextId = 0;

/** Get or create the stable ECharts-facing ID for a feature */
private ecId(feature: ChartFeature): string {
  // Explicit user ID takes precedence
  const explicit = feature.id() ?? feature.localId();
  if (explicit) return explicit;

  // Auto-assign on first encounter, stable for this instance's lifetime
  let id = this.featureIds.get(feature);
  if (!id) {
    id = `__ec_${this.nextId++}`;
    this.featureIds.set(feature, id);
  }
  return id;
}
```

The feature base class carries only the **optional** explicit inputs:

```ts
abstract class ChartFeature {
  readonly id = input<string>();          // explicit user ID (for @for / replaceMerge)
  readonly localId = input<string>();     // preset-scoped identity, set by preset author

  abstract readonly slot: FeatureSlot;                    // 'xAxis' | 'series' | 'grid' | …
  abstract readonly fragment: Signal<Record<string, unknown>>;
  readonly refs: Signal<Record<string, ChartFeature | ChartFeature[] | null>> = signal({});
}
```

A narrower `AxisFeature extends ChartFeature` lets the compiler reject `[xAxis]="someSeries"`.

### `@for` and identity

Auto-IDs (host-assigned via `WeakMap`) are stable for the lifetime of a directive instance. But
inside `@for`, directives are **destroyed and recreated** on collection changes — a new instance
gets a new auto-ID because it's a new object reference. This breaks `replaceMerge` matching
(ECharts sees a removal + addition instead of an update, breaking animations).

The rule: **inside `@for`, supply explicit `[id]` tied to your track key:**

```html
@for (item of items(); track item.key) {
  <ec-line-series [id]="item.key" [data]="item.values" [xAxis]="x" />
}
```

Same mental model as Angular's `track` — the library can't magically know your data identity.

In dev mode, the host warns when features without explicit `[id]` appear to be churned (removed +
recreated rather than appended):

```ts
if (isDevMode() && hasUnstableAutoIds && structureWasReordered) {
  console.warn('Features without explicit [id] were reordered or removed. ' +
    'Add [id] for stable animations inside @for.');
}
```

### Preset-scoped identity

Inside a preset component, the preset author assigns `[localId]` strings (they know their own
template structure). When the consumer uses multiple instances of the same preset, each feature
gets a unique ID because it's a distinct object — the host auto-assigns different IDs via the
`WeakMap`. For explicit control, the consumer supplies `[id]` on the preset's features via inputs:

```html
<my-ohlc-preset [ohlc]="dataA()" [volume]="volA()" />
<my-ohlc-preset [ohlc]="dataB()" [volume]="volB()" />
```

No collision — each preset instance creates separate directive instances with separate auto-IDs.

If the preset uses `@for` internally, the preset author passes explicit `[id]` or `[localId]`
derived from the data item's key.

---

## 5. Reactive assembly & rendering

### Assembly: `computed`

`assembledOption` is a `computed` that groups child fragments by slot into ECharts' index-addressed
arrays, resolves refs to indices, and folds in base `[options]`.

### Merge model

The host accepts a base `[options]` input for any ECharts config not modeled by directives. Each
feature directive also has an `[options]` input for un-modeled sub-fields of its own type.
There is no separate `[mergeOptions]` input — the library handles precedence internally.

**Precedence per array slot:** base `[options]` items first (higher index priority), then template
directive items in document order.

**Precedence per feature:** directive's `[options]` bag < typed inputs (typed inputs win).

```ts
// Feature directive shape
abstract class ChartFeature {
  readonly options = input<Record<string, unknown>>({});   // escape hatch for un-modeled fields
  abstract readonly fragment: Signal<Record<string, unknown>>;  // derived from typed inputs
}

// Concrete example
class SeriesLineDirective extends ChartFeature {
  readonly data = input<number[]>();
  readonly smooth = input<boolean>();

  readonly fragment = computed(() => ({
    type: 'line',
    ...(this.data() != null && { data: this.data() }),
    ...(this.smooth() != null && { smooth: this.smooth() }),
  }));
}
```

This means:
- The library is shippable with minimal typed inputs per directive — `[options]` covers the long
  tail of ECharts properties.
- Frequently-used options can be promoted to typed inputs over time without breaking consumers.
- Full ECharts capability is always available, even for features released after the library version.

### Assembly logic

```ts
readonly assembledOption = computed(() => {
  const feats = this.features();
  const baseOptions = this.options() ?? {};
  const declarative: Record<string, any[]> = {};

  // ═══ Pass 1: Build complete index map across ALL slots ═══
  // This must happen before any ref resolution, because a series in one slot
  // may reference an axis in another slot that hasn't been iterated yet.
  const indexByFeature = new Map<ChartFeature, number>();

  for (const slot of ARRAY_SLOTS) {
    const fromBase: any[] = baseOptions[slot] ?? [];
    let idx = fromBase.length;  // template items start after base items
    for (const f of feats.filter(f => f.slot === slot)) {
      indexByFeature.set(f, idx++);
    }
  }

  // ═══ Pass 2: Build fragments with resolved refs ═══
  for (const slot of ARRAY_SLOTS) {
    const fromBase: any[] = baseOptions[slot] ?? [];
    const fromTemplate = feats
      .filter(f => f.slot === slot)
      .map(f => ({
        id: this.ecId(f),
        ...f.options(),          // bag-of-options (un-modeled fields)
        ...f.fragment(),         // typed inputs override bag fields
        ...this.resolveRefs(f, indexByFeature),  // xAxisIndex, gridIndex, etc.
      }));

    declarative[slot] = [...fromBase, ...fromTemplate];
  }

  return { ...baseOptions, ...declarative };
});
```

`resolveRefs` uses the feature's stable `id` (from `ecId()`) to emit string-based references
(`xAxisId`, `yAxisId`, `gridId`, etc.) wherever ECharts supports them — which covers series→axis
and most component cross-references. This avoids numeric index resolution entirely for the
common case:

```ts
private resolveRefs(
  feature: ChartFeature,
  indexByFeature: Map<ChartFeature, number>,
  baseOptions: Record<string, any>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const refs = feature.refs();

  for (const [refKey, target] of Object.entries(refs)) {
    if (target == null) continue;

    if (typeof target === 'string') {
      // String ref → referencing a base-option item by its id directly
      result[`${refKey}Id`] = target;  // e.g. xAxis → xAxisId: 'my-axis'
    } else {
      // Feature ref → emit the target's stable id
      result[`${target.slot}Id`] = this.ecId(target);  // e.g. xAxisId: '__ec_3'
    }
  }
  return result;
}
```

ECharts resolves `xAxisId` / `yAxisId` / `gridId` internally to the matching component — no
numeric index computation needed by the library. The two-pass index map (`indexByFeature`) is
retained only for the rare cases where ECharts requires a numeric index (e.g., some `dataZoom`
configurations). For most usage, string-id references are sufficient and more robust against
reordering.

### Rendering: `afterRenderEffect`

The single writer uses `afterRenderEffect` (Angular 19+) instead of a bare `effect`. This ensures
exactly one `setOption` call per animation frame, after Angular's rendering is complete — no glitch
from signals updating in different microtask batches.

```ts
afterRenderEffect(() => {
  const option = this.assembledOption();
  this.instance?.setOption(option, { replaceMerge: this.managedSlots() });
});
```

No `lazyUpdate: true` — since `afterRenderEffect` already coalesces at the frame level, adding
`lazyUpdate` would only introduce an unnecessary extra frame of delay.

### Sticky `managedSlots`

`replaceMerge` tells ECharts "this array is complete — remove anything not in it." If a slot drops
from one feature to zero (last series `@if`-ed out), the assembled option no longer contains that
slot. But `replaceMerge` **must** still list it — otherwise ECharts does an additive merge and the
old item persists. Conversely, emitting a slot that was **never** managed (e.g., `xAxis: []` when
no axis directive was ever used) overrides ECharts' default-axis behavior.

Solution: track the historical union of slot names (strings, not feature references — no GC
concern):

```ts
private readonly everManagedSlots = new Set<FeatureSlot>();

readonly managedSlots = computed(() => {
  for (const f of this.features()) {
    this.everManagedSlots.add(f.slot);
  }
  return [...this.everManagedSlots];
});
```

Once a slot enters the managed set, it stays there for the lifetime of the chart instance. The set
contains only slot-name strings (`'series'`, `'xAxis'`, `'grid'`, etc.) — no references to
features, so destroyed features are GC'd normally.

- `replaceMerge` on managed slots is what makes removal work (an `@if`-ed-out series disappears).
- `legend`/`tooltip` selection keys off series **name**, not index — carry names through for those.

---

## 6. Registration & tree-shaking

### Two separate steps

- `import { LineChart } from 'echarts/charts'` — **loads** the code (this is what tree-shaking
  rides on).
- `echarts.use([LineChart])` — **registers** it: runs the installer, mutating ECharts' internal
  registries so `type: 'line'` resolves later. It loads nothing, is synchronous, fast, and
  idempotent (dedupes).

### Decision: register in the constructor

```ts
export class SeriesLineDirective extends ChartFeature {
  constructor() { super(); useChartModules([LineChart]); }   // util wraps echarts.use
}
```

Why the constructor is fine (correcting an earlier over-objection):

- **Preload-compatible.** The expensive part — loading `LineChart`'s code — is done by the static
  `import`, which travels in the route's chunk and is warmed by `withPreloading` during idle.
  Deferring the microsecond `use()` call to render costs nothing.
- **Tree-shakes cleanly.** `sideEffects: false` only governs dropping *unused* modules. Used →
  module + constructor retained; unused → module dropped, constructor never exists. Placement
  doesn't change either outcome.
- **Honest about side effects.** A constructor body runs on instantiation, not module load, so
  `sideEffects: false` stays literally true (unlike a top-level `echarts.use()` statement).
- **Simpler** than a host-collects-modules design — each directive self-registers, no collection
  step.

`useChartModules` is a thin util over `echarts.use` — keep it the *only* place components touch
`echarts/core`, which buys testability/decoupling without changing semantics.

### Why not a provider (for features)

A provider factory only fires when something **injects** it; a config directive has no reason to
inject its own registration token, so it would silently never register. Provider-as-trigger is a
trap for the feature case. `EnvironmentProviders` (`provideEcharts(withLocale('de'))`) remain
appropriate only for genuinely host-global concerns with no owning element.

### Renderer as two host directives

The renderer split lets the **import be the selector**, so it folds into the same
component-carried mechanism as everything else and the renderer feature-function disappears:

```ts
@Directive({ selector: '[ecCanvas]', exportAs: 'ecCanvas' })
export class EcCanvasDirective { constructor() { useChartModules([CanvasRenderer]); }
  readonly renderer = 'canvas' as const; }

@Directive({ selector: '[ecSvg]', exportAs: 'ecSvg' })
export class EcSvgDirective { constructor() { useChartModules([SVGRenderer]); }
  readonly renderer = 'svg' as const; }
```

The host reads which one is present via **self-injection** (they're on the host's own element, so
the injector reaches them — the one place injection goes sideways, not down):

```ts
private readonly canvas = inject(EcCanvasDirective, { optional: true, self: true });
private readonly svg    = inject(EcSvgDirective,    { optional: true, self: true });
private rendererName() { return this.svg?.renderer ?? this.canvas?.renderer ?? 'canvas'; }
```

Dev-mode asserts:
- If **both** are present → error (conflicting renderers)
- If **neither** is present → warn with actionable message ("Add `ecCanvas` or `ecSvg` to your
  `<ec-chart>` element. Without it, `CanvasRenderer` is not registered and ECharts will fail.")

```ts
if (isDevMode()) {
  if (this.canvas && this.svg) {
    throw new Error('ec-chart: Cannot use both ecCanvas and ecSvg. Choose one renderer.');
  }
  if (!this.canvas && !this.svg) {
    console.warn(
      'ec-chart: No renderer directive found. Add `ecCanvas` or `ecSvg` to register a renderer. ' +
      'Without it, echarts.init() will fail with a cryptic error.'
    );
  }
}
```

### How the ecosystem compares

`ngx-echarts` (the dominant lib) does **not** co-locate registration — it has one directive and
pushes `echarts.use([...])` entirely into user code, injected via `provideEchartsCore({ echarts })`.
`ng2-charts` is similar (user registers Chart.js parts). Nuxt ECharts uses a build-time module
config. This design keeps their proven tree-shaking property (loading rides on `import`) while
adding a declarative per-feature config surface they don't have.

---

## 7. Events & actions

### Events — three categories

ECharts events are not uniform in shape. The library categorizes them into routing strategies:

**1. Series-targeted events** (`click`, `dblclick`, `mouseover`, `mouseout`, `contextmenu`)

Carry `seriesIndex` in the payload. The host matches against the feature at that index.

**2. Component-targeted events** (`datazoom`, `legendselectchanged`, etc.)

Target a specific component type using varying identifiers (`dataZoomIndex`, `dataZoomId`, `name`).
The host matches by resolving the identifier against the feature list.

**3. Chart-global events** (`finished`, `rendered`, `globalout`)

No target — always host outputs.

### Event subscription: host as event bus

Features never touch the ECharts instance directly. The host exposes a narrow event API via the
same injection token used for registration (`EC_CHART_HOST`). Each feature self-subscribes
using `outputFromObservable` — if no template binding exists, the Observable is never subscribed,
and ECharts never gets the `.on()` call. Fully lazy, fully self-contained per feature.

#### Host interface

```ts
export interface ChartHost {
  register(feature: ChartFeature): void;
  unregister(feature: ChartFeature): void;
  /** Subscribe to an ECharts event, filtered to only fire for this feature */
  listenForFeature<T>(feature: ChartFeature, eventName: string): Observable<T>;
}

export const EC_CHART_HOST = new InjectionToken<ChartHost>('EC_CHART_HOST');
```

#### Host implementation (ngx-echarts `createLazyEvent` pattern)

```ts
class EcChartDirective implements ChartHost {
  private chartReady$ = new ReplaySubject<ECharts>(1);

  listenForFeature<T>(feature: ChartFeature, eventName: string): Observable<T> {
    return this.chartReady$.pipe(
      switchMap((chart) =>
        new Observable<T>((observer) => {
          const handler = (params: any) => {
            const targetIndex = this.extractTargetIndex(feature.slot, params);
            if (targetIndex != null && this.featureAtIndex(feature.slot, targetIndex) === feature) {
              observer.next(params as T);
            }
          };
          chart.on(eventName, handler);
          return () => { if (!chart.isDisposed()) chart.off(eventName, handler); };
        })
      )
    );
  }

  /** Resolve which index field to check based on the feature's slot */
  private extractTargetIndex(slot: FeatureSlot, params: any): number | null {
    switch (slot) {
      case 'series': return params.seriesIndex ?? null;
      case 'dataZoom': return params.dataZoomIndex ?? null;
      // ... other component slots
      default: return null;
    }
  }
}
```

#### Feature usage

```ts
class SeriesLineDirective extends ChartFeature {
  private readonly host = inject(EC_CHART_HOST);

  readonly seriesClick = outputFromObservable(
    this.host.listenForFeature<ECElementEvent>(this, 'click')
  );
  readonly seriesMouseover = outputFromObservable(
    this.host.listenForFeature<ECElementEvent>(this, 'mouseover')
  );
}
```

#### How laziness works

The `outputFromObservable` + Observable subscription chain means:

- Template has `(seriesClick)="handler($event)"` → Angular subscribes → Observable subscribes →
  `chart.on('click', ...)` is called
- Template has no `(seriesClick)` binding → no subscriber → `chart.on()` never called
- Feature is destroyed → subscriber torn down → `chart.off()` called automatically

No tracking, no `syncEventBindings`, no `activeEvents` method. Each output is independently
lazy via standard Observable subscription semantics (same pattern as ngx-echarts).

#### Multiple features listening to the same event

If 5 series all bind `(seriesClick)`, ECharts gets 5 `.on('click', ...)` handlers. Each filters
by its own index. This is fine — ECharts supports multiple handlers per event, and the filter is
an O(1) identity comparison. For truly hot events (`mousemove`), only features that actually bind
them pay the cost.

### Chart-global events

Global events (`finished`, `rendered`, `globalout`) live on the host directly:

```ts
class EcChartDirective {
  readonly chartFinished = outputFromObservable(this.createHostEvent('finished'));
  readonly chartRendered = outputFromObservable(this.createHostEvent('rendered'));

  private createHostEvent<T>(eventName: string): Observable<T> {
    return this.chartReady$.pipe(
      switchMap((chart) =>
        new Observable<T>((observer) => {
          chart.on(eventName, (params: any) => observer.next(params));
          return () => { if (!chart.isDisposed()) chart.off(eventName); };
        })
      )
    );
  }
}
```

### datazoom event routing — known payload inconsistency

ECharts' `datazoom` event has inconsistent payload shapes depending on the trigger source:
- **Slider zoom**: `{ type: "datazoom", dataZoomId: "...", start, end }`
- **Inside (drag) zoom**: `{ type: "datazoom", batch: [{ dataZoomId: "...", start, end }] }`

The `dataZoomId` field contains ECharts' internal auto-generated id (with null-character prefixes),
not necessarily the user-supplied `id`. The library must normalize both shapes and match against
the feature's `ecId()`. This is fragile — prototype early and consider falling back to
`dataZoomIndex` matching (which is present in both shapes) if id matching proves unreliable.
For single-dataZoom charts (the common case), route all `datazoom` events to the one feature.

### Actions — split by nature to protect the invariant

`dispatchAction` mutates chart state imperatively and can fight the "template is source of truth"
invariant (a later `setOption` clobbers it).

- **Declarative-friendly** (highlight, select) → model as **inputs** that flow into the fragment
  (`emphasis`, `selectedMode`). `[highlighted]="true"` survives re-renders because it *is* the
  declarative state. Preferred wherever ECharts has an option equivalent.
- **Genuinely imperative/transient** (`showTip`, one-shot zoom reset) → a small **method API** on
  the feature; the host exposes a `dispatchAction` method on `EC_CHART_HOST` that features call,
  resolving their own index internally.

Keep the event→output path free of anything that re-triggers assembly by default, so
high-frequency events (`mouseover`, drag `datazoom`) don't cause a setOption-per-event loop; let
consumers opt into closing that loop.

---

## 8. Lifecycle notes

- Init in `afterNextRender`; dispose via `DestroyRef`. `echarts.init` needs no registrations.
- Registration timing is handled by Angular's lifecycle: features construct (and run `use()`)
  before the host's `afterNextRender` where `setOption` runs. A late `@if` child constructs →
  `use()` runs → `registered` signal updates → assembly recomputes → writer effect re-runs. Order
  holds both ways.
- Renderer is chosen by directive, not a runtime input, so it's fixed per instance.
- Expose `getInstance()` as the imperative escape hatch.

### Resize handling

Every production chart wrapper needs automatic resize. The host observes its own DOM element
via `ResizeObserver` and calls `instance.resize()`, throttled to avoid layout thrash:

```ts
// Inside EcChartDirective
readonly autoResize = input(true);

private resizeOb?: ResizeObserver;
private resizeRafId?: number;

private setupResize(): void {
  if (!this.autoResize()) return;

  let first = true;
  this.resizeOb = new ResizeObserver(() => {
    // Ignore the first fire — ResizeObserver fires on initial observe, no actual resize happened
    if (first) { first = false; return; }
    // Coalesce with rAF — at most one resize() per frame
    if (this.resizeRafId == null) {
      this.resizeRafId = requestAnimationFrame(() => {
        this.resizeRafId = undefined;
        this.instance?.resize();
      });
    }
  });
  this.resizeOb.observe(this.elementRef.nativeElement);
}
```

Cleanup on destroy:

```ts
this.destroyRef.onDestroy(() => {
  this.resizeOb?.disconnect();
  if (this.resizeRafId != null) cancelAnimationFrame(this.resizeRafId);
});
```

- `[autoResize]="false"` opt-out for cases where the consumer manages resize manually (e.g.,
  explicit layout transitions with known final dimensions).
- No zone considerations — Angular 22 zoneless is assumed throughout.

### Theme switching

Theme is passed to `echarts.init(dom, theme, opts)` on first init. For runtime theme changes,
ECharts 6 provides `instance.setTheme()` which applies theme tokens without destroying the
instance (no state loss — zoom, selection, scroll all preserved).

After switching the theme, the library re-applies the assembled option so that theme tokens
take visual effect:

```ts
private themeEffect = afterRenderEffect(() => {
  const theme = this.theme();       // ← tracked: effect re-runs on theme change
  if (!this.instance) return;

  this.instance.setTheme(theme ?? 'default');

  // Re-apply so theme tokens actually render.
  // Read assembledOption in untracked() — we only want this effect to fire on theme changes,
  // not on every option change (the main writer handles that separately).
  const option = untracked(() => this.assembledOption());
  this.instance.setOption(option, { replaceMerge: untracked(() => this.managedSlots()) });
});
```

This means `[theme]="darkMode() ? 'dark' : 'default'"` just works — instant toggle, no state
loss, and the declarative layer handles the re-apply that vanilla ECharts requires manually.

### Loading state

The host exposes `[loading]` and `[loadingOpts]` inputs for `showLoading` / `hideLoading`:

```ts
readonly loading = input(false);
readonly loadingOpts = input<object>({});

private loadingEffect = afterRenderEffect(() => {
  const show = this.loading();
  if (!this.instance) return;
  show ? this.instance.showLoading('default', untracked(() => this.loadingOpts()))
       : this.instance.hideLoading();
});
```

### First apply: `notMerge`

The **first** `setOption` call after `echarts.init()` uses `notMerge: true` to avoid merging with
ECharts' internal default empty option. Subsequent calls use `replaceMerge` on managed slots
(the normal path). A simple flag tracks whether the first apply has occurred:

```ts
private firstApply = true;

// In the main writer effect:
afterRenderEffect(() => {
  const option = this.assembledOption();
  if (!this.instance) return;

  if (this.firstApply) {
    this.instance.setOption(option, { notMerge: true });
    this.firstApply = false;
  } else {
    this.instance.setOption(option, { replaceMerge: this.managedSlots() });
  }
});
```

### Host attribute: `ecId` (not `id`)

The host's identity input is named `ecId` rather than `id` to avoid shadowing the native HTML
`id` attribute on the `<ec-chart>` element. Consumers can still use `id="my-chart"` for DOM
purposes without interference.

---

## Summary of the shape

Directives whose **constructors register** their ECharts modules and whose **features self-register**
with the host via DI (`EC_FEATURE_REGISTRY` injection token). The host sorts registered features
by DOM document position (`compareDocumentPosition`) to derive deterministic array indices. No
feature-group abstraction is needed — preset components are ordinary components whose view
templates contain feature directives that register transparently with the ancestor `ec-chart`.
Identity is a stable `id` (explicit or auto-generated); index is recomputed from DOM order only at
emit. References are template-ref bindings (`#x="exportAs"` → `[ref]="x"`) resolved to indices;
presets receive external refs via inputs. Each feature carries an `[options]` bag for un-modeled
fields, with typed inputs taking precedence. Base `[options]` on the host occupies the lower index
positions; template directives follow. One reactive `computed` assembles the option; one
`afterRenderEffect` writes it with `replaceMerge` — no `lazyUpdate`, no glitch. Theme switching
uses `setTheme()` on ECharts 6+ with automatic option re-apply. Events route lazily (only bound
when outputs are subscribed) through three categories: series-targeted, component-targeted, and
chart-global. Actions prefer declarative inputs and fall back to a host-mediated method API. The
library is shippable with minimal typed inputs — the `[options]` escape hatch ensures full ECharts
capability from day one.


---

## 9. Project metadata & naming

| | |
|---|---|
| **Package name** | `ngx-echarts-compose` |
| **Angular** | 22.x (minimum) |
| **ECharts** | 6.x (peer dependency) |
| **Selector prefix** | `ec-` |
| **Selector pattern** | `ec-[type]-component` |

### Selector reference

| Directive | Selector | `exportAs` |
|-----------|----------|------------|
| Host | `ec-chart` | `ecChart` |
| Canvas renderer | `[ecCanvas]` (attr) | `ecCanvas` |
| SVG renderer | `[ecSvg]` (attr) | `ecSvg` |
| Value X-Axis | `ec-value-x-axis` | `ecValueXAxis` |
| Category X-Axis | `ec-category-x-axis` | `ecCategoryXAxis` |
| Time X-Axis | `ec-time-x-axis` | `ecTimeXAxis` |
| Value Y-Axis | `ec-value-y-axis` | `ecValueYAxis` |
| Category Y-Axis | `ec-category-y-axis` | `ecCategoryYAxis` |
| Line series | `ec-line-series` | `ecLineSeries` |
| Bar series | `ec-bar-series` | `ecBarSeries` |
| Pie series | `ec-pie-series` | `ecPieSeries` |
| Scatter series | `ec-scatter-series` | `ecScatterSeries` |
| Candlestick series | `ec-candlestick-series` | `ecCandlestickSeries` |
| Tooltip | `ec-tooltip` | `ecTooltip` |
| Legend | `ec-legend` | `ecLegend` |
| Grid | `ec-grid` | `ecGrid` |
| Data Zoom | `ec-data-zoom` | `ecDataZoom` |

---

## 10. Implementation steps

### Phase 0: Repository setup

- Angular CLI workspace with a library project (`projects/ngx-echarts-compose`) and a `demo`
  app for manual testing.
- **Prettier** for formatting (standard Angular config).
- **ESLint** with `angular-eslint` for linting.
- **Vitest** for unit testing (fast, ESM-native, signal-friendly).
- GitHub Actions CI: lint → build lib → test.
- Standard GitHub scaffolding: LICENSE (MIT), `.editorconfig`, `tsconfig` paths.

### Workspace layout

```
ngx-echarts-compose/
├── projects/
│   └── ngx-echarts-compose/              # The library
│       ├── src/
│       │   ├── lib/
│       │   │   ├── core/
│       │   │   │   ├── chart-feature.ts          # Abstract base class
│       │   │   │   ├── ec-chart.directive.ts     # Host directive
│       │   │   │   ├── renderer.directives.ts    # Canvas/SVG directives
│       │   │   │   ├── use-chart-modules.ts      # echarts.use wrapper
│       │   │   │   ├── types.ts                  # FeatureSlot, shared types
│       │   │   │   └── assembly.ts               # Pure assembly/merge logic
│       │   │   ├── axes/
│       │   │   │   ├── ec-value-x-axis.directive.ts
│       │   │   │   ├── ec-value-y-axis.directive.ts
│       │   │   │   └── axis-feature.ts           # AxisFeature base
│       │   │   ├── series/
│       │   │   │   ├── ec-line-series.directive.ts
│       │   │   │   ├── ec-bar-series.directive.ts
│       │   │   │   └── series-feature.ts         # SeriesFeature base
│       │   │   └── index.ts                      # Public API exports
│       │   └── public-api.ts
│       ├── package.json
│       └── ng-package.json
├── demo/                                  # Standalone app for manual testing
│   └── src/
├── tests/                                 # Vitest test files
│   ├── unit/
│   │   ├── assembly.spec.ts
│   │   ├── identity.spec.ts
│   │   ├── event-binding.spec.ts
│   │   └── ref-resolution.spec.ts
│   ├── integration/
│   │   ├── host-basic.spec.ts
│   │   └── dynamic-features.spec.ts
│   └── visual/
│       ├── baselines/
│       └── line-chart.visual.spec.ts
├── vitest.config.ts
├── .prettierrc
├── eslint.config.js
├── angular.json
├── package.json
└── tsconfig.json
```

### Testing strategy

Three layers, from cheap to expensive:

**1. Pure unit tests (Vitest, no DOM)**

- **`replaceMerge` / assembly logic:** Given a set of features (mocked) and base options, does the
  host produce the correct merged option with correct index resolution, correct `id` emission, and
  correct `replaceMerge` slot list? This is the core logic worth testing — not object composition
  per se, but the *reduction* to the final merge payload.
- **Event subscription mechanism:** Given features with various `Subject.observed` states, does
  `syncEventBindings` produce the correct set of bound/unbound event names? Test subscribe, add
  feature, remove feature, no-listener scenarios.
- **Ref resolution:** Given features with cross-refs, are indices resolved correctly? Dangling refs
  produce warnings?
- **Identity:** Auto-ID stability, group-scoped ID composition, `@for`-style churn detection.

**2. Integration tests (Vitest + TestBed + real ECharts instance)**

- Mount the host with child directives, verify `setOption` is called with the expected option.
- Add/remove features dynamically (`@if` simulation), verify `replaceMerge` correctly adds/removes.
- Theme switch: verify `setTheme` + re-apply on ECharts 6, dispose+re-init on ECharts 5.

**3. Visual comparison tests (Vitest + ECharts server-side rendering)**

- Take ECharts official examples, reimplement them using the declarative wrapper, render via
  ECharts' `getDataURL()` (or `renderToSVGString()` for SVG renderer), and compare the output
  image/SVG against a baseline produced by the same ECharts version with the raw option.
- This catches regressions where the assembled option *looks* correct structurally but produces
  a visually wrong chart (e.g., wrong axis assignment, missing series).
- Only feasible for static (non-interactive, non-animated) examples. Store baselines in the repo
  and diff on CI.
- No Playwright needed — everything runs in Node via ECharts' headless `canvas` support
  (`echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 600 })`).

### Phase 1: Base structure (MVP)

Minimal vertical slice that proves the architecture end-to-end:

1. **`ChartFeature` abstract class** — `id`, `resolvedId`, `slot`, `fragment`, `options` input, `refs`.
2. **`assembly.ts`** — pure function: `assembleOption(features, baseOptions)` → merged option.
   Write unit tests for this immediately.
3. **`EcChartDirective` (host)** — `contentChildren` collection, assembly `computed`,
   `afterRenderEffect` writer, `[options]` input, `[theme]` input, `getInstance()`.
   Selector: `ec-chart`.
4. **Renderer directives** — `EcCanvasDirective` (`[ecCanvas]`), `EcSvgDirective` (`[ecSvg]`).
5. **`useChartModules` util** — thin wrapper over `echarts.use`.
6. **`EcValueXAxisDirective`** — `slot: 'xAxis'`, selector: `ec-value-x-axis`,
   `exportAs: 'ecValueXAxis'`, `[options]` input, typed inputs: `[data]`.
7. **`EcValueYAxisDirective`** — same shape, `slot: 'yAxis'`, selector: `ec-value-y-axis`.
8. **`EcLineSeriesDirective`** — `slot: 'series'`, selector: `ec-line-series`,
   `exportAs: 'ecLineSeries'`, `[options]` input, typed inputs: `[data]`, `[xAxis]` ref,
   `[yAxis]` ref. Registers `LineChart`.
9. **`EcBarSeriesDirective`** — same shape, selector: `ec-bar-series`, registers `BarChart`.

Deliverable: a working `<ec-chart>` that renders a line or bar chart with axis refs, driven by
the declarative template. Covered by unit + integration + one visual comparison test.

### Phase 2: Global events & host outputs

- Host-level outputs for chart-global events: `(chartClick)`, `(chartDblClick)`, `(finished)`.
- Lazy binding infrastructure (`syncEventBindings`).
- Series-targeted event routing with `Subject` + `outputFromObservable` on series directives.

### Phase 3: Iterate & expand

- More axis types (`EcCategoryXAxisDirective`, `EcCategoryYAxisDirective`, `EcTimeXAxisDirective`).
- More series types (`ec-pie-series`, `ec-scatter-series`, `ec-candlestick-series`, …).
- `EcFeatureGroupDirective` for composable presets.
- Singleton component directives (`ec-tooltip`, `ec-legend`, `ec-grid`, `ec-data-zoom`).
- Imperative action API (`showTip`, `highlight`).
- Theme switching with `setTheme()` (ECharts 6 path).
- Dev-mode warnings (ownership conflicts, unstable IDs, dangling refs).
- Visual comparison tests against more ECharts official examples.
