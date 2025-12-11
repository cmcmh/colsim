// js/color-sim.js

(function () {
  let MACHADO_TABLE = null;

  /**
   * Machado 2009 プリセット行列を JSON から読み込む
   * 一度読み込んだら MACHADO_TABLE にキャッシュ
   */
  async function loadMachadoMatrices(url = 'data/machado_matrices.json') {
    if (MACHADO_TABLE) return MACHADO_TABLE;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
    }
    MACHADO_TABLE = await res.json();
    return MACHADO_TABLE;
  }

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(c) {
    return c <= 0.0031308
      ? 12.92 * c
      : 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
  }

  /**
   * 2つの 3x3 行列 a, b を t で線形補間する
   */
  function lerpMatrix(a, b, t) {
    const out = [[], [], []];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        out[r][c] = a[r][c] * (1 - t) + b[r][c] * t;
      }
    }
    return out;
  }

  /**
   * 既にロード済みの MACHADO_TABLE から、
   * mode / severity に応じた 3x3 行列を線形補間で取得する
   */
  function getMachadoMatrixSync(mode, severity) {
    if (!MACHADO_TABLE) {
      console.warn('MACHADO_TABLE is not loaded yet');
      return null;
    }
    const table = MACHADO_TABLE[mode];
    if (!table) {
      console.warn('Unknown mode:', mode);
      return null;
    }

    const s = clamp01(severity);

    // JSONのキーは "0.0","0.1",..., "1.0" を想定
    const sampleKeys = Object.keys(table)
      .map(parseFloat)
      .filter((v) => !Number.isNaN(v))
      .sort((a, b) => a - b);

    if (sampleKeys.length === 0) {
      console.warn('No severity entries in table for mode', mode);
      return null;
    }

    const keyFromNum = (x) => x.toFixed(1); // Python側と揃えて小数1桁

    // 端はクランプ
    if (s <= sampleKeys[0]) {
      return table[keyFromNum(sampleKeys[0])];
    }
    if (s >= sampleKeys[sampleKeys.length - 1]) {
      return table[keyFromNum(sampleKeys[sampleKeys.length - 1])];
    }

    // s がどの区間にいるか探す
    let k0 = sampleKeys[0];
    let k1 = sampleKeys[1];
    for (let i = 0; i < sampleKeys.length - 1; i++) {
      const a = sampleKeys[i];
      const b = sampleKeys[i + 1];
      if (s >= a && s <= b) {
        k0 = a;
        k1 = b;
        break;
      }
    }

    const m0 = table[keyFromNum(k0)];
    const m1 = table[keyFromNum(k1)];
    if (!m0 || !m1) {
      console.warn('Matrix missing for severities', k0, k1, 'mode', mode);
      return null;
    }

    const t = (s - k0) / (k1 - k0); // 0〜1
    return lerpMatrix(m0, m1, t);
  }

  /**
   * sRGB(0-255) -> 線形RGB -> 3x3行列 -> sRGB(0-255)
   */
  function transformRgbWithMatrix_srgbLinear(r, g, b, mat) {
    let R = r / 255;
    let G = g / 255;
    let B = b / 255;

    // sRGB -> 線形
    R = srgbToLinear(R);
    G = srgbToLinear(G);
    B = srgbToLinear(B);

    const R2 = mat[0][0] * R + mat[0][1] * G + mat[0][2] * B;
    const G2 = mat[1][0] * R + mat[1][1] * G + mat[1][2] * B;
    const B2 = mat[2][0] * R + mat[2][1] * G + mat[2][2] * B;

    let R3 = linearToSrgb(R2);
    let G3 = linearToSrgb(G2);
    let B3 = linearToSrgb(B2);

    const outR = clamp01(R3) * 255;
    const outG = clamp01(G3) * 255;
    const outB = clamp01(B3) * 255;

    return [outR, outG, outB].map((x) => Math.round(x));
  }

  /**
   * CVDシミュレーション本体
   */
  function applyCvdSimulation(srcCanvas, dstCanvas, mode, severity = 1.0) {
    const mat = getMachadoMatrixSync(mode, severity);
    if (!mat) return;

    const w = srcCanvas.width;
    const h = srcCanvas.height;
    if (!w || !h) return;

    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true });

    const srcImage = srcCtx.getImageData(0, 0, w, h);
    const dstImage = dstCtx.createImageData(w, h);

    const srcData = srcImage.data;
    const dstData = dstImage.data;

    for (let i = 0; i < srcData.length; i += 4) {
      const r = srcData[i];
      const g = srcData[i + 1];
      const b = srcData[i + 2];
      const a = srcData[i + 3];

      const [nr, ng, nb] = transformRgbWithMatrix_srgbLinear(r, g, b, mat);

      dstData[i]     = nr;
      dstData[i + 1] = ng;
      dstData[i + 2] = nb;
      dstData[i + 3] = a;
    }

    dstCtx.putImageData(dstImage, 0, 0);
  }

  // グローバルに公開
  window.cvdSim = {
    loadMachadoMatrices,
    applyCvdSimulation,
  };
})();
