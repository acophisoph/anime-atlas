import * as PIXI from 'pixi.js';
import type { Point, Cluster } from '../types';

export interface RendererConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  onHover: (id: number | null) => void;
  onClick: (id: number, kind: 'media' | 'person') => void;
}

interface VisualPoint extends Point {
  screenX: number;
  screenY: number;
}

const POINT_BASE_RADIUS = 4;
const POINT_HOVER_RADIUS = 8;
const MEDIA_COLOR  = 0x5b9cf6;
const PERSON_COLOR = 0xf97316;
const HOP_COLORS = [0xffd700, 0xff8c00, 0xff4500];
const DIM_ALPHA = 0.15;

export class AtlasRenderer {
  private app: PIXI.Application;
  private dotContainer: PIXI.ParticleContainer | null = null;
  private overlayContainer: PIXI.Container;
  private labelContainer: PIXI.Container;
  private pointSprites: Map<number, PIXI.Sprite> = new Map();
  private points: VisualPoint[] = [];
  private clusters: Cluster[] = [];

  // Spatial index (grid)
  private gridCells: Map<string, number[]> = new Map();
  private readonly GRID_SIZE = 50;

  // Camera state
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private isDragging = false;
  private dragStart = { x: 0, y: 0, camX: 0, camY: 0 };

  private mode: 'media' | 'people' = 'media';
  private neighborhoodMap: Map<number, number> = new Map();
  private selectedId: number | null = null;

