import { Bird } from './bird.js';
import { PipeManager } from './pipes.js';
import { draw } from './renderer.js';

/** @typedef {'easy' | 'normal' | 'hard'} Difficulty */

const DIFFICULTY = {
  easy: { pipeSpeed: 140, gapHeight: 175 },
  normal: { pipeSpeed: 195, gapHeight: 150 },
  hard: { pipeSpeed: 260, gapHeight: 125 },
};

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ difficulty?: Difficulty }} [opts]
   */
  constructor(canvas, opts = {}) {
    /** Chamado quando pontuação ou estado running mudam (HUD). */
    this.onHudTick = opts.onHudTick ?? null;

    this.canvas = canvas;
    /** @type {CanvasRenderingContext2D | null} */
    this.ctx = canvas.getContext('2d');
    this.difficulty = opts.difficulty ?? 'normal';
    const d = DIFFICULTY[this.difficulty];

    this.width = canvas.width;
    this.height = canvas.height;

    this.bird = new Bird({
      x: 96,
      startY: this.height * 0.45,
      canvasHeight: this.height,
    });

    this.pipes = new PipeManager({
      canvasWidth: this.width,
      canvasHeight: this.height,
      gapHeight: d.gapHeight,
    });

    this.pipeSpeed = d.pipeSpeed;
    this.score = 0;
    this.running = true;
    /** @type {number | null} */
    this._raf = null;
    this._lastTs = 0;
    /** ms para animação do fundo */
    this.timeMs = 0;

    /** @type {{ bbox: { x1: number; y1: number; x2: number; y2: number } | null; gapMidY: number | null } | null} */
    this.aiDebug = null;

    this._loop = this._loop.bind(this);
  }

  /** @param {Difficulty} level */
  setDifficulty(level) {
    if (!(level in DIFFICULTY)) return;
    this.difficulty = level;
    const d = DIFFICULTY[level];
    this.pipeSpeed = d.pipeSpeed;
    this.pipes.setGapHeight(d.gapHeight);
  }

  /**
   * @param {{ bbox: { x1: number; y1: number; x2: number; y2: number } | null; gapMidY: number | null } | null} dbg
   */
  setAIDebug(dbg) {
    this.aiDebug = dbg;
  }

  start() {
    if (this._raf != null) return;
    this._lastTs = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    if (this._raf != null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  reset() {
    const d = DIFFICULTY[this.difficulty];
    this.pipeSpeed = d.pipeSpeed;
    this.pipes.setGapHeight(d.gapHeight);
    this.score = 0;
    this.running = true;
    this.bird.reset(this.height * 0.45);
    this.pipes.seedStart();
    this.aiDebug = null;
  }

  jump() {
    if (!this.running) return;
    this.bird.jump();
  }

  /** @param {number} ts */
  _loop(ts) {
    const ctx = this.ctx;
    if (!ctx) return;

    const dt = Math.min((ts - this._lastTs) / 1000, 0.05);
    this._lastTs = ts;
    this.timeMs += dt * 1000;

    const wasRunning = this.running;

    if (this.running) {
      this.bird.update(dt);
      this.pipes.update(dt, this.pipeSpeed);

      const hb = this.bird.getHitbox();
      if (this.pipes.collides(hb)) {
        this.running = false;
      } else {
        const gained = this.pipes.scorePasses(this.bird.x);
        if (gained > 0) {
          this.score += gained;
          this.onHudTick?.();
        }
      }

      const half = this.bird.height / 2;
      if (this.bird.y <= half + 4 || this.bird.y >= this.height - half - 4) {
        this.running = false;
      }
    }

    if (wasRunning && !this.running) {
      this.onHudTick?.();
    }

    draw(ctx, {
      bird: this.bird,
      pipes: this.pipes,
      score: this.score,
      running: this.running,
      aiDebug: this.aiDebug,
      timeMs: this.timeMs,
    });

    this._raf = requestAnimationFrame(this._loop);
  }

  getSnapshot() {
    return {
      bird: this.bird,
      pipes: this.pipes,
      score: this.score,
      running: this.running,
      width: this.width,
      height: this.height,
      difficulty: this.difficulty,
    };
  }
}
