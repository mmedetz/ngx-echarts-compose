import { Directive } from '@angular/core';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
import { useChartModules } from './use-chart-modules';

@Directive({ selector: '[ecCanvas]', exportAs: 'ecCanvas' })
export class EcCanvasDirective {
  readonly renderer = 'canvas' as const;

  constructor() {
    useChartModules(CanvasRenderer);
  }
}

@Directive({ selector: '[ecSvg]', exportAs: 'ecSvg' })
export class EcSvgDirective {
  readonly renderer = 'svg' as const;

  constructor() {
    useChartModules(SVGRenderer);
  }
}
