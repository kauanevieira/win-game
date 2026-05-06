import * as tf from '@tensorflow/tfjs';
import { preprocessImage } from './preprocess.js';
import { extractBird, decideJump } from './postprocess.js';

const MODEL_PATH = '/model/model.json';
const LABELS_PATH = '/model/labels.json';

/** @type {string[]} */
let _labels = [];
/** @type {import('@tensorflow/tfjs').GraphModel | null} */
let _model = null;

async function loadModelAndLabels() {
  await tf.ready();

  const labelsRes = await fetch(LABELS_PATH);
  _labels = await labelsRes.json();

  _model = await tf.loadGraphModel(MODEL_PATH);

  if (!_model) throw new Error('Model failed to load');

  const rawShape = _model.inputs[0].shape;
  const inputShape = rawShape.map((d) => (d == null || d < 0 ? 1 : d));
  const dummyInput = tf.ones(inputShape);
  await _model.executeAsync(dummyInput);
  dummyInput.dispose();

  postMessage({ type: 'model-loaded' });
}

/**
 * @param {import('@tensorflow/tfjs').Tensor} tensor
 */
async function runInference(tensor) {
  if (!_model) throw new Error('Model not loaded');
  const output = await _model.executeAsync(tensor);
  tensor.dispose();

  const [boxes, scores, classes] = output.slice(0, 3);
  const [boxesData, scoresData, classesData] = await Promise.all([
    boxes.data(),
    scores.data(),
    classes.data(),
  ]);

  output.forEach((t) => t.dispose());

  return {
    boxes: boxesData,
    scores: scoresData,
    classes: classesData,
  };
}

loadModelAndLabels().catch((err) => {
  postMessage({ type: 'error', message: String(err?.message ?? err) });
});

self.onmessage = async ({ data }) => {
  if (data?.type !== 'predict') return;
  if (!_model) return;

  let bitmap = data.image;
  try {
    const width = bitmap.width;
    const height = bitmap.height;

    const input = preprocessImage(bitmap);
    bitmap.close?.();
    bitmap = null;

    const inferenceResults = await runInference(input);

    const bird = extractBird(
      inferenceResults.boxes,
      inferenceResults.scores,
      inferenceResults.classes,
      _labels,
      width,
      height,
    );

    const nextPipe = data.nextPipe ?? null;

    let jump = false;
    let gapMidY = null;

    if (bird) {
      const d = decideJump(bird.centerY, nextPipe);
      jump = d.jump;
      gapMidY = d.gapMidY;
    }

    postMessage({
      type: 'decision',
      jump,
      debug: bird
        ? {
            bbox: { x1: bird.x1, y1: bird.y1, x2: bird.x2, y2: bird.y2 },
            gapMidY,
            birdCenterY: bird.centerY,
          }
        : {
            bbox: null,
            gapMidY,
            birdCenterY: null,
          },
    });
  } catch (e) {
    postMessage({
      type: 'error',
      message: String(e?.message ?? e),
    });
  } finally {
    bitmap?.close?.();
  }
};
