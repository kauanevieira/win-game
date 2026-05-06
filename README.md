# Win Game — Flappy Bird com IA no navegador

Projeto desenvolvido no contexto da **pós-graduação em Engenharia de Software com IA aplicada**, com foco em **arquitetura cliente único**, **processamento assíncrono em Web Worker** e **inferência de redes neurais no browser** com **TensorFlow.js** e um modelo **YOLO** convertido para execução na web.

## Objetivo

Demonstrar um jogo estilo Flappy Bird em que uma IA tenta jogar sozinha usando **visão computacional**: capturas do canvas são enviadas a um **worker** dedicado, onde rodam **TensorFlow.js** e um modelo **YOLOv5n** (formato Graph Model) para detectar o pássaro na imagem e decidir se deve haver um pulo. A thread principal permanece responsável pela renderização e pela física do jogo, sem bloquear a interface.

## Por que Web Worker + TensorFlow.js

Em aplicações web, inferência pesada na thread principal causa travamentos perceptíveis (jank). Este projeto segue o padrão discutido na disciplina (inspirado em projetos como **Duck Hunt + ML**):

| Camada | Responsabilidade |
|--------|-------------------|
| **Main thread** | React (HUD), Canvas 2D, loop do jogo (`requestAnimationFrame`), captura do frame com `createImageBitmap`, envio ao worker via `postMessage`, aplicação da decisão no pássaro |
| **Web Worker** (`src/ai/aiWorker.js`) | Carregar TensorFlow.js, carregar o grafo YOLO (`tf.loadGraphModel`), pré-processamento do tensor, `executeAsync`, pós-processamento das detecções (caixas, scores, classes), decisão simbólica `jump` |

O modelo e os pesos ficam em `public/model/` (`model.json`, shards `.bin`, `labels.json`) e são servidos como arquivos estáticos — **não há backend** nem chamadas a APIs externas para inferência.

## Fluxo da IA (visão → decisão)

1. A cada intervalo (~100 ms), a thread principal gera um **ImageBitmap** do canvas e envia ao worker:
   - tipo `predict`;
   - imagem transferível (bitmap);
   - metadados do canvas e, opcionalmente, dados do **próximo cano** vindos do estado do jogo (para combinar visão com geometria do obstáculo).

2. No worker:
   - **Pré-processamento** (`src/ai/preprocess.js`): conversão com `tf.browser.fromPixels`, redimensionamento para 640×640, normalização (\(/255\)), `expandDims` para batch; uso de `tf.tidy` onde aplicável.
   - **Inferência**: `model.executeAsync(input)`; saídas interpretadas como caixas, scores e classes (modelo YOLOv5 em formato TensorFlow.js).
   - **Pós-processamento** (`src/ai/postprocess.js`): filtro por confiança (limiar ~0.4), seleção da classe **`bird`** (vocabulário COCO no `labels.json`), centro da bounding box.
   - **Decisão**: comparação da altura do pássaro detectado com o centro vertical do espaço entre os canos (`decideJump`); resposta `postMessage` com `{ type: 'decision', jump, debug }`.

3. Na main thread (`src/main.js`), quando há detecção confiável, usa-se a decisão do worker; quando o modelo **não** enxerga bem o sprite desenhado (comum, pois COCO foi treinado em fotos), pode entrar em jogo uma **heurística de fallback** baseada na posição do pássaro no estado do jogo e no próximo buraco — garantindo jogabilidade estável sem abandonar o papel pedagógico do worker YOLO.

Enquanto o grafo ainda **carrega**, há um intervalo de “sobrevivência” com pulos auxiliares para não haver só gravidade até o primeiro `model-loaded`.

## Stack técnica

- **Vite 6** — bundler e dev server  
- **React 18** — shell da UI (canvas + HUD)  
- **@vitejs/plugin-react-swc** — transpilação rápida  
- **@tensorflow/tfjs** — runtime no worker  
- **Canvas 2D** — jogo em `src/game/` (`game.js`, `bird.js`, `pipes.js`, `renderer.js`)

## Estrutura de pastas (resumo)

```
win-game/
├── index.html
├── public/
│   ├── model/           # model.json, shards, labels.json (YOLO web)
│   └── styles.css
├── src/
│   ├── ai/
│   │   ├── aiWorker.js  # Worker: TF.js + YOLO + mensagens
│   │   ├── preprocess.js
│   │   └── postprocess.js
│   ├── game/            # Lógica do Flappy (Canvas)
│   ├── utils/
│   ├── main.js          # Ponte: Game + Worker + captura de frames
│   ├── App.jsx
│   └── index.jsx
├── package.json
└── vite.config.js       # worker.format: 'es' para worker em ES modules
```

## Como executar

Requisitos: **Node.js** recente (recomenda-se 20 LTS ou superior).

```bash
npm install
npm run dev
```

Abra o endereço indicado no terminal (geralmente `http://localhost:5173`).

Build de produção:

```bash
npm run build
npm run preview   # testar o dist localmente
```

## Parâmetros e HUD

- Alternar **IA automática** / controle humano (com IA desligada: espaço ou clique para pular).
- **Debug**: opcionalmente desenha bounding box do YOLO e linha de referência do gap no canvas.
- **Dificuldade**: ajusta velocidade dos canos e altura do espaço entre eles.

## Referências conceituais

- Separação **renderização (main) / inferência (worker)** e comunicação **postMessage**, alinhada ao roteiro da disciplina e ao uso de **TensorFlow.js** no cliente.
- Modelo YOLO em formato compatível com `tf.loadGraphModel`, executado inteiramente no worker para não degradar FPS.

## Licença

Projeto acadêmico — uso educacional. O repositório de referência **DuckHunt-JS** e ativos de terceiros mantêm suas licenças originais onde aplicável.
