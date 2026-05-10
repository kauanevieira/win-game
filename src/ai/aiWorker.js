// Importa a biblioteca TensorFlow.js, que permite carregar e executar modelos de Machine Learning no navegador.
import * as tf from '@tensorflow/tfjs';
// Importa a função que prepara (redimensiona/normaliza) a imagem antes de enviá-la ao modelo.
import { preprocessImage } from './preprocess.js';
// Importa funções que processam a saída do modelo: extrair o pássaro detectado e decidir se deve pular.
import { extractBird, decideJump } from './postprocess.js';

// Caminho (URL pública) onde está o arquivo JSON do modelo treinado.
const MODEL_PATH = '/model/model.json';
// Caminho do arquivo JSON contendo os rótulos (labels) das classes que o modelo reconhece.
const LABELS_PATH = '/model/labels.json';

/** @type {string[]} */
// Variável que guardará a lista de rótulos lidos do arquivo labels.json (ex.: ["bird", "pipe", ...]).
let _labels = [];
/** @type {import('@tensorflow/tfjs').GraphModel | null} */
// Variável que guardará a referência ao modelo carregado; começa como null até o carregamento concluir.
let _model = null;

// Função assíncrona responsável por inicializar o TensorFlow, carregar os rótulos e o modelo.
async function loadModelAndLabels() {
  // Aguarda o TensorFlow.js terminar a inicialização interna (backends, WebGL, etc.).
  await tf.ready();

  // Faz uma requisição HTTP para baixar o arquivo de rótulos.
  const labelsRes = await fetch(LABELS_PATH);
  // Converte a resposta para JSON e armazena na variável _labels.
  _labels = await labelsRes.json();

  // Carrega o modelo no formato GraphModel a partir do MODEL_PATH.
  _model = await tf.loadGraphModel(MODEL_PATH);

  // Garante que o modelo foi realmente carregado; caso contrário, lança um erro.
  if (!_model) throw new Error('Model failed to load');

  // Lê o formato (shape) esperado da entrada do modelo (ex.: [null, 640, 640, 3]).
  const rawShape = _model.inputs[0].shape;
  // Substitui dimensões dinâmicas (null ou negativas) por 1, para conseguir criar um tensor concreto.
  const inputShape = rawShape.map((d) => (d == null || d < 0 ? 1 : d));
  // Cria um tensor "fake" preenchido com 1s, apenas para forçar a compilação inicial do modelo (warm-up).
  const dummyInput = tf.ones(inputShape);
  // Executa o modelo uma vez com a entrada fake; isso pré-aquece e evita lentidão na primeira inferência real.
  await _model.executeAsync(dummyInput);
  // Libera a memória do tensor fake (importante porque tensores não são limpos automaticamente pelo GC).
  dummyInput.dispose();

  // Avisa a thread principal que o modelo já está pronto para ser usado.
  postMessage({ type: 'model-loaded' });
}

/**
 * @param {import('@tensorflow/tfjs').Tensor} tensor
 */
// Função que recebe um tensor (imagem pré-processada) e roda a inferência no modelo.
async function runInference(tensor) {
  // Verificação defensiva: não há como inferir se o modelo não foi carregado.
  if (!_model) throw new Error('Model not loaded');
  // Executa o modelo de forma assíncrona com o tensor de entrada e obtém a saída (array de tensores).
  const output = await _model.executeAsync(tensor);
  // Libera a memória do tensor de entrada — já não é mais necessário após a inferência.
  tensor.dispose();

  // Modelos de detecção de objetos retornam tipicamente 3 tensores: caixas (bounding boxes), scores e classes.
  const [boxes, scores, classes] = output.slice(0, 3);
  // Lê os dados desses tensores (de GPU/WebGL para a CPU) em paralelo, transformando-os em arrays comuns.
  const [boxesData, scoresData, classesData] = await Promise.all([
    boxes.data(),
    scores.data(),
    classes.data(),
  ]);

  // Libera a memória de TODOS os tensores retornados pelo modelo, evitando memory leak.
  output.forEach((t) => t.dispose());

  // Retorna os resultados em forma de objeto para serem usados pelo restante do código.
  return {
    boxes: boxesData,
    scores: scoresData,
    classes: classesData,
  };
}

