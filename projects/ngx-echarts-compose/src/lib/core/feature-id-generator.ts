import { Injectable } from '@angular/core';

/**
 * Hands out unique auto ids for `IdFeature`s that don't have an explicit `[id]`. Provided once per
 * `<ec-chart>` (see `EcChartDirective.providers`), so generated ids only need to be unique within
 * a single chart's option, not globally.
 */
@Injectable()
export class FeatureIdGenerator {
  private next = 0;

  generate(): string {
    return `__ec_${this.next++}`;
  }
}
