import { TestBed } from '@angular/core/testing';
import { App } from './app';

// This app mounts a real `ecCanvas` ECharts instance. jsdom has no canvas 2D context
// (`HTMLCanvasElement.getContext` is a stub without the native `canvas` package), so rendering
// and disposing the real chart here isn't viable — that path is covered by the library's own
// SVG-based integration/visual tests plus manual verification in an actual browser. This spec
// only checks that the component itself constructs.
describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
