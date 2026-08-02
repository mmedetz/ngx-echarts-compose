import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { describe, expect, it } from 'vitest';
import { assembleOption } from '../../src/lib/core/assembly';
import type { ChartFeatureLike } from '../../src/lib/core/types';

echarts.use([LineChart, BarChart, GridComponent, SVGRenderer]);

const baselinePath = join(
  dirname(fileURLToPath(import.meta.url)),
  'baselines',
  'line-bar-chart.svg',
);

/**
 * zrender assigns every SVG instance ids/classes (`zr3-cls-10`, `zr3-ani-2`, `zr3-c0`, ...) drawn
 * from a process-global, monotonically increasing counter that never resets between `init()`
 * calls. Two renders of identical content therefore get different absolute numbers. Remap each
 * distinct token to a sequential placeholder (in order of first appearance) so repeated renders —
 * and the committed baseline — are comparable on content, not on incidental global counter state.
 */
function normalizeZrIds(svg: string): string {
  const seen = new Map<string, string>();
  return svg.replace(/zr\d+-[a-z]+-?\d+/g, (token) => {
    let placeholder = seen.get(token);
    if (!placeholder) {
      placeholder = `zr-id-${seen.size}`;
      seen.set(token, placeholder);
    }
    return placeholder;
  });
}

function feature(
  slot: ChartFeatureLike['slot'],
  fragment: Record<string, unknown>,
  refs: ChartFeatureLike['refs'] = () => ({}),
): ChartFeatureLike {
  return { slot, fragment: () => fragment, options: () => ({}), refs };
}

function renderLineBarChart(): string {
  const xAxis = feature('xAxis', { type: 'value' });
  const yAxis = feature('yAxis', { type: 'value' });
  const line = feature(
    'series',
    {
      type: 'line',
      data: [
        [0, 12],
        [1, 19],
        [2, 8],
        [3, 24],
        [4, 17],
      ],
    },
    () => ({ xAxis, yAxis }),
  );
  const bar = feature(
    'series',
    {
      type: 'bar',
      data: [
        [0, 5],
        [1, 14],
        [2, 9],
        [3, 11],
        [4, 6],
      ],
    },
    () => ({ xAxis, yAxis }),
  );

  const features = [xAxis, yAxis, line, bar];
  const ids = new Map<ChartFeatureLike, string>([
    [xAxis, 'x-0'],
    [yAxis, 'y-0'],
    [line, 'series-line'],
    [bar, 'series-bar'],
  ]);
  const managedSlots = [...new Set(features.map((f) => f.slot))];
  const option = assembleOption(features, { animation: false }, ids, managedSlots);

  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 400, height: 300 });
  chart.setOption(option, { notMerge: true });
  const svg = normalizeZrIds(chart.renderToSVGString());
  chart.dispose();
  return svg;
}

describe('line + bar chart visual baseline', () => {
  it('matches the committed SVG baseline (reimplementing the ECharts line+bar example)', () => {
    const svg = renderLineBarChart();

    if (!existsSync(baselinePath)) {
      writeFileSync(baselinePath, svg, 'utf8');
    }

    const baseline = readFileSync(baselinePath, 'utf8');
    expect(svg).toBe(baseline);
  });

  it('renders deterministically across repeated calls', () => {
    expect(renderLineBarChart()).toBe(renderLineBarChart());
  });
});
