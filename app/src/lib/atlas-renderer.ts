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

// ─── Colour palette ────────────────────────────────────────────────────────
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
const DIM_ALPHA   = 0.06;

// ─── Node size model (Nomic-style) ─────────────────────────────────────────
//
// Key insight: nodes must be a FIXED SCREEN-SPACE SIZE — they don't grow with
// absolute zoom. Instead the WORLD grows (√n × 5 scale), so zooming in
// reveals gaps between nodes rather than making existing nodes bigger.
//
// screenRadius = base × clamp(1, MAX_GROW, relativeZoom ^ GROW_EXP)
//
// where relativeZoom = zoom / autoFitZoom (1.0 at overview, >1 when zoomed in)
//
// At overview (relativeZoom=1):  base × 1   = 1.8–4.0 px  — tiny dots
// At 16× overview:               base × 2.0             — still small
// At 256× overview:              base × 4.0             — comfortably clickable
//
// GROW_EXP = 0.4 → very slow √-curve growth. Nodes feel "stable" while the
// canvas expands around them.
const GROW_EXP = 0.4;
const MAX_GROW = 5;

// Popularity-weighted base radius. Popular shows are ever-so-slightly larger.
function baseRadius(pop: number): number {
  return Math.max(1.8, Math.min(4.0, 0.8 + Math.log10(pop + 10) * 0.7));
}

// The computed screen-space radius given the current relative zoom level.
function screenR(base: number, relZoom: number): number {
  const t = Math.min(MAX_GROW, Math.pow(Math.max(1, relZoom), GROW_EXP));
  return Math.max(1.5, base * t);
}

// ─── Shared circle texture ──────────────────────────────────────────────────
let sharedTex: PIXI.Texture | null = null;
function getCircleTexture(app: PIXI.Application): PIXI.Texture {
  if (sharedTex) return sharedTex;
  const g = new PIXI.Graphics();
  g.beginFill(0xffffff, 1.0);
  g.drawCircle(0, 0, 16);
  g.endFill();
  sharedTex = app.renderer.generateTexture(g, {
    resolution: Math.min(window.devicePixelRatio, 2),
  });
  return sharedTex;
}

interface SpritePoint extends Point {
  sprite: PIXI.Sprite;
  base: number;   // base radius in CSS px
  color: number;
}

interface Bounds { minX: number; maxX: number; minY: number; maxY: number; }

export class AtlasRenderer {
  private app: PIXI.Application;
  private edgeGfx:    PIXI.Graphics;
  private dotCtr:     PIXI.Container;
  private overlayGfx: PIXI.Graphics;
  private labelCtr:   PIXI.Container;

  private pts: SpritePoint[] = [];
  private ptMap = new Map<number, SpritePoint>();
  private clusters: Cluster[] = [];

