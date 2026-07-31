import * as echarts from 'echarts/core';

export function useChartModules(modules: Parameters<typeof echarts.use>[0]): void {
  echarts.use(modules);
}
