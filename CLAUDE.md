# ngx-echarts-compose

A declarative Angular wrapper for ECharts: chart configuration is expressed as a **directive
tree** instead of a single options object. A host `<ec-chart>` owns the ECharts instance; each
child directive (axis, series, …) contributes one fragment to the assembled `EChartsOption`.
Cross-references between directives use template reference variables, type-checked at compile
time. ECharts modules are registered per-directive so the bundle only contains what the template
actually uses.

```html
<ec-chart ecCanvas [theme]="theme()" [options]="baseOptions()">
  <ec-value-x-axis #x="ecValueXAxis" />
  <ec-value-y-axis #y="ecValueYAxis" />
  <ec-line-series [xAxis]="x" [yAxis]="y" [data]="data()" />
</ec-chart>
```

## Status

Phase 0 (repo scaffold) and Phase 1 (MVP vertical slice) are done. Phases 2–3 (events, actions,
more axis/series types, presets) are not yet implemented — see [Roadmap](#roadmap).

**Implemented**, under `projects/ngx-echarts-compose/src/lib/`:

- `core/chart-feature.ts` — `ChartFeature` abstract base (self-registers via `EC_CHART_HOST`
  injection token), `id`/`localId`/`options` inputs, `refs`.
- `core/ec-chart.directive.ts` — host directive: DOM-order feature sorting, `assembledOption`
  computed, `afterRenderEffect` writer (`notMerge` on first apply, `replaceMerge` after),
  `managedSlots` (sticky union of slots ever used), renderer conflict/missing checks in dev mode.
- `core/assembly.ts` — pure `assembleOption()` function: merges base `[options]` with template
  fragments per slot, resolves refs to `<slot>Id` fields.
- `core/renderer.directives.ts` — `EcCanvasDirective` (`[ecCanvas]`), `EcSvgDirective` (`[ecSvg]`).
- `core/types.ts` — `FeatureSlot` (currently `grid | xAxis | yAxis | series`), `ChartFeatureLike`.
- `axes/` — `AxisFeature` base, `EcValueXAxisDirective`, `EcValueYAxisDirective`.
- `series/` — `SeriesFeature` base, `EcLineSeriesDirective`, `EcBarSeriesDirective`.

**Not yet implemented:** events/outputs (host as event bus, lazy `outputFromObservable`
subscriptions), imperative actions, category/time axes, pie/scatter/candlestick series, singleton
components (`ec-tooltip`, `ec-legend`, `ec-grid`, `ec-data-zoom`), preset-component support beyond
what self-registration already gives for free, theme-switch re-apply (`setTheme`), resize
handling, loading state.

## Commands

```bash
npm run lint                          # eslint (angular-eslint)
npm run build -- ngx-echarts-compose  # builds the library via ng-packagr
npm test -- --watch=false             # vitest
npm run format                        # prettier --write
npm run format:check
```

CI (`.github/workflows/ci.yml`) runs lint → build lib → test on push/PR to `main`. Note: the
default branch actually pushed to GitHub is `master` — the workflow's branch filter won't trigger
until that's reconciled (rename the branch, or update the workflow).

## Workspace layout

```
ngx-echarts-compose/
├── projects/
│   ├── ngx-echarts-compose/        # the library
│   │   ├── src/lib/
│   │   │   ├── core/                # ChartFeature, EcChartDirective, assembly, renderer, types
│   │   │   ├── axes/                 # AxisFeature + concrete axis directives
│   │   │   ├── series/               # SeriesFeature + concrete series directives
│   │   │   └── index.ts              # public API surface
│   │   └── tests/
│   │       ├── unit/assembly.spec.ts
│   │       ├── integration/host-basic.spec.ts
│   │       └── visual/line-chart.visual.spec.ts
│   └── demo/                        # standalone app for manual testing
├── angular.json / tsconfig.json / eslint.config.js / .prettierrc
└── package.json
```

## Architecture

Full historical design rationale (including code sketches for not-yet-built pieces like events,
actions, and presets) lives in [`concept.md`](concept.md). The essentials, updated for what's
actually built:

**Directives, not components.** Feature directives (`ec-line-series`, `ec-value-x-axis`, …) have
no template, so a directive with `exportAs` is lighter than a `template: ''` component. Every
feature directive hides itself (`host: { style: 'display: none' }`); the `ec-chart` host uses
`display: block` (required for `ResizeObserver` and for ECharts to size its canvas).

**Self-registration via DI, not content queries.** Features inject the host through the
`EC_CHART_HOST` token and call `register()`/`unregister()` in their constructor/`DestroyRef`. This
works through wrapper/preset components and any nesting depth — `contentChildren` cannot see
directives inside a wrapper's own view template, only projected content.

**DOM position is the ordering source of truth.** Registration order is non-deterministic
(depends on Angular's construction sequencing). The host sorts registered features by
`compareDocumentPosition` on each change; this determines each feature's index within its slot.

**Identity is a stable `id`; array index is a derived wire format, recomputed on every emit.**
ECharts' reference graph is index-based (`xAxisIndex`, `seriesIndex`, …), but index must not be
identity across renders — removal/reorder would shift indices and cause `replaceMerge` to blend
the wrong slots. Each feature gets a stable id (explicit `[id]`/`[localId]`, or host-assigned via
`WeakMap<ChartFeature, string>` on first encounter) which is emitted into every fragment and used
to resolve refs to `<slot>Id` fields (e.g. `xAxisId`) rather than raw indices — see `resolveRefs`
in `assembly.ts`. Inside `@for`, supply an explicit `[id]` tied to the track key, since a
recreated directive instance is a new object and gets a new auto-id.

**Refs are bindings, not strings.** `[xAxis]="x"` where `x` is `#x="ecValueXAxis"` — type-checked,
refactor-safe. (String ids as an escape hatch for cross-`@if`/`@for` boundaries are part of the
type — `ChartFeatureRef = ChartFeature | string` — but not yet exercised anywhere.)

**Assembly is a `computed`; writing is a single `afterRenderEffect`.** `assembleOption()` in
`assembly.ts` is a pure function (features, base options, `ecId` fn, `managedSlots`) → merged
option, grouping fragments by slot (`ARRAY_SLOTS`), keeping base `[options]` items ahead of
template items in array position. The host's `afterRenderEffect` is the single writer: `notMerge`
on the first call after `echarts.init()`, `replaceMerge: managedSlots()` after. No `lazyUpdate` —
`afterRenderEffect` already coalesces at the frame level.

**`managedSlots` is sticky.** Once a slot (`'series'`, `'xAxis'`, …) has held a feature, it's kept
in `replaceMerge`'s slot list for the instance's lifetime, even if the last feature in that slot is
later removed — otherwise ECharts would additively merge instead of clearing it. A slot that was
*never* used is left out of the assembled option entirely, so ECharts' own defaults (e.g.
auto-created grid) still apply.

**Module registration happens in each directive's constructor** (`useChartModules([...])`, a thin
wrapper over `echarts.use`). This is preload-compatible (the expensive part is the static `import`,
which tree-shakes normally) and keeps `sideEffects: false` honest — the side effect runs on
instantiation, not module load.

