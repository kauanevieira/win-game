import { Game } from './game/game.js';

const HUD_EVENT = 'hud-state';

/** @type {Game | null} */
let gameInstance = null;
/** @type {Worker | null} */
let aiWorker = null;
/** @type {ReturnType<typeof setInterval> | null} */
let captureInterval = null;
/** Pulos de emergência enquanto o TF/YOLO carrega (sem isso só há gravidade). */
/** @type {ReturnType<typeof setInterval> | null} */
let survivalUntilModelInterval = null;
let inFlight = false;
let aiEnabled = true;
let debugMode = true;
let modelLoaded = false;

/** @type {{ jump: boolean | null; at: number } | null} */
let lastDecision = null;

/** incrementado a cada mudança para useSyncExternalStore */
let hudVersion = 0;

function bumpHud() {
  hudVersion += 1;
  hudBus.dispatchEvent(new CustomEvent(HUD_EVENT));
}

function clearSurvivalUntilModel() {
  if (survivalUntilModelInterval != null) {
    clearInterval(survivalUntilModelInterval);
    survivalUntilModelInterval = null;
  }
}

/** Mantém o pássaro no ar enquanto o grafo YOLO ainda não está pronto. */
function startSurvivalWhileModelLoads() {
  clearSurvivalUntilModel();
  if (modelLoaded || !aiEnabled) return;
  survivalUntilModelInterval = setInterval(() => {
    if (!gameInstance || !aiEnabled) return;
    if (modelLoaded) {
      clearSurvivalUntilModel();
      return;
    }
    if (!gameInstance.running) return;
    const b = gameInstance.bird;
    if (b.y > gameInstance.height * 0.48) {
      gameInstance.jump();
    }
  }, 420);
}

/**
 * Quando o YOLO não acha o pássaro desenhado (arte ≠ foto COCO), usa a mesma
 * regra do worker com a posição real do pássaro no jogo.
 * @param {import('./game/game.js').Game} game
 */
function heuristicJump(game) {
  const next = game.pipes.getNextPipe(game.bird.x);
  if (!next) return false;
  const gapMidY = (next.gapTop + next.gapBottom) / 2;
  return game.bird.y > gapMidY;
}

export const hudBus = new EventTarget();

function getHudState() {
  return {
    version: hudVersion,
    score: gameInstance?.score ?? 0,
    aiEnabled,
    debugMode,
    modelLoaded,
    lastDecision,
    running: gameInstance?.running ?? false,
    difficulty: gameInstance?.difficulty ?? 'normal',
  };
}

/** Snapshot estável para React */
let hudSnapshot = getHudState();

function syncSnapshot() {
  hudSnapshot = getHudState();
}

/**
 * @returns {typeof hudSnapshot}
 */
export function getHudSnapshot() {
  return hudSnapshot;
}

/**
 * @param {() => void} onStoreChange
 */
export function subscribeHud(onStoreChange) {
  const handler = () => {
    syncSnapshot();
    onStoreChange();
  };
  hudBus.addEventListener(HUD_EVENT, handler);
  return () => hudBus.removeEventListener(HUD_EVENT, handler);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {() => void} cleanup
 */
export function bootstrap(canvas) {
  gameInstance = new Game(canvas, {
    onHudTick: () => bumpHud(),
  });
  gameInstance.pipes.seedStart();
  gameInstance.start();

  aiWorker = new Worker(new URL('./ai/aiWorker.js', import.meta.url), {
    type: 'module',
  });

  aiWorker.onmessage = ({ data }) => {
    if (data?.type === 'model-loaded') {
      modelLoaded = true;
      clearSurvivalUntilModel();
      bumpHud();
      return;
    }
    if (data?.type === 'error') {
      console.error('[aiWorker]', data.message);
      inFlight = false;
      return;
    }
    if (data?.type !== 'decision') {
      inFlight = false;
      return;
    }

    inFlight = false;

    if (gameInstance && aiEnabled && gameInstance.running) {
      const hasVision = Boolean(
        data.debug &&
          data.debug.bbox != null &&
          typeof data.debug.birdCenterY === 'number',
      );
      const shouldJump = hasVision
        ? Boolean(data.jump)
        : heuristicJump(gameInstance);

      if (shouldJump) {
        gameInstance.jump();
        lastDecision = { jump: true, at: Date.now() };
      } else {
        lastDecision = { jump: false, at: Date.now() };
      }
    } else {
      lastDecision = { jump: Boolean(data.jump), at: Date.now() };
    }

    if (gameInstance && debugMode && data.debug) {
      const d = data.debug;
      gameInstance.setAIDebug({
        bbox: d.bbox,
        gapMidY: typeof d.gapMidY === 'number' ? d.gapMidY : null,
      });
    } else if (gameInstance && !debugMode) {
      gameInstance.setAIDebug(null);
    }

    bumpHud();
  };

  captureInterval = setInterval(() => {
    if (!gameInstance || !aiWorker || !aiEnabled || !modelLoaded) return;
    if (inFlight) return;
    if (!gameInstance.running) return;

    inFlight = true;

    void (async () => {
      try {
        const bitmap = await createImageBitmap(canvas);
        const nextPipe = gameInstance.pipes.getNextPipe(gameInstance.bird.x);
        aiWorker.postMessage(
          {
            type: 'predict',
            image: bitmap,
            canvas: { w: canvas.width, h: canvas.height },
            nextPipe,
          },
          [bitmap],
        );
      } catch (e) {
        console.error(e);
        inFlight = false;
      }
    })();
  }, 100);

  startSurvivalWhileModelLoads();

  const onKeyDown = (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    e.preventDefault();
    if (!gameInstance) return;
    if (!gameInstance.running) {
      gameInstance.reset();
      startSurvivalWhileModelLoads();
      bumpHud();
      return;
    }
    if (!aiEnabled) {
      gameInstance.jump();
    }
  };

  const onPointerDown = () => {
    if (!gameInstance) return;
    if (!gameInstance.running) {
      gameInstance.reset();
      startSurvivalWhileModelLoads();
      bumpHud();
      return;
    }
    if (!aiEnabled) {
      gameInstance.jump();
    }
  };

  window.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('pointerdown', onPointerDown);

  syncSnapshot();
  bumpHud();

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    canvas.removeEventListener('pointerdown', onPointerDown);
    if (captureInterval != null) {
      clearInterval(captureInterval);
      captureInterval = null;
    }
    clearSurvivalUntilModel();
    aiWorker?.terminate();
    aiWorker = null;
    gameInstance?.stop();
    gameInstance = null;
    modelLoaded = false;
    syncSnapshot();
  };
}

/** @param {boolean} enabled */
export function setAiEnabled(enabled) {
  aiEnabled = enabled;
  if (!enabled) {
    clearSurvivalUntilModel();
  } else if (gameInstance?.running && !modelLoaded) {
    startSurvivalWhileModelLoads();
  }
  bumpHud();
}

/** @param {boolean} enabled */
export function setDebugMode(enabled) {
  debugMode = enabled;
  if (gameInstance && !enabled) {
    gameInstance.setAIDebug(null);
  }
  bumpHud();
}

/** @param {'easy' | 'normal' | 'hard'} level */
export function setDifficulty(level) {
  if (!gameInstance) return;
  gameInstance.setDifficulty(level);
  gameInstance.reset();
  bumpHud();
}

export function getScore() {
  return gameInstance?.score ?? 0;
}
