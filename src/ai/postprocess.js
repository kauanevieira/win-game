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
 * Regra da spec: abaixo do centro do gap → precisa subir → jump.
 * @param {number} birdCenterY
 * @param {{ gapTop: number; gapBottom: number } | null | undefined} nextPipe
 * @returns {{ jump: boolean; gapMidY: number | null }}
 */
export function decideJump(birdCenterY, nextPipe) {
  if (!nextPipe) {
    return { jump: false, gapMidY: null };
  }
  const gapMidY = (nextPipe.gapTop + nextPipe.gapBottom) / 2;
  const jump = birdCenterY > gapMidY;
  return { jump, gapMidY };
}