// Dispara o carregamento do modelo assim que o worker inicia.
loadModelAndLabels().catch((err) => {
  // Se algum erro ocorrer no carregamento, envia uma mensagem de erro para a thread principal.
  postMessage({ type: 'error', message: String(err?.message ?? err) });
});

// Listener principal do Web Worker: escuta mensagens vindas da thread principal (o jogo).
self.onmessage = async ({ data }) => {
  // Ignora qualquer mensagem que não seja do tipo "predict" (pedido de previsão).
  if (data?.type !== 'predict') return;
  // Se o modelo ainda não foi carregado, simplesmente ignora a requisição.
  if (!_model) return;

  // Obtém o ImageBitmap (frame do jogo) que foi enviado para análise.
  let bitmap = data.image;
  try {
    // Captura largura e altura da imagem original — usadas depois para reescalar coordenadas das bounding boxes.
    const width = bitmap.width;
    const height = bitmap.height;

    // Pré-processa a imagem: redimensiona para o tamanho que o modelo espera e normaliza pixels.
    const input = preprocessImage(bitmap);
    // Fecha o ImageBitmap original para liberar memória (operador "?." protege caso close não exista).
    bitmap.close?.();
    // Remove a referência local para que o GC possa coletá-la.
    bitmap = null;

    // Roda a inferência no modelo com a imagem pré-processada.
    const inferenceResults = await runInference(input);

    // Extrai do conjunto de detecções a que corresponde ao "pássaro" (bird), com sua bounding box.
    const bird = extractBird(
      inferenceResults.boxes,
      inferenceResults.scores,
      inferenceResults.classes,
      _labels,
      width,
      height,
    );

    // Pega informações do próximo cano e física do pássaro enviadas pelo jogo.
    const nextPipe = data.nextPipe ?? null;
    const birdPhysics = data.birdPhysics ?? null;

    // Variável que indica se a IA decidiu pular nesse frame.
    let jump = false;
    // Coordenada Y do meio do gap — sempre calculada para visualização no debug.
    let gapMidY = nextPipe ? (nextPipe.gapTop + nextPipe.gapBottom) / 2 : null;

    // Só decide se houve detecção válida do pássaro.
    if (bird) {
      // Calcula a decisão de pulo usando física: prediz trajetória até o cano.
      const d = decideJump(bird.centerY, nextPipe, birdPhysics
        ? { ...birdPhysics, birdX: bird.centerX }
        : null);
      // Atualiza as variáveis com o resultado da decisão.
      jump = d.jump;
      gapMidY = d.gapMidY;
    }

    // Envia para a thread principal a decisão (pular ou não) + dados de debug para visualização.
    postMessage({
      type: 'decision',
      jump,
      debug: bird
        ? {
            // Caso o pássaro tenha sido detectado, manda a bounding box em coordenadas reais.
            bbox: { x1: bird.x1, y1: bird.y1, x2: bird.x2, y2: bird.y2 },
            gapMidY,
            birdCenterY: bird.centerY,
          }
        : {
            // Caso contrário, manda valores nulos sinalizando ausência de detecção.
            bbox: null,
            gapMidY,
            birdCenterY: null,
          },
    });
  } catch (e) {
    // Se qualquer erro acontecer no pipeline de predição, reporta para a thread principal.
    postMessage({
      type: 'error',
      message: String(e?.message ?? e),
    });
  } finally {
    // Garantia extra: se o bitmap ainda existir (ex.: erro antes do close), tenta fechá-lo aqui também.
    bitmap?.close?.();
  }
};
