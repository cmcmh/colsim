// js/main.js

const pasteBtn = document.getElementById('paste-btn');
const fileInput = document.getElementById('file-input');

const canvasOriginal = document.getElementById('canvas-original');
const canvasProtan   = document.getElementById('canvas-protan');
const canvasDeutan   = document.getElementById('canvas-deutan');
const canvasTritan   = document.getElementById('canvas-tritan');

const severityRange = document.getElementById('severity-range');
const severityValue = document.getElementById('severity-value');

let currentSeverity = 1.0;
let hasImage = false;
let machadoReady = false;

// color-sim.js で window に載せている前提
const { loadMachadoMatrices, applyCvdSimulation } = window.cvdSim || {};

if (!loadMachadoMatrices || !applyCvdSimulation) {
  console.error('cvdSim API が見つかりません。color-sim.js の読み込み順を確認してください。');
}

// ★ 起動時に1回だけ JSON をロードしておく
//    ロード完了時点で既に画像があれば、そこで reSimulate() を叩く
(async () => {
  try {
    await loadMachadoMatrices();
    machadoReady = true;
    console.log('Machado matrices loaded.');

    if (hasImage) {
      reSimulate();
    }
  } catch (e) {
    console.error(e);
    alert('色覚シミュレーション用行列の読み込みに失敗しました。');
  }
})();

// Clipboard ボタン
pasteBtn.addEventListener('click', async () => {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    alert('このブラウザは画像のClipboard読み取りに対応していないようです。ファイル選択を試してください。');
    return;
  }

  let items;
  try {
    items = await navigator.clipboard.read();
  } catch (err) {
    console.error(err);
    alert('クリップボードからの画像読み取りに失敗しました。ブラウザの権限設定や接続元(HTTPS/localhost)を確認してください。');
    return;
  }

  try {
    let handled = false;
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type);
          const img = await createImageFromBlob(blob);
          drawAllCanvases(img);
          handled = true;
          break;
        }
      }
      if (handled) break;
    }

    if (!handled) {
      alert('クリップボードに画像が見つかりませんでした。');
    }
  } catch (err) {
    console.error(err);
    alert('画像の処理中にエラーが発生しました。コンソールログを確認してください。');
  }
});

// ファイル選択
fileInput.addEventListener('change', (evt) => {
  const file = evt.target.files && evt.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    drawAllCanvases(img);
  };
  img.onerror = (err) => {
    console.error(err);
    alert('画像の読み込みに失敗しました。');
  };
  img.src = URL.createObjectURL(file);
});

let pendingFrame = null;

// severity スライダー
severityRange.addEventListener('input', () => {
  currentSeverity = parseFloat(severityRange.value);
  severityValue.textContent = currentSeverity.toFixed(2);

  if (!hasImage || !machadoReady) return;

  // すでに「次のフレームで描画予約」があるなら何もしない
  if (pendingFrame !== null) return;

  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    reSimulate();
  });
});

function createImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

function drawAllCanvases(img) {
  const isSmallScreen = window.innerWidth <= 600;
  const maxWidth = isSmallScreen ? 480 : 800; // スマホなら少し小さめに
  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvases = [canvasOriginal, canvasProtan, canvasDeutan, canvasTritan];
  canvases.forEach((c) => {
    c.width = w;
    c.height = h;
  });

  const ctxOriginal = canvasOriginal.getContext('2d', { willReadFrequently: true });
  ctxOriginal.clearRect(0, 0, w, h);
  ctxOriginal.drawImage(img, 0, 0, w, h);

  hasImage = true;

  // ★ もしすでに machadoReady ならその場で再描画
  if (machadoReady) {
    reSimulate();
  }
}

// ★ シンプルな同期版 reSimulate
function reSimulate() {
  if (!hasImage || !machadoReady) return;

  applyCvdSimulation(canvasOriginal, canvasProtan, 'protan', currentSeverity);
  applyCvdSimulation(canvasOriginal, canvasDeutan, 'deutan', currentSeverity);
  applyCvdSimulation(canvasOriginal, canvasTritan, 'tritan', currentSeverity);
}
