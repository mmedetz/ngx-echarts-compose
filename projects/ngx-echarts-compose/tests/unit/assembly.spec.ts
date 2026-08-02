import { describe, expect, it } from 'vitest';
import { assembleOption } from '../../src/lib/core/assembly';
import { ARRAY_SLOTS, type FeatureSlot, type IdFeatureLike } from '../../src/lib/core/types';

function feature(
  slot: FeatureSlot,
  fragment: Record<string, unknown>,
  refs: IdFeatureLike['refs'] = () => ({}),
  options: Record<string, unknown> = {},
  resolvedId = 'id',
): IdFeatureLike {
  return {
    slot,
    fragment: () => fragment,
    options: () => options,
    refs,
    resolvedId: () => resolvedId,
  };
}

describe('assembleOption', () => {
  it('groups features by slot into index-addressed arrays', () => {
    const xAxis = feature('xAxis', { type: 'value' });
    const series = feature('series', { type: 'line' });

    const result = assembleOption([xAxis, series], {}, ARRAY_SLOTS);

    expect(result['xAxis']).toEqual([{ id: 'id', type: 'value' }]);
    expect(result['series']).toEqual([{ id: 'id', type: 'line' }]);
  });

  it('places base option items before template items in the same slot', () => {
    const series = feature('series', { type: 'line' }, undefined, undefined, 'tpl-0');

    const result = assembleOption(
      [series],
      { series: [{ type: 'bar', id: 'base-0' }] },
      ARRAY_SLOTS,
    );

    expect(result['series']).toEqual([
      { type: 'bar', id: 'base-0' },
      { id: 'tpl-0', type: 'line' },
    ]);
  });

  it('lets typed fragment fields override the options bag', () => {
    const series = feature('series', { smooth: true }, () => ({}), { smooth: false });

    const result = assembleOption([series], {}, ARRAY_SLOTS);

    expect((result['series'] as { smooth: boolean }[])[0].smooth).toBe(true);
  });

  it('resolves a feature ref to the target feature stable id', () => {
    const xAxis = feature('xAxis', { type: 'value' }, undefined, undefined, 'x-0');
    const series = feature('series', { type: 'line' }, () => ({ xAxis }), undefined, 'series-0');

    const result = assembleOption([xAxis, series], {}, ARRAY_SLOTS);

    expect((result['series'] as { xAxisId: string }[])[0].xAxisId).toBe('x-0');
  });

  it('resolves a string ref directly as the target id, without calling resolvedId', () => {
    const series = feature('series', { type: 'line' }, () => ({ xAxis: 'external-axis' }));

    const result = assembleOption([series], {}, ARRAY_SLOTS);

    expect((result['series'] as { xAxisId: string }[])[0].xAxisId).toBe('external-axis');
  });

  it('omits a ref key entirely when the ref target is undefined', () => {
    const series = feature('series', { type: 'line' }, () => ({ xAxis: undefined }));

    const result = assembleOption([series], {}, ARRAY_SLOTS);

    expect((result['series'] as { xAxisId?: string }[])[0].xAxisId).toBeUndefined();
  });

  it('preserves non-array-slot keys from base options untouched', () => {
    const result = assembleOption([], { tooltip: { show: true } }, []);

    expect(result['tooltip']).toEqual({ show: true });
  });

  it('omits a slot entirely when it has no base items, no features, and was never managed', () => {
    const result = assembleOption([], {}, []);

    expect(result['grid']).toBeUndefined();
    expect(result['xAxis']).toBeUndefined();
    expect(result['yAxis']).toBeUndefined();
    expect(result['series']).toBeUndefined();
  });

  it('emits an empty array for a previously-managed slot that is now empty, so replaceMerge clears it', () => {
    const result = assembleOption([], {}, ['series']);

    expect(result['series']).toEqual([]);
    expect(result['grid']).toBeUndefined();
  });
});