  // Spatial grid (128 divisions for large worlds)
  private grid = new Map<string, number[]>();
  private readonly DIVS = 128;
  private bounds: Bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 };

  // Camera state
  camX = 0; camY = 0; zoom = 1;
  private autoFitZoom = 1;   // stored on autoFit — used for relative zoom calc

  private drag = false;
  private dragStart = { x: 0, y: 0, cx: 0, cy: 0 };
  private moved    = false;

  private mode: 'media' | 'people' = 'media';
  private nbMap  = new Map<number, number>();
  // Cached result of "does nbMap intersect ptMap?".  Recomputed only when
  // nbMap or ptMap changes (not every frame) so the render loop stays O(1).
  private _hasVisibleNb = false;
  private selId: number | null = null;
  private hovId: number | null = null;
  private edges: EdgeData[] = [];
  private genreMap = new Map<number, string[]>();

  constructor(private cfg: RendererConfig) {
    this.app = new PIXI.Application({
      view:            cfg.canvas,
      width:           cfg.width,
      height:          cfg.height,
      backgroundColor: 0x07070f,
      antialias:       true,
      resolution:      Math.min(window.devicePixelRatio || 1, 2),
      autoDensity:     true,
    });

    this.edgeGfx    = new PIXI.Graphics();
    this.dotCtr     = new PIXI.Container();
    this.overlayGfx = new PIXI.Graphics();
    this.labelCtr   = new PIXI.Container();

    this.app.stage.addChild(this.edgeGfx);
    this.app.stage.addChild(this.dotCtr);
    this.app.stage.addChild(this.overlayGfx);
    this.app.stage.addChild(this.labelCtr);

    this.setupInput();
    this.app.ticker.add(() => this.render());
  }

  private W() { return this.cfg.width; }
  private H() { return this.cfg.height; }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [
      (wx - this.camX) * this.zoom + this.W() / 2,
      (wy - this.camY) * this.zoom + this.H() / 2,
    ];
  }

  private s2w(sx: number, sy: number): [number, number] {
    return [
      (sx - this.W() / 2) / this.zoom + this.camX,
      (sy - this.H() / 2) / this.zoom + this.camY,
    ];
  }

  private setupInput() {
    const v = this.app.view as HTMLCanvasElement;

    // Wheel zoom — anchor at cursor
    v.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f    = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = v.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const [wx, wy] = this.s2w(mx, my);
      // Very wide zoom range — from full overview to deep individual inspection
      this.zoom = Math.min(500_000, Math.max(0.0001, this.zoom * f));
      this.camX = wx - (mx - this.W() / 2) / this.zoom;
      this.camY = wy - (my - this.H() / 2) / this.zoom;
    }, { passive: false });

    v.addEventListener('mousedown', (e) => {
      this.drag = true; this.moved = false;
      this.dragStart = { x: e.clientX, y: e.clientY, cx: this.camX, cy: this.camY };
    });

    window.addEventListener('mousemove', (e) => {
      const rect = v.getBoundingClientRect();
      if (this.drag) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
        this.camX = this.dragStart.cx - dx / this.zoom;
        this.camY = this.dragStart.cy - dy / this.zoom;
        if (this.hovId !== null) { this.hovId = null; this.cfg.onHover(null); }
        return;
      }
      const inCanvas =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top  && e.clientY <= rect.bottom;
      if (inCanvas) {
        const id = this.hitTest(e.clientX - rect.left, e.clientY - rect.top);
        if (id !== this.hovId) { this.hovId = id; this.cfg.onHover(id); }
      } else if (this.hovId !== null) {
        this.hovId = null; this.cfg.onHover(null);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.drag && !this.moved) {
        const rect = v.getBoundingClientRect();
        const id = this.hitTest(e.clientX - rect.left, e.clientY - rect.top);
        if (id !== null) {
          const sp = this.ptMap.get(id);
          if (sp) this.cfg.onClick(id, sp.kind);
        }
      }
      this.drag = false;
    });

    // Touch
    v.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      this.drag = true; this.moved = false;
      this.dragStart = { x: t.clientX, y: t.clientY, cx: this.camX, cy: this.camY };
    }, { passive: true });

    v.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      this.moved = true;
      this.camX = this.dragStart.cx - (t.clientX - this.dragStart.x) / this.zoom;
      this.camY = this.dragStart.cy - (t.clientY - this.dragStart.y) / this.zoom;
    }, { passive: false });

    v.addEventListener('touchend', () => { this.drag = false; });
  }

  // Hit test: always exactly HIT_PX screen pixels of pickup radius.
  private hitTest(sx: number, sy: number): number | null {
    const HIT_PX = 16;
    const hr = HIT_PX / this.zoom;           // world-space radius
    const [wx, wy] = this.s2w(sx, sy);
    const b = this.bounds;
    const cw = ((b.maxX - b.minX) || 1) / this.DIVS;
    const ch = ((b.maxY - b.minY) || 1) / this.DIVS;
    const cx0 = Math.floor((wx - b.minX) / cw);
    const cy0 = Math.floor((wy - b.minY) / ch);
    const rx  = Math.ceil(hr / cw) + 1;
    const ry  = Math.ceil(hr / ch) + 1;

    let best: number | null = null;
    let bestD2 = hr * hr;

    for (let gx = cx0 - rx; gx <= cx0 + rx; gx++) {
      for (let gy = cy0 - ry; gy <= cy0 + ry; gy++) {
        const cell = this.grid.get(`${gx}:${gy}`);
        if (!cell) continue;
        for (const idx of cell) {
          const sp = this.pts[idx];
          if (this.mode === 'media'  && sp.kind !== 'media')  continue;
          if (this.mode === 'people' && sp.kind !== 'person') continue;
          const d2 = (sp.x - wx) ** 2 + (sp.y - wy) ** 2;
          if (d2 < bestD2) { bestD2 = d2; best = sp.id; }
        }
      }
    }
    return best;
  }

  private colorFor(p: Point): number {
    if (p.colorRGB) return p.colorRGB;
    if (p.kind === 'person') return DEFAULT_PERSON_COLOR;
    const genres = this.genreMap.get(p.id) ?? [];
    for (const g of genres) if (GENRE_COLORS[g]) return GENRE_COLORS[g];
    return DEFAULT_MEDIA_COLOR;
  }

  setGenreMap(gm: Map<number, string[]>) { this.genreMap = gm; }

  // fitCamera: true when switching modes (reset camera to show all points),
  // false when applying filters (keep current camera position).
  setPoints(raw: Point[], mode: 'media' | 'people', fitCamera = true) {
    const vis = raw.filter(p =>
      mode === 'media' ? p.kind === 'media' : p.kind === 'person'
    );

    // If the new mode has no visible points, don't wipe the current sprites.
    // The empty-state overlay in AtlasCanvas handles the UI; the canvas keeps
    // its last content so there's no jarring black flash on mode switch.
    if (!vis.length) {
      this.mode = mode;
      return;
    }

    // On a genuine mode switch (fitCamera=true), flush any selection /
    // neighborhood state that was set for the previous mode.  Without this,
    // a media selection with a large neighbourhood would bleed into People mode
    // and dim every single person sprite to DIM_ALPHA (≈ invisible / "black").
    if (fitCamera) {
      this.selId = null;
      this.hovId = null;
      this.nbMap = new Map();
      this._hasVisibleNb = false;
      this.edges = [];
    }

    this.mode = mode;
    this.dotCtr.removeChildren();
    this.pts   = [];
    this.ptMap.clear();
    this.grid.clear();

    // Data bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of vis) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    this.bounds = { minX, maxX, minY, maxY };

    const tex   = getCircleTexture(this.app);
    const rangeX = (maxX - minX) || 1;
    const rangeY = (maxY - minY) || 1;

    for (let i = 0; i < vis.length; i++) {
      const p    = vis[i];
      const col  = this.colorFor(p);
      const base = baseRadius(p.popularity || 0);

      const sprite = new PIXI.Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.tint  = col;
      sprite.alpha = 0.8;
      sprite.scale.set(base / 16);   // will be updated each frame

      const sp: SpritePoint = { ...p, sprite, base, color: col };
      this.pts.push(sp);
      this.ptMap.set(p.id, sp);
      this.dotCtr.addChild(sprite);

      // Index in spatial grid
      const gx  = Math.min(this.DIVS - 1, Math.floor(((p.x - minX) / rangeX) * this.DIVS));
      const gy  = Math.min(this.DIVS - 1, Math.floor(((p.y - minY) / rangeY) * this.DIVS));
      const key = `${gx}:${gy}`;
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key)!.push(i);
    }

    // Recompute neighbourhood-visibility cache now that ptMap is fully built.
    this._hasVisibleNb = this.nbMap.size > 0 && [...this.nbMap.keys()].some(id => this.ptMap.has(id));

    if (fitCamera) this.autoFit(vis);
  }

  autoFit(points: Point[] = this.pts) {
    if (!points.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const PAD  = 0.10;
    const rx   = (maxX - minX) || 1;
    const ry   = (maxY - minY) || 1;
    this.camX  = (minX + maxX) / 2;
    this.camY  = (minY + maxY) / 2;
    this.zoom  = Math.min(
      this.W() / (rx * (1 + PAD * 2)),
      this.H() / (ry * (1 + PAD * 2)),
    );
    // Store so the per-frame screenR calculation can express zoom relative to overview
    this.autoFitZoom = this.zoom;
  }

  setClusters(clusters: Cluster[]) {
    this.clusters = clusters;
    this.labelCtr.removeChildren();
    for (const cl of clusters) {
      const ctr  = new PIXI.Container();
      const text = new PIXI.Text(cl.label, {
        fontSize: 11, fontWeight: '700', fill: 0xffffff,
        align: 'center', letterSpacing: 0.5,
      });
      text.anchor.set(0.5);

      const px = 9, py = 4;
      const bg = new PIXI.Graphics();
      bg.beginFill(0x050510, 0.82);
      bg.lineStyle(1, 0xffffff, 0.15);
      bg.drawRoundedRect(-text.width / 2 - px, -text.height / 2 - py,
        text.width + px * 2, text.height + py * 2, 5);
      bg.endFill();

      ctr.addChild(bg);
      ctr.addChild(text);
      (ctr as any).__wx   = cl.x;
      (ctr as any).__wy   = cl.y;
      (ctr as any).__size = cl.size;
      this.labelCtr.addChild(ctr);
    }
  }

  setNeighborhood(m: Map<number, number>) {
    this.nbMap = m;
    this._hasVisibleNb = m.size > 0 && [...m.keys()].some(id => this.ptMap.has(id));
  }
  setSelected(id: number | null)          { this.selId  = id; }
  setEdges(e: EdgeData[])                 { this.edges  = e; }

  focusOn(id: number) {
    const sp = this.ptMap.get(id);
    if (!sp) return;
    this.camX = sp.x;
    this.camY = sp.y;
    this.zoom = this.autoFitZoom * 40;   // 40× overview → cluster-level view
  }

  resize(w: number, h: number) {
    this.cfg.width = w; this.cfg.height = h;
    this.app.renderer.resize(w, h);
  }

  private render() {
    // _hasVisibleNb is pre-computed in setNeighborhood / setPoints so this is O(1).
    const hasNb = this._hasVisibleNb;
    const W = this.W(), H = this.H();
    // Relative zoom: how many times we've zoomed in vs the full overview.
    const relZ = this.zoom / (this.autoFitZoom || 1);

    // ── Edges ──────────────────────────────────────────────────────────────
    this.edgeGfx.clear();
    if (hasNb && this.edges.length) {
      const selSp = this.selId != null ? this.ptMap.get(this.selId) : null;
      for (const e of this.edges) {
        const from = this.ptMap.get(e.fromId) ?? selSp;
        const to   = this.ptMap.get(e.toId);
        if (!from || !to) continue;
        const [x1, y1] = this.worldToScreen(from.x, from.y);
        const [x2, y2] = this.worldToScreen(to.x,   to.y);
        const col  = EDGE_COLORS[Math.min(e.hop - 1, 2)];
        const alp  = Math.max(0.04, 0.38 - (e.hop - 1) * 0.1);
        this.edgeGfx.lineStyle(Math.max(0.5, 1.5 / this.zoom), col, alp);
        this.edgeGfx.moveTo(x1, y1);
        this.edgeGfx.lineTo(x2, y2);
      }
    }

    // ── Sprites ────────────────────────────────────────────────────────────
    const MARGIN = 20;
    for (const sp of this.pts) {
      const [sx, sy] = this.worldToScreen(sp.x, sp.y);
      sp.sprite.x = sx;
      sp.sprite.y = sy;

      if (sx < -MARGIN || sx > W + MARGIN || sy < -MARGIN || sy > H + MARGIN) {
        sp.sprite.visible = false; continue;
      }
      sp.sprite.visible = true;

      // Screen-space radius: tiny at overview (relZ≈1), grows slowly via
      // power curve so it never gets huge. At relZ=100 it's only ~2.5× base.
      const r = screenR(sp.base, relZ);
      sp.sprite.scale.set(r / 16);

      // Colour / alpha state
      if (sp.id === this.selId) {
        sp.sprite.tint = 0xffffff; sp.sprite.alpha = 1;
      } else if (sp.id === this.hovId) {
        sp.sprite.tint = 0xffffff; sp.sprite.alpha = 1;
      } else if (hasNb) {
        const hop = this.nbMap.get(sp.id);
        if (hop !== undefined) {
          sp.sprite.tint = HOP_COLORS[Math.min(hop - 1, 2)]; sp.sprite.alpha = 1;
        } else {
          sp.sprite.tint = sp.color; sp.sprite.alpha = DIM_ALPHA;
        }
      } else {
        sp.sprite.tint = sp.color; sp.sprite.alpha = 0.78;
      }
    }

    // ── Overlay rings ──────────────────────────────────────────────────────
    this.overlayGfx.clear();

    if (this.hovId !== null && this.hovId !== this.selId) {
      const sp = this.ptMap.get(this.hovId);
      if (sp) {
        const [sx, sy] = this.worldToScreen(sp.x, sp.y);
        const r = screenR(sp.base, relZ);
        this.overlayGfx.lineStyle(1.5, 0xffffff, 0.6);
        this.overlayGfx.drawCircle(sx, sy, r + 2.5);
      }
    }

    if (this.selId !== null) {
      const sp = this.ptMap.get(this.selId);
      if (sp) {
        const [sx, sy] = this.worldToScreen(sp.x, sp.y);
        const r = screenR(sp.base, relZ);
        this.overlayGfx.lineStyle(2.5, 0xffffff, 1);
        this.overlayGfx.drawCircle(sx, sy, r + 3.5);
        this.overlayGfx.lineStyle(7, 0xffffff, 0.15);
        this.overlayGfx.drawCircle(sx, sy, r + 7);
      }
    }

    // ── Cluster labels ──────────────────────────────────────────────────────
    // Visible in overview range: relZ 1 → 8. Fade out as you zoom into nodes.
    const labelAlpha = Math.max(0, Math.min(1, 1 - (relZ - 2) / 6));
    this.labelCtr.alpha = labelAlpha;

    for (const child of this.labelCtr.children) {
      const wx = (child as any).__wx as number;
      const wy = (child as any).__wy as number;
      const [sx, sy] = this.worldToScreen(wx, wy);
      child.x = sx;
      child.y = sy;
      // Labels stay legibly sized across a wide zoom range
      const lz = Math.max(0.85, Math.min(1.6, Math.cbrt(relZ)));
      child.scale.set(lz);
    }
  }

  destroy() {
    sharedTex = null;
    this.app.destroy(false, { children: true });
  }
}
