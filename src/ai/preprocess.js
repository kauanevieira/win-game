import * as tf from '@tensorflow/tfjs';

export const INPUT_MODEL_DIMENSIONS = 640;

/**
 * @param {ImageBitmap | HTMLCanvasElement | HTMLImageElement | HTMLVideoElement} input
 * @returns {import('@tensorflow/tfjs').Tensor4D}
 */
export function preprocessImage(input) {
  return tf.tidy(() => {
    const image = tf.browser.fromPixels(input);
    return tf.image
      .resizeBilinear(image, [INPUT_MODEL_DIMENSIONS, INPUT_MODEL_DIMENSIONS])
      .div(255)
      .expandDims(0);
  });
}
