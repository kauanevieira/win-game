import { clamp } from '../utils/helpers.js';

export class Bird {
  /**
   * @param {{ x: number; startY: number; canvasHeight: number }} opts
   */
  constructor(opts) {
    this.x = opts.x;
    this.y = opts.startY;
    this.vy = 0;
    /** pixels / s² */
    this.gravity = 1450;
    /** pixels / s upward impulse */
    this.jumpVelocity = -420;
    this.canvasHeight = opts.canvasHeight;
    this.width = 36;
    this.height = 28;
    this.radius = 14;
  }

  /**
   * @param {number} dt seconds
   */
  update(dt) {
    this.vy += this.gravity * dt;
    this.y += this.vy * dt;
    const half = this.height / 2;
    this.y = clamp(this.y, half + 4, this.canvasHeight - half - 4);
  }

  jump() {
    this.vy = this.jumpVelocity;
  }

  reset(startY) {
    this.y = startY;
    this.vy = 0;
  }

  /** Axis-aligned box for collision */
  getHitbox() {
    const w = this.width;
    const h = this.height;
    return {
      x: this.x - w / 2,
      y: this.y - h / 2,
      w,
      h,
    };
  }
}
