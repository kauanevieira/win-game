import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  bootstrap,
  getHudSnapshot,
  subscribeHud,
  setAiEnabled,
  setDebugMode,
  setDifficulty,
} from './main.js';

const CANVAS_W = 480;
const CANVAS_H = 720;

export default function App() {
  const canvasRef = useRef(null);
  const hud = useSyncExternalStore(subscribeHud, getHudSnapshot, getHudSnapshot);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    return bootstrap(canvas);
  }, []);

  return (
    <div className="app">
      <h1 className="title">Win Game — Flappy + YOLO (TensorFlow.js)</h1>
      <div className="canvas-wrap">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} aria-label="Jogo Flappy Bird" />
      </div>
      <div className="hud">
        <span className="score">Pontos: {hud.score}</span>
        <span className={`badge ${hud.aiEnabled ? 'ai-on' : 'ai-off'}`}>
          {hud.aiEnabled ? 'IA ligada' : 'IA desligada — você joga'}
        </span>
        <label>
          <input
            type="checkbox"
            checked={hud.aiEnabled}
            onChange={(e) => setAiEnabled(e.target.checked)}
          />
          IA automática
        </label>
        <label>
          <input
            type="checkbox"
            checked={hud.debugMode}
            onChange={(e) => setDebugMode(e.target.checked)}
          />
          Debug (bbox / gap)
        </label>
        <div className="difficulty">
          <span>Dificuldade:</span>
          <select
            value={hud.difficulty}
            onChange={(e) =>
              setDifficulty(/** @type {'easy' | 'normal' | 'hard'} */ (e.target.value))
            }
          >
            <option value="easy">Fácil</option>
            <option value="normal">Normal</option>
            <option value="hard">Difícil</option>
          </select>
        </div>
      </div>
      <p className="status-line">
        Modelo YOLO: {hud.modelLoaded ? 'carregado no worker' : 'carregando…'} · Última decisão:{' '}
        {hud.lastDecision
          ? `${hud.lastDecision.jump ? 'pular' : 'não pular'}`
          : '—'}
      </p>
      <p className="help">
        Com a IA desligada: clique ou espaço para pular. Game over: clique ou espaço para reiniciar.
      </p>
    </div>
  );
}