  constructor(private cfg: RendererConfig) {
    this.app = new PIXI.Application({
      view: cfg.canvas,
      width: cfg.width,
      height: cfg.height,
      backgroundColor: 0x0a0a0f,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.overlayContainer = new PIXI.Container();
    this.labelContainer   = new PIXI.Container();

    this.app.stage.addChild(this.overlayContainer);
    this.app.stage.addChild(this.labelContainer);

    this.setupInteraction();
    this.app.ticker.add(() => this.render());
  }

  private setupInteraction() {
    const view = this.app.view as HTMLCanvasElement;

    view.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.91;
      const rect = view.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Zoom towards mouse
      const wx = (mx - this.cfg.width / 2) / this.zoom + this.camX;
      const wy = (my - this.cfg.height / 2) / this.zoom + this.camY;
      this.zoom = Math.min(50, Math.max(0.1, this.zoom * factor));
      this.camX = wx - (mx - this.cfg.width / 2) / this.zoom;
      this.camY = wy - (my - this.cfg.height / 2) / this.zoom;
    }, { passive: false });

    view.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY, camX: this.camX, camY: this.camY };
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.camX = this.dragStart.camX - (e.clientX - this.dragStart.x) / this.zoom;
        this.camY = this.dragStart.camY - (e.clientY - this.dragStart.y) / this.zoom;
        this.cfg.onHover(null);
        return;
      }
      const rect = view.getBoundingClientRect();
      const hovered = this.hitTest(e.clientX - rect.left, e.clientY - rect.top);
      this.cfg.onHover(hovered);
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isDragging) {
        const dx = Math.abs(e.clientX - this.dragStart.x);
        const dy = Math.abs(e.clientY - this.dragStart.y);
        this.isDragging = false;
        if (dx < 3 && dy < 3) {
          const rect = view.getBoundingClientRect();
          const id = this.hitTest(e.clientX - rect.left, e.clientY - rect.top);
          if (id !== null) {
            const pt = this.points.find(p => p.id === id);
            if (pt) this.cfg.onClick(id, pt.kind);
          }
        }
      }
    });

    // Touch support
    view.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        this.isDragging = true;
        this.dragStart = { x: t.clientX, y: t.clientY, camX: this.camX, camY: this.camY };
      }
    });
    view.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        this.camX = this.dragStart.camX - (t.clientX - this.dragStart.x) / this.zoom;
        this.camY = this.dragStart.camY - (t.clientY - this.dragStart.y) / this.zoom;
      }
    }, { passive: false });
    view.addEventListener('touchend', () => { this.isDragging = false; });
  }

  private worldToScreen(wx: number, wy: number): [number, number] {
    return [
      (wx - this.camX) * this.zoom + this.cfg.width / 2,
      (wy - this.camY) * this.zoom + this.cfg.height / 2,
    ];
  }

  private screenToWorld(sx: number, sy: number): [number, number] {
    return [
      (sx - this.cfg.width / 2) / this.zoom + this.camX,
      (sy - this.cfg.height / 2) / this.zoom + this.camY,
    ];
  }

  private hitTest(sx: number, sy: number): number | null {
    const [wx, wy] = this.screenToWorld(sx, sy);
    const cellRadius = Math.ceil(POINT_HOVER_RADIUS / this.zoom / (2 / this.GRID_SIZE));
    const cx0 = Math.floor((wx + 1) / 2 * this.GRID_SIZE) - cellRadius;
    const cy0 = Math.floor((wy + 1) / 2 * this.GRID_SIZE) - cellRadius;

    let closest: number | null = null;
    let closestDist = (POINT_HOVER_RADIUS * 2) ** 2 / this.zoom ** 2;

    for (let gx = cx0; gx <= cx0 + cellRadius * 2; gx++) {
      for (let gy = cy0; gy <= cy0 + cellRadius * 2; gy++) {
        const key = `${gx}:${gy}`;
        const cell = this.gridCells.get(key);
        if (!cell) continue;
        for (const idx of cell) {
          const p = this.points[idx];
          if (this.mode === 'media' && p.kind !== 'media') continue;
          if (this.mode === 'people' && p.kind !== 'person') continue;
          const dx = p.x - wx;
          const dy = p.y - wy;
          const d2 = dx * dx + dy * dy;
          if (d2 < closestDist) { closestDist = d2; closest = p.id; }
        }
      }
    }
    return closest;
  }

  setPoints(points: Point[], mode: 'media' | 'people') {
    this.mode = mode;
    this.points = points as VisualPoint[];
    this.buildSpatialIndex();
    this.rebuildSprites();
  }

  setClusters(clusters: Cluster[]) {
    this.clusters = clusters;
    this.rebuildLabels();
  }

  setNeighborhood(map: Map<number, number>) {
    this.neighborhoodMap = map;
  }

  setSelected(id: number | null) {
    this.selectedId = id;
  }

  resize(w: number, h: number) {
    this.cfg.width = w;
    this.cfg.height = h;
    this.app.renderer.resize(w, h);
  }

  focusOn(id: number) {
    const pt = this.points.find(p => p.id === id);
    if (pt) {
      this.camX = pt.x;
      this.camY = pt.y;
      this.zoom = Math.max(this.zoom, 5);
    }
  }

  private buildSpatialIndex() {
    this.gridCells.clear();
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const gx = Math.floor((p.x + 1) / 2 * this.GRID_SIZE);
      const gy = Math.floor((p.y + 1) / 2 * this.GRID_SIZE);
      const key = `${gx}:${gy}`;
      if (!this.gridCells.has(key)) this.gridCells.set(key, []);
      this.gridCells.get(key)!.push(i);
    }
  }

  private rebuildSprites() {
    if (this.dotContainer) {
      this.app.stage.removeChild(this.dotContainer);
    }
    this.dotContainer = new PIXI.ParticleContainer(this.points.length, {
      vertices: true, position: true, tint: true, alpha: true,
    });
    this.pointSprites.clear();

    // Create a simple circle texture
    const gfx = new PIXI.Graphics();
    gfx.beginFill(0xffffff);
    gfx.drawCircle(0, 0, 8);
    gfx.endFill();
    const texture = this.app.renderer.generateTexture(gfx);

    for (const p of this.points) {
      if (this.mode === 'media' && p.kind !== 'media') continue;
      if (this.mode === 'people' && p.kind !== 'person') continue;

      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.tint = p.colorRGB || (p.kind === 'media' ? MEDIA_COLOR : PERSON_COLOR);
      this.dotContainer.addChild(sprite);
      this.pointSprites.set(p.id, sprite);
    }

    this.app.stage.addChildAt(this.dotContainer, 0);
  }

  private rebuildLabels() {
    this.labelContainer.removeChildren();
    for (const cl of this.clusters) {
      const text = new PIXI.Text(cl.label, {
        fontSize: 12,
        fill: 0xaaaacc,
        align: 'center',
      });
      text.anchor.set(0.5);
      (text as any).__clusterX = cl.x;
      (text as any).__clusterY = cl.y;
      this.labelContainer.addChild(text);
    }
  }

  private render() {
    const hasNeighborhood = this.neighborhoodMap.size > 0;

    for (const [id, sprite] of this.pointSprites) {
      const pt = this.points.find(p => p.id === id);
      if (!pt) continue;

      const [sx, sy] = this.worldToScreen(pt.x, pt.y);
      sprite.x = sx;
      sprite.y = sy;

      const radius = (id === this.selectedId ? POINT_HOVER_RADIUS : POINT_BASE_RADIUS) / this.zoom;
      sprite.scale.set(radius / 8);

      if (hasNeighborhood) {
        const hop = this.neighborhoodMap.get(id);
        if (id === this.selectedId) {
          sprite.tint = 0xffffff;
          sprite.alpha = 1;
        } else if (hop !== undefined) {
          sprite.tint = HOP_COLORS[hop - 1] ?? HOP_COLORS[2];
          sprite.alpha = 1;
        } else {
          sprite.alpha = DIM_ALPHA;
        }
      } else {
        sprite.tint = pt.colorRGB || (pt.kind === 'media' ? MEDIA_COLOR : PERSON_COLOR);
        sprite.alpha = 1;
      }
    }

    // Update cluster labels
    const minZoomForLabels = 0.5;
    this.labelContainer.visible = this.zoom >= minZoomForLabels;
    for (const child of this.labelContainer.children) {
      const text = child as PIXI.Text;
      const wx = (text as any).__clusterX as number;
      const wy = (text as any).__clusterY as number;
      const [sx, sy] = this.worldToScreen(wx, wy);
      text.x = sx;
      text.y = sy;
    }
  }

  destroy() {
    this.app.destroy(false, { children: true });
  }
}
