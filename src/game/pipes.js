import { randomRange } from '../utils/helpers.js';

/**
 * @typedef {{ x: number; width: number; gapY: number; gapHeight: number; passed: boolean }} PipePair
 */

export class PipeManager {
  /**
   * @param {{ canvasWidth: number; canvasHeight: number; pipeWidth?: number; gapHeight?: number }} opts
   */
  constructor(opts) {
    this.canvasWidth = opts.canvasWidth;
    this.canvasHeight = opts.canvasHeight;
    this.pipeWidth = opts.pipeWidth ?? 56;
    this.baseGapHeight = opts.gapHeight ?? 150;
    this.gapHeight = this.baseGapHeight;
    /** @type {PipePair[]} */
    this.pipes = [];
    /** horizontal spacing between pipe pairs */
    this.spacing = 280;
  }

  setGapHeight(gap) {
    this.gapHeight = gap;
  }

  clear() {
    this.pipes = [];
  }

  seedStart() {
    this.clear();
    this.pipes.push(this._createPipeAt(this.canvasWidth + 30));
  }

  /**
   * @param {number} x
   * @returns {PipePair}
   */
  _createPipeAt(x) {
    const margin = 70;
    const gh = this.gapHeight;
    const gapY = randomRange(margin, this.canvasHeight - margin - gh);
    return {
      x,
      width: this.pipeWidth,
      gapY,
      gapHeight: gh,
      passed: false,
    };
  }

  /**
   * @param {number} dt
   * @param {number} speed px/s
   */
  update(dt, speed) {
    for (const p of this.pipes) {
      p.x -= speed * dt;
    }
    this.pipes = this.pipes.filter((p) => p.x + p.width > -60);

    const rightEdge = (p) => p.x + p.width;
    const furthestRight = this.pipes.reduce((acc, p) => Math.max(acc, rightEdge(p)), 0);

    if (furthestRight < this.canvasWidth + this.spacing * 0.75) {
      const spawnX = Math.max(this.canvasWidth + 24, furthestRight + this.spacing * 0.95);
      this.pipes.push(this._createPipeAt(spawnX));
    }
  }

  /**
   * @param {number} birdX
   * @returns {{ x: number; gapTop: number; gapBottom: number } | null}
   */
  getNextPipe(birdX) {
    const ahead = this.pipes.filter((p) => p.x + p.width > birdX - 8);
    if (ahead.length === 0) return null;
    ahead.sort((a, b) => a.x - b.x);
    const p = ahead[0];
    return {
      x: p.x,
      gapTop: p.gapY,
      gapBottom: p.gapY + p.gapHeight,
    };
  }

  /** @returns {PipePair[]} */
  getAll() {
    return this.pipes;
  }

  /**
   * @param {{ x: number; y: number; w: number; h: number }} box
   * @returns {boolean}
   */
  collides(box) {
    for (const p of this.pipes) {
      const top = { x: p.x, y: 0, w: p.width, h: p.gapY };
      const bottom = {
        x: p.x,
        y: p.gapY + p.gapHeight,
        w: p.width,
        h: this.canvasHeight - (p.gapY + p.gapHeight),
      };
      if (rectsOverlap(box, top) || rectsOverlap(box, bottom)) return true;
    }
    return false;
  }

  /**
   * @param {number} birdX
   * @returns {number}
   */
  scorePasses(birdX) {
    let gained = 0;
    for (const p of this.pipes) {
      if (!p.passed && birdX > p.x + p.width) {
        p.passed = true;
        gained += 1;
      }
    }
    return gained;
  }
}

/**
 * @param {{ x: number; y: number; w: number; h: number }} a
 * @param {{ x: number; y: number; w: number; h: number }} b
 */
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
