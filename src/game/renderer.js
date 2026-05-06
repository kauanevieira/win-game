/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {import('./bird.js').Bird} state.bird
 * @param {import('./pipes.js').PipeManager} state.pipes
 * @param {number} state.score
 * @param {boolean} state.running
 * @param {number} [state.timeMs]
 * @param {{ bbox: { x1: number; y1: number; x2: number; y2: number } | null; gapMidY: number | null } | null} state.aiDebug
 */
export function draw(ctx, state) {
  const { width, height } = ctx.canvas;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#38bdf8');
  sky.addColorStop(1, '#bae6fd');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const t = state.timeMs ?? 0;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 8; i++) {
    const x = ((i * 137 + t * 0.02) % (width + 100)) - 50;
    ctx.beginPath();
    ctx.arc(x, 80 + i * 12, 40 + (i % 3) * 10, 0, Math.PI * 2);
    ctx.fill();
  }

  const pipes = state.pipes.getAll();
  ctx.fillStyle = '#166534';
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 3;

  for (const p of pipes) {
    ctx.fillRect(p.x, 0, p.width, p.gapY);
    ctx.strokeRect(p.x, 0, p.width, p.gapY);
    ctx.fillRect(p.x, p.gapY + p.gapHeight, p.width, height - (p.gapY + p.gapHeight));
    ctx.strokeRect(p.x, p.gapY + p.gapHeight, p.width, height - (p.gapY + p.gapHeight));

    ctx.fillStyle = '#22c55e';
    ctx.fillRect(p.x - 2, p.gapY - 24, p.width + 4, 24);
    ctx.fillRect(p.x - 2, p.gapY + p.gapHeight, p.width + 4, 24);
    ctx.fillStyle = '#166534';
  }

  const bird = state.bird;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  const tilt = Math.min(Math.max(bird.vy / 800, -0.6), 0.9);
  ctx.rotate(tilt);
  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, bird.width / 2, bird.height / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(6, -4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(bird.width / 2 - 2, 2);
  ctx.lineTo(bird.width / 2 + 10, 6);
  ctx.lineTo(bird.width / 2 - 2, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (state.aiDebug?.bbox) {
    const b = state.aiDebug.bbox;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
  }
  if (typeof state.aiDebug?.gapMidY === 'number') {
    const gy = state.aiDebug.gapMidY;
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (!state.running) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game over — clique ou espaço', width / 2, height / 2);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('para reiniciar', width / 2, height / 2 + 32);
  }
}
