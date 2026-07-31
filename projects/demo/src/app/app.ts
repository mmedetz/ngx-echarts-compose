import { Component, signal } from '@angular/core';
import {
  EcBarSeriesDirective,
  EcCanvasDirective,
  EcChartDirective,
  EcLineSeriesDirective,
  EcValueXAxisDirective,
  EcValueYAxisDirective,
} from 'ngx-echarts-compose';

@Component({
  selector: 'app-root',
  imports: [
    EcChartDirective,
    EcCanvasDirective,
    EcValueXAxisDirective,
    EcValueYAxisDirective,
    EcLineSeriesDirective,
    EcBarSeriesDirective,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // Value/value axes expect [x, y] pairs — a flat array would be plotted as [v, v].
  protected readonly lineData = signal([
    [0, 12],
    [1, 19],
    [2, 8],
    [3, 24],
    [4, 17],
  ]);
  protected readonly barData = signal([
    [0, 5],
    [1, 14],
    [2, 9],
    [3, 11],
    [4, 6],
  ]);
}
