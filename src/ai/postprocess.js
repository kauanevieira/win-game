export const CLASS_THRESHOLD = 0.4;

const BIRD_LABEL = 'bird';

/**
 * @param {Float32Array} boxesData
 * @param {Float32Array} scoresData
 * @param {Float32Array} classesData
 * @param {string[]} labels
 * @param {number} width canvas width (pixels)
 * @param {number} height canvas height (pixels)
 * @returns {{ centerX: number; centerY: number; score: number; x1: number; y1: number; x2: number; y2: number } | null}
 */
export function extractBird(
  boxesData,
  scoresData,
  classesData,
  labels,
  width,
  height,
) {
  let bestIdx = -1;
  let bestScore = CLASS_THRESHOLD;

  for (let index = 0; index < scoresData.length; index++) {
    if (scoresData[index] < CLASS_THRESHOLD) continue;

    const classIdx = Math.round(classesData[index]);
    const label = labels[classIdx];
    if (label !== BIRD_LABEL) continue;

    if (scoresData[index] > bestScore) {
      bestScore = scoresData[index];
      bestIdx = index;
    }
  }

  if (bestIdx < 0) return null;

  let [x1, y1, x2, y2] = boxesData.slice(bestIdx * 4, bestIdx * 4 + 4);
  x1 *= width;
  x2 *= width;
  y1 *= height;
  y2 *= height;

  const boxWidth = x2 - x1;
  const boxHeight = y2 - y1;
  const centerX = x1 + boxWidth / 2;
  const centerY = y1 + boxHeight / 2;

  return {
    centerX,
    centerY,
    score: bestScore,
    x1,
    y1,
    x2,
    y2,
  };
}

/**
 * Decide se o pássaro deve pular usando predição física:
 * simula onde o pássaro estará ao chegar no cano (dado vy atual e gravidade)
 * e pula apenas se a trajetória vai colidir com a parte de baixo do gap.
 * @param {number} birdCenterY
 * @param {{ gapTop: number; gapBottom: number; x: number } | null | undefined} nextPipe
 * @param {{ vy?: number; gravity?: number; height?: number; pipeSpeed?: number; birdX?: number } | null | undefined} physics
 * @returns {{ jump: boolean; gapMidY: number | null }}
 */
export function decideJump(birdCenterY, nextPipe, physics) {
  if (!nextPipe) {
    return { jump: false, gapMidY: null };
  }
  const gapMidY = (nextPipe.gapTop + nextPipe.gapBottom) / 2;

  if (physics?.vy != null && physics.gravity != null && physics.pipeSpeed != null) {
    const g = physics.gravity;
    const vy = physics.vy;
    const pipeSpeed = Math.max(1, physics.pipeSpeed);
    const distToPipe = Math.max(0, nextPipe.x - (physics.birdX ?? 96));
    const timeToReach = distToPipe / pipeSpeed;
    const margin = (physics.height ?? 28);
    const safeBottom = nextPipe.gapBottom - margin;

    const yNoJump = birdCenterY + vy * timeToReach + 0.5 * g * timeToReach * timeToReach;
    return { jump: yNoJump > safeBottom, gapMidY };
  }

  return { jump: birdCenterY > gapMidY, gapMidY };
}
