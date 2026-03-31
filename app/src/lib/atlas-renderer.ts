import * as PIXI from 'pixi.js';
import type { Point, Cluster } from '../types';

export interface RendererConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  onHover: (id: number | null) => void;
  onClick: (id: number, kind: 'media' | 'person') => void;
}

export interface EdgeData {
  fromId: number;
  toId: number;
  hop: number;
}

// Genre → color palette
const GENRE_COLORS: Record<string, number> = {
  'Action':        0xef4444,
  'Adventure':     0xf97316,
  'Comedy':        0xeab308,
  'Drama':         0x22c55e,
  'Fantasy':       0xa855f7,
  'Romance':       0xec4899,
  'Sci-Fi':        0x06b6d4,
  'Mystery':       0x6366f1,
  'Horror':        0xdc2626,
  'Slice of Life': 0x84cc16,
  'Sports':        0x14b8a6,
  'Supernatural':  0x8b5cf6,
  'Music':         0xf59e0b,
  'Psychological': 0x94a3b8,
  'Mecha':         0x0ea5e9,
  'Ecchi':         0xf472b6,
  'Mahou Shoujo':  0xe879f9,
  'Harem':         0xfbbf24,
  'Thriller':      0x475569,
};
const DEFAULT_MEDIA_COLOR  = 0x5b9cf6;
const DEFAULT_PERSON_COLOR = 0xf97316;
const HOP_COLORS  = [0xfbbf24, 0xfb923c, 0xf87171];
const EDGE_COLORS = [0xfbbf24, 0xfb923c, 0xf87171];
const DIM_ALPHA   = 0.08;

// Shared circle texture (white; tinted per node)
let sharedTex: PIXI.Texture | null = null;
function getCircleTexture(app: PIXI.Application): PIXI.Texture {
  if (sharedTex) return sharedTex;
  const g = new PIXI.Graphics();
  // Draw a crisp white circle with slight feathered edge for anti-aliasing
  g.beginFill(0xffffff, 1);
  g.drawCircle(0, 0, 16);
  g.endFill();
  sharedTex = app.renderer.generateTexture(g, {
    resolution: Math.min(window.devicePixelRatio, 2),
  });
  return sharedTex;
}

interface SpritePoint extends Point {
  sprite: PIXI.Sprite;
  baseRadius: number; // CSS pixels at base zoom
  color: number;
}

// Spatial grid bucketed by data-space coordinates
interface GridBounds { minX: number; maxX: number; minY: number; maxY: number; }

export class AtlasRenderer {
  private app: PIXI.Application;
  private edgeGraphics: PIXI.Graphics;
  private dotContainer: PIXI.Container;
  private overlayGraphics: PIXI.Graphics;
  private labelContainer: PIXI.Container;

  private spritePoints: SpritePoint[] = [];
  private spriteMap = new Map<number, SpritePoint>();
  private clusters: Cluster[] = [];

