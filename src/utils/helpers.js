/** @param {number} v @param {number} min @param {number} max */
export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** @param {number} min @param {number} max */
export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * @template T
 * @param {() => T} getState
 * @param {(state: T) => void} listener
 * @returns {() => void}
 */
export function subscribeSimple(getState, listener) {
  let prev = getState();
  const tick = () => {
    const next = getState();
    if (next !== prev) {
      prev = next;
      listener(next);
    }
  };
  const id = setInterval(tick, 100);
  return () => clearInterval(id);
}
