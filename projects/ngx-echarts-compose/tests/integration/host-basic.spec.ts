import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { EcValueXAxisDirective } from '../../src/lib/axes/ec-value-x-axis.directive';
import { EcValueYAxisDirective } from '../../src/lib/axes/ec-value-y-axis.directive';
import { EcChartDirective } from '../../src/lib/core/ec-chart.directive';
import { EcSvgDirective } from '../../src/lib/core/renderer.directives';
import { EcLineSeriesDirective } from '../../src/lib/series/ec-line-series.directive';

@Component({
  selector: 'ec-test-host',
  imports: [
    EcChartDirective,
    EcSvgDirective,
    EcValueXAxisDirective,
    EcValueYAxisDirective,
    EcLineSeriesDirective,
  ],
  template: `
    <ec-chart #chart ecSvg style="width: 200px; height: 200px">
      <ec-value-x-axis #x="ecValueXAxis" />
      <ec-value-y-axis #y="ecValueYAxis" />
      @if (showSeries()) {
        <ec-line-series [xAxis]="x" [yAxis]="y" [data]="data()" />
      }
    </ec-chart>
  `,
})
class TestHostComponent {
  readonly showSeries = signal(true);
  readonly data = signal([1, 2, 3]);
}

describe('EcChartDirective integration', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  async function createFixture() {
    const fixture = TestBed.createComponent(TestHostComponent);
    const chartEl = fixture.nativeElement.querySelector('ec-chart') as HTMLElement;
    // jsdom reports 0 for clientWidth/clientHeight regardless of inline styles (no real layout
    // engine). ECharts' cartesian2d coordinate-system linkage takes a different code path on a
    // zero-size container, so this stub is required to exercise the real-browser code path.
    Object.defineProperty(chartEl, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(chartEl, 'clientHeight', { value: 200, configurable: true });

    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function getChartDirective(
    fixture: ReturnType<typeof TestBed.createComponent<TestHostComponent>>,
  ) {
    return fixture.debugElement.children[0].injector.get(EcChartDirective);
  }

  it('assembles xAxis/yAxis/series into the ECharts instance on first render', async () => {
    const fixture = await createFixture();
    const option = getChartDirective(fixture).getInstance()?.getOption();

    expect(option).toBeDefined();
    const xAxis = option!['xAxis'] as Array<Record<string, unknown>>;
    const yAxis = option!['yAxis'] as Array<Record<string, unknown>>;
    const series = option!['series'] as Array<Record<string, unknown>>;

    expect(xAxis).toHaveLength(1);
    expect(xAxis[0]['type']).toBe('value');
    expect(yAxis).toHaveLength(1);
    expect(yAxis[0]['type']).toBe('value');
    expect(series).toHaveLength(1);
    expect(series[0]['type']).toBe('line');
    expect(series[0]['data']).toEqual([1, 2, 3]);
    expect(series[0]['xAxisId']).toBe(xAxis[0]['id']);
    expect(series[0]['yAxisId']).toBe(yAxis[0]['id']);

    // No `ec-grid` directive was used, so ECharts must auto-create its own default grid[0]
    // instead of us forcing an empty `grid: []` that would leave the axes without a coordinate
    // system to attach to.
    const grid = option!['grid'] as Array<Record<string, unknown>>;
    expect(grid.length).toBeGreaterThan(0);
  });

  it('removes a series from the instance when its directive is destroyed (replaceMerge)', async () => {
    const fixture = await createFixture();
    fixture.componentInstance.showSeries.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    const option = getChartDirective(fixture).getInstance()?.getOption();
    const series = option!['series'] as Array<Record<string, unknown>>;

    expect(series).toHaveLength(0);
  });

  it('updates series data reactively without losing the axis pair', async () => {
    const fixture = await createFixture();
    fixture.componentInstance.data.set([9, 8, 7]);
    fixture.detectChanges();
    await fixture.whenStable();

    const option = getChartDirective(fixture).getInstance()?.getOption();
    const series = option!['series'] as Array<Record<string, unknown>>;

    expect(series[0]['data']).toEqual([9, 8, 7]);
  });
});