**Renderer selection is two host-attribute directives**, not a runtime input:
`EcCanvasDirective`/`EcSvgDirective` sit on `<ec-chart>` itself; the host reads them via
self-injection (`{ optional: true, self: true }`) and errors (dev mode) if both or neither are
present.

### Selector reference

| Directive | Selector | `exportAs` | Status |
|---|---|---|---|
| Host | `ec-chart` | `ecChart` | ✅ |
| Canvas renderer | `[ecCanvas]` | `ecCanvas` | ✅ |
| SVG renderer | `[ecSvg]` | `ecSvg` | ✅ |
| Value X-Axis | `ec-value-x-axis` | `ecValueXAxis` | ✅ |
| Value Y-Axis | `ec-value-y-axis` | `ecValueYAxis` | ✅ |
| Category/Time X/Y-Axis | `ec-category-x-axis` etc. | — | not started |
| Line series | `ec-line-series` | `ecLineSeries` | ✅ |
| Bar series | `ec-bar-series` | `ecBarSeries` | ✅ |
| Pie/Scatter/Candlestick series | `ec-pie-series` etc. | — | not started |
| Tooltip / Legend / Grid / Data Zoom | `ec-tooltip` etc. | — | not started |

## Roadmap

**Phase 2 — events & host outputs**
- Host-level outputs for chart-global events (`(chartClick)`, `(finished)`, …).
- Lazy per-feature event routing: host as event bus via `EC_CHART_HOST.listenForFeature()`,
  subscribed only when a template output binding exists (`outputFromObservable`).
- Series-targeted (`seriesIndex`-keyed) vs. component-targeted vs. chart-global event categories.

**Phase 3 — expand surface**
- Category/time axes; pie/scatter/candlestick series.
- Singleton components: `ec-tooltip`, `ec-legend`, `ec-grid`, `ec-data-zoom`.
- Imperative action API (`showTip`, zoom reset) via a `dispatchAction` method on `EC_CHART_HOST`.
- Theme switching (`setTheme()` + re-apply), `ResizeObserver`-driven auto-resize, `[loading]` state.
- Dev-mode warnings: unstable auto-ids churned inside `@for`, dangling refs.
- Visual regression tests against more ECharts official examples.

See [`concept.md`](concept.md) §§7–8 for the design rationale and code sketches behind Phase 2/3
items before implementing them — the mechanisms (host as event bus, sticky `managedSlots`,
id-based ref resolution) are already validated by what's built in Phase 0/1.
