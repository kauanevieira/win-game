import { Game } from './game/game.js';

const HUD_EVENT = 'hud-state';

/** @type {Game | null} */
let gameInstance = null;
/** @type {Worker | null} */
let aiWorker = null;
/** @type {ReturnType<typeof setInterval> | null} */
let captureInterval = null;
/** Loop direto de alta frequência — substitui o intervalo de sobrevivência e age como fallback
 *  do YOLO quando o modelo não detecta o pássaro pixel-art. */
/** @type {ReturnType<typeof setInterval> | null} */
let directAiInterval = null;
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

/**
 * Controlador baseado no apex real do pulo + lookahead de 0.3 s.
 *
 * Lógica central:
 *  1. Calcula onde seria o apex (ponto mais alto) se o pássaro pular agora.
 *     Se o apex ultrapassar o teto do cano → NÃO pula (evita cano de cima).
 *  2. Simula posição em 0.3 s com a física atual.
 *     Se vai cair abaixo do centro do gap → PULA.
 *
 * @param {import('./game/game.js').Game} game
 * @returns {boolean}
 */
function heuristicJump(game) {
  const next = game.pipes.getNextPipe(game.bird.x);
  const bird = game.bird;
  const g = bird.gravity;

  if (!next) {
    // Sem cano: mantém pássaro perto do centro, mas não se já subindo
    return bird.y > game.height * 0.55 && bird.vy > -100;
  }

  const gapMidY = (next.gapTop + next.gapBottom) / 2;

  // O quanto o pássaro sobe após um pulo (partindo sempre de vy = jumpVelocity = -420):
  // apex_rise = jumpVelocity² / (2 * gravity) = 420² / 2900 ≈ 60.8 px
  const apexRise = (bird.jumpVelocity * bird.jumpVelocity) / (2 * g);
  const jumpApexY = bird.y - apexRise;

  // Se o apex ficaria acima da borda interna do cano de cima → não pula
  if (jumpApexY < next.gapTop + bird.height / 2) return false;

  // Predição de 0.3 s com física atual (sem pulo)
  const yFuture = bird.y + bird.vy * 0.3 + 0.5 * g * 0.09;

  // Pula se a trajetória atual vai ultrapassar o centro do gap
  return yFuture > gapMidY;
}

function startDirectAi() {
  if (directAiInterval) return;
  directAiInterval = setInterval(() => {
    if (!gameInstance || !aiEnabled || !gameInstance.running) return;
    if (heuristicJump(gameInstance)) {
      gameInstance.jump();
      lastDecision = { jump: true, at: Date.now() };
      bumpHud();
    }
  }, 33);
}

function stopDirectAi() {
  if (directAiInterval != null) {
    clearInterval(directAiInterval);
    directAiInterval = null;
  }
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

  startDirectAi();

  aiWorker = new Worker(new URL('./ai/aiWorker.js', import.meta.url), {
    type: 'module',
  });

  aiWorker.onmessage = ({ data }) => {
    if (data?.type === 'model-loaded') {
      modelLoaded = true;
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
        const bird = gameInstance.bird;
        aiWorker.postMessage(
          {
            type: 'predict',
            image: bitmap,
            canvas: { w: canvas.width, h: canvas.height },
            nextPipe,
            birdPhysics: {
              vy: bird.vy,
              gravity: bird.gravity,
              height: bird.height,
              pipeSpeed: gameInstance.pipeSpeed,
            },
          },
          [bitmap],
        );
      } catch (e) {
        console.error(e);
        inFlight = false;
      }
    })();
  }, 100);

  const onKeyDown = (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    e.preventDefault();
    if (!gameInstance) return;
    if (!gameInstance.running) {
      gameInstance.reset();
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
    stopDirectAi();
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
    stopDirectAi();
  } else {
    startDirectAi();
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