  // Spatial grid for O(1) hit testing
  private gridCells = new Map<string, number[]>();
  private readonly GRID_DIVS = 64;
  private gridBounds: GridBounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 };

  // Camera (world space)
  camX = 0; camY = 0; zoom = 1;
  private isDragging = false;
  private dragStart = { x: 0, y: 0, camX: 0, camY: 0 };
  private hasMoved = false;

  private mode: 'media' | 'people' = 'media';
  private neighborhoodMap = new Map<number, number>();
  private selectedId: number | null = null;
  private hoveredId: number | null = null;
  private edges: EdgeData[] = [];
  private genreMap = new Map<number, string[]>();

  constructor(private cfg: RendererConfig) {
    this.app = new PIXI.Application({
      view: cfg.canvas,
      width: cfg.width,
      height: cfg.height,
      backgroundColor: 0x07070f,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    this.edgeGraphics    = new PIXI.Graphics();
    this.dotContainer    = new PIXI.Container();
    this.overlayGraphics = new PIXI.Graphics();
    this.labelContainer  = new PIXI.Container();

    this.app.stage.addChild(this.edgeGraphics);
    this.app.stage.addChild(this.dotContainer);
    this.app.stage.addChild(this.overlayGraphics);
    this.app.stage.addChild(this.labelContainer);

    this.setupInteraction();
    this.app.ticker.add(() => this.render());
  }

  private w() { return this.cfg.width; }
  private h() { return this.cfg.height; }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [
      (wx - this.camX) * this.zoom + this.w() / 2,
      (wy - this.camY) * this.zoom + this.h() / 2,
    ];
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [
      (sx - this.w() / 2) / this.zoom + this.camX,
      (sy - this.h() / 2) / this.zoom + this.camY,
    ];
  }

  private setupInteraction() {
    const view = this.app.view as HTMLCanvasElement;

    // Wheel zoom towards cursor
    view.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const rect = view.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const [wx, wy] = this.screenToWorld(mx, my);
      this.zoom = Math.min(500, Math.max(0.5, this.zoom * factor));
      this.camX = wx - (mx - this.w() / 2) / this.zoom;
      this.camY = wy - (my - this.h() / 2) / this.zoom;
    }, { passive: false });

    view.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.hasMoved   = false;
      this.dragStart  = { x: e.clientX, y: e.clientY, camX: this.camX, camY: this.camY };
    });

    window.addEventListener('mousemove', (e) => {
      const rect = view.getBoundingClientRect();
      if (!rect) return;

      if (this.isDragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.hasMoved = true;
        this.camX = this.dragStart.camX - dx / this.zoom;
        this.camY = this.dragStart.camY - dy / this.zoom;
        if (this.hoveredId !== null) { this.hoveredId = null; this.cfg.onHover(null); }
        return;
      }

      const inCanvas =
        rect.left <= e.clientX && e.clientX <= rect.right &&
        rect.top  <= e.clientY && e.clientY <= rect.bottom;

      if (inCanvas) {
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const newHover = this.hitTest(sx, sy);
        if (newHover !== this.hoveredId) {
          this.hoveredId = newHover;
          this.cfg.onHover(newHover);
        }
      } else if (this.hoveredId !== null) {
        this.hoveredId = null;
        this.cfg.onHover(null);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isDragging && !this.hasMoved) {
        const rect = view.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const id = this.hitTest(sx, sy);
        if (id !== null) {
          const sp = this.spriteMap.get(id);
          if (sp) this.cfg.onClick(id, sp.kind);
        }
      }
      this.isDragging = false;
    });

    // Touch pan
    view.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        this.isDragging = true; this.hasMoved = false;
        this.dragStart = { x: t.clientX, y: t.clientY, camX: this.camX, camY: this.camY };
      }
    }, { passive: true });

    view.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        this.hasMoved = true;
        this.camX = this.dragStart.camX - (t.clientX - this.dragStart.x) / this.zoom;
        this.camY = this.dragStart.camY - (t.clientY - this.dragStart.y) / this.zoom;
      }
    }, { passive: false });

    view.addEventListener('touchend', () => { this.isDragging = false; });
  }

  // Hit test: find nearest point within a 14-screen-pixel radius of (sx, sy).
  // hitRadius is in world units = 14px / zoom, so it is always exactly 14 CSS pixels
  // regardless of zoom level. This eliminates the old bug where Math.max(8, 12/zoom)
  // produced a hitRadius of 8 world units at high zoom (covering the entire dataset).
  private hitTest(sx: number, sy: number): number | null {
    const HIT_PX = 14;
    const hitRadius = HIT_PX / this.zoom; // world units
    const [wx, wy] = this.screenToWorld(sx, sy);

    const gb = this.gridBounds;
    const rangeX = (gb.maxX - gb.minX) || 1;
    const rangeY = (gb.maxY - gb.minY) || 1;
    const cellW = rangeX / this.GRID_DIVS;
    const cellH = rangeY / this.GRID_DIVS;

    const cellX0 = Math.floor((wx - gb.minX) / cellW);
    const cellY0 = Math.floor((wy - gb.minY) / cellH);
    const crX = Math.ceil(hitRadius / cellW) + 1;
    const crY = Math.ceil(hitRadius / cellH) + 1;

    let closest: number | null = null;
    let closestD2 = hitRadius * hitRadius;

    for (let gx = cellX0 - crX; gx <= cellX0 + crX; gx++) {
      for (let gy = cellY0 - crY; gy <= cellY0 + crY; gy++) {
        const cell = this.gridCells.get(`${gx}:${gy}`);
        if (!cell) continue;
        for (const idx of cell) {
          const sp = this.spritePoints[idx];
          if (this.mode === 'media'  && sp.kind !== 'media')  continue;
          if (this.mode === 'people' && sp.kind !== 'person') continue;
          const d2 = (sp.x - wx) ** 2 + (sp.y - wy) ** 2;
          if (d2 < closestD2) { closestD2 = d2; closest = sp.id; }
        }
      }
    }
    return closest;
  }

  private colorForPoint(p: Point): number {
    if (p.colorRGB) return p.colorRGB;
    if (p.kind === 'person') return DEFAULT_PERSON_COLOR;
    const genres = this.genreMap.get(p.id) ?? [];
    for (const g of genres) {
      if (GENRE_COLORS[g]) return GENRE_COLORS[g];
    }
    return DEFAULT_MEDIA_COLOR;
  }

  // Dot size: very small at overview to prevent occlusion.
  // Range: 1.3 (unknown) → 3.0 (mega-popular). Log scale on popularity.
  private radiusForPoint(p: Point): number {
    const pop = p.popularity || 0;
    return Math.max(1.3, Math.min(3.0, 0.7 + Math.log10(pop + 10) * 0.65));
  }

  setGenreMap(gm: Map<number, string[]>) {
    this.genreMap = gm;
  }

  setPoints(rawPoints: Point[], mode: 'media' | 'people') {
    this.mode = mode;
    this.dotContainer.removeChildren();
    this.spritePoints = [];
    this.spriteMap.clear();
    this.gridCells.clear();

    const visible = rawPoints.filter(p =>
      mode === 'media' ? p.kind === 'media' : p.kind === 'person'
    );
    if (visible.length === 0) return;

    // Compute data bounds for the spatial grid
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of visible) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    this.gridBounds = { minX, maxX, minY, maxY };

    const tex = getCircleTexture(this.app);
    const rangeX = (maxX - minX) || 1;
    const rangeY = (maxY - minY) || 1;

    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      const color  = this.colorForPoint(p);
      const radius = this.radiusForPoint(p);

      const sprite = new PIXI.Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.tint  = color;
      sprite.alpha = 0.82;
      sprite.scale.set(radius / 16);

      const sp: SpritePoint = { ...p, sprite, baseRadius: radius, color };
      this.spritePoints.push(sp);
      this.spriteMap.set(p.id, sp);
      this.dotContainer.addChild(sprite);

      // Index into spatial grid using actual data bounds
      const gx = Math.floor(((p.x - minX) / rangeX) * this.GRID_DIVS);
      const gy = Math.floor(((p.y - minY) / rangeY) * this.GRID_DIVS);
      const key = `${Math.min(gx, this.GRID_DIVS - 1)}:${Math.min(gy, this.GRID_DIVS - 1)}`;
      if (!this.gridCells.has(key)) this.gridCells.set(key, []);
      this.gridCells.get(key)!.push(i);
    }

    this.autoFit(visible);
  }

  autoFit(points: Point[] = this.spritePoints) {
    if (points.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const rangeX = (maxX - minX) || 1;
    const rangeY = (maxY - minY) || 1;
    // 14% padding so edge nodes aren't cut off
    const PAD = 0.14;
    this.camX = (minX + maxX) / 2;
    this.camY = (minY + maxY) / 2;
    this.zoom = Math.min(
      this.w() / (rangeX * (1 + PAD * 2)),
      this.h() / (rangeY * (1 + PAD * 2)),
    );
  }

  setClusters(clusters: Cluster[]) {
    this.clusters = clusters;
    this.labelContainer.removeChildren();
    for (const cl of clusters) {
      const container = new PIXI.Container();

      const text = new PIXI.Text(cl.label, {
        fontSize: 11,
        fontWeight: '700',
        fill: 0xffffff,
        align: 'center',
        letterSpacing: 0.5,
      });
      text.anchor.set(0.5);

      // Pill background
      const pad = { x: 9, y: 4 };
      const bg = new PIXI.Graphics();
      bg.beginFill(0x080818, 0.78);
      bg.lineStyle(1, 0xffffff, 0.12);
      bg.drawRoundedRect(
        -text.width / 2 - pad.x,
        -text.height / 2 - pad.y,
        text.width + pad.x * 2,
        text.height + pad.y * 2,
        5,
      );
      bg.endFill();

      container.addChild(bg);
      container.addChild(text);

      (container as any).__wx   = cl.x;
      (container as any).__wy   = cl.y;
      (container as any).__size = cl.size;
      this.labelContainer.addChild(container);
    }
  }

  setNeighborhood(map: Map<number, number>) { this.neighborhoodMap = map; }
  setSelected(id: number | null)            { this.selectedId = id; }
  setEdges(edges: EdgeData[])               { this.edges = edges; }

  focusOn(id: number) {
    const sp = this.spriteMap.get(id);
    if (!sp) return;
    this.camX = sp.x;
    this.camY = sp.y;
    this.zoom = Math.max(this.zoom, 40);
  }

  resize(w: number, h: number) {
    this.cfg.width  = w;
    this.cfg.height = h;
    this.app.renderer.resize(w, h);
  }

  private render() {
    const hasNeighbors = this.neighborhoodMap.size > 0;

    // ── Edge lines ─────────────────────────────────────────────────────────
    this.edgeGraphics.clear();
    if (hasNeighbors && this.edges.length > 0) {
      const selectedSp = this.selectedId != null ? this.spriteMap.get(this.selectedId) : null;
      for (const edge of this.edges) {
        const from = this.spriteMap.get(edge.fromId) ?? selectedSp;
        const to   = this.spriteMap.get(edge.toId);
        if (!from || !to) continue;
        const [sx1, sy1] = this.worldToScreen(from.x, from.y);
        const [sx2, sy2] = this.worldToScreen(to.x,   to.y);
        const color = EDGE_COLORS[Math.min(edge.hop - 1, 2)];
        const alpha = Math.max(0.04, 0.35 - (edge.hop - 1) * 0.1);
        this.edgeGraphics.lineStyle(Math.max(0.4, 1.2 / this.zoom), color, alpha);
        this.edgeGraphics.moveTo(sx1, sy1);
        this.edgeGraphics.lineTo(sx2, sy2);
      }
    }

    // ── Sprites ────────────────────────────────────────────────────────────
    const margin = 24;
    const W = this.w(), H = this.h();

    for (const sp of this.spritePoints) {
      const [sx, sy] = this.worldToScreen(sp.x, sp.y);
      sp.sprite.x = sx;
      sp.sprite.y = sy;

      const offScreen = sx < -margin || sx > W + margin ||
                        sy < -margin || sy > H + margin;
      sp.sprite.visible = !offScreen;
      if (offScreen) continue;

      // Screen-space radius: constant until zoom > threshold, then grows.
      // This keeps overview clean and makes close-up navigation comfortable.
      const ZOOM_THRESHOLD = 20;
      const zoomFactor = this.zoom < ZOOM_THRESHOLD
        ? 1
        : Math.min(3.5, this.zoom / ZOOM_THRESHOLD);
      const screenR = Math.max(1.0, sp.baseRadius * zoomFactor);
      sp.sprite.scale.set(screenR / 16);

      // Color + alpha based on state
      if (sp.id === this.selectedId) {
        sp.sprite.tint  = 0xffffff;
        sp.sprite.alpha = 1;
      } else if (sp.id === this.hoveredId) {
        sp.sprite.tint  = 0xffffff;
        sp.sprite.alpha = 1;
      } else if (hasNeighbors) {
        const hop = this.neighborhoodMap.get(sp.id);
        if (hop !== undefined) {
          sp.sprite.tint  = HOP_COLORS[Math.min(hop - 1, 2)];
          sp.sprite.alpha = 1;
        } else {
          sp.sprite.tint  = sp.color;
          sp.sprite.alpha = DIM_ALPHA;
        }
      } else {
        sp.sprite.tint  = sp.color;
        sp.sprite.alpha = 0.82;
      }
    }

    // ── Overlay: selected ring + hovered ring ──────────────────────────────
    this.overlayGraphics.clear();

    if (this.hoveredId !== null && this.hoveredId !== this.selectedId) {
      const sp = this.spriteMap.get(this.hoveredId);
      if (sp) {
        const [sx, sy] = this.worldToScreen(sp.x, sp.y);
        const ZOOM_THRESHOLD = 20;
        const zoomFactor = this.zoom < ZOOM_THRESHOLD ? 1 : Math.min(3.5, this.zoom / ZOOM_THRESHOLD);
        const screenR = Math.max(1.0, sp.baseRadius * zoomFactor);
        // Subtle hover ring
        this.overlayGraphics.lineStyle(1.5, 0xffffff, 0.5);
        this.overlayGraphics.drawCircle(sx, sy, screenR + 2.5);
      }
    }

    if (this.selectedId !== null) {
      const sp = this.spriteMap.get(this.selectedId);
      if (sp) {
        const [sx, sy] = this.worldToScreen(sp.x, sp.y);
        const ZOOM_THRESHOLD = 20;
        const zoomFactor = this.zoom < ZOOM_THRESHOLD ? 1 : Math.min(3.5, this.zoom / ZOOM_THRESHOLD);
        const screenR = Math.max(1.0, sp.baseRadius * zoomFactor);
        // Bright selection ring + soft glow
        this.overlayGraphics.lineStyle(2, 0xffffff, 1.0);
        this.overlayGraphics.drawCircle(sx, sy, screenR + 3);
        this.overlayGraphics.lineStyle(5, 0xffffff, 0.18);
        this.overlayGraphics.drawCircle(sx, sy, screenR + 6);
      }
    }

    // ── Cluster labels ─────────────────────────────────────────────────────
    // Visible only while zoomed out; fade as you zoom in
    const LABEL_FADE_START = 3;   // zoom below this → fully visible
    const LABEL_FADE_END   = 25;  // zoom above this → hidden
    const labelAlpha = Math.max(0, Math.min(1,
      1 - (this.zoom - LABEL_FADE_START) / (LABEL_FADE_END - LABEL_FADE_START)
    ));
    this.labelContainer.alpha = labelAlpha;

    for (const child of this.labelContainer.children) {
      const wx = (child as any).__wx as number;
      const wy = (child as any).__wy as number;
      const [sx, sy] = this.worldToScreen(wx, wy);
      child.x = sx;
      child.y = sy;
      // Subtle scale with zoom so labels don't get too large/small
      const lz = Math.max(0.75, Math.min(1.3, this.zoom / 5));
      child.scale.set(lz);
    }
  }

  destroy() {
    sharedTex = null;
    this.app.destroy(false, { children: true });
  }
}
