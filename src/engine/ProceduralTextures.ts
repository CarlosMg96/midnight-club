import { DynamicTexture, Texture, type Scene } from '@babylonjs/core';

export interface WetAsphaltTextureSet {
  readonly albedoTexture: DynamicTexture;
  readonly metallicRoughnessTexture: DynamicTexture;
  readonly bumpTexture: DynamicTexture;
}

export interface BuildingTextureSet {
  readonly albedoTexture: DynamicTexture;
  readonly emissiveTexture: DynamicTexture;
}

export interface NeonSignOptions {
  readonly name: string;
  readonly text: string;
  readonly primaryColor: string;
  readonly secondaryColor?: string;
  readonly backgroundColor?: string;
  readonly vertical?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly showBorder?: boolean;
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvas2D(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto 2D para texturas procedurales.');
  }
  return { canvas, ctx };
}

function copyCanvasToDynamicTexture(
  name: string,
  sourceCanvas: HTMLCanvasElement,
  scene: Scene,
  hasAlpha = false,
): DynamicTexture {
  const texture = new DynamicTexture(
    name,
    { width: sourceCanvas.width, height: sourceCanvas.height },
    scene,
    true,
  );
  texture.hasAlpha = hasAlpha;
  const targetCtx = texture.getContext();
  targetCtx.drawImage(sourceCanvas, 0, 0);
  texture.update(true);
  return texture;
}

function configureRepeatingTexture(texture: Texture, uScale: number, vScale: number): void {
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = uScale;
  texture.vScale = vScale;
}

/**
 * Genera un conjunto de texturas PBR procedurales (albedo, metallicRoughness mate
 * y mapa de relieve con agregado mineral y juntas de alquitrán) para simular
 * asfalto urbano realista sin efecto espejo.
 */
export function createWetAsphaltTextures(
  scene: Scene,
  uScale = 6.0,
  vScale = 48,
): WetAsphaltTextureSet {
  const size = 512;
  const halfSize = size >> 1;
  const rand = createPrng(20261116);

  const albedo = createCanvas2D(size, size);
  const mr = createCanvas2D(size, size);
  const bump = createCanvas2D(size, size);

  // Gravilla media en celdas de 2x2 píxeles para agregado mineral creíble
  const coarseGravel = new Float32Array(halfSize * halfSize);
  for (let i = 0; i < coarseGravel.length; i += 1) {
    coarseGravel[i] = rand();
  }

  const albedoData = albedo.ctx.createImageData(size, size);
  const mrData = mr.ctx.createImageData(size, size);
  const heightMap = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    const coarseRowOffset = (y >> 1) * halfSize;
    const isTransverseSeam = y % 256 === 0;
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const offset = idx * 4;

      const fineGrain = rand();
      const mediumGravel = coarseGravel[coarseRowOffset + (x >> 1)] ?? 0.5;
      const trackCos = Math.cos((x / size) * Math.PI * 4);
      const trackBand = trackCos * 4.5;
      const isTireTrack = trackCos > 0.35;
      const isLongitudinalSeam = Math.abs(x - 170) <= 1 || Math.abs(x - 342) <= 1;
      const isTarSeam = isLongitudinalSeam || isTransverseSeam;

      let tone: number;
      if (isTarSeam) {
        tone = 34 + fineGrain * 8;
      } else {
        const aggregateSpeck =
          mediumGravel > 0.88 && fineGrain > 0.45
            ? 24
            : mediumGravel < 0.14
              ? -12
              : (mediumGravel - 0.5) * 16 + (fineGrain - 0.5) * 18;
        tone = 64 + aggregateSpeck + trackBand;
      }

      const maxTone = isTarSeam ? 42 : mediumGravel > 0.88 ? 98 : 92;
      const minTone = isTarSeam ? 34 : 42;
      const clampedTone = Math.max(minTone, Math.min(maxTone, tone));

      albedoData.data[offset] = Math.round(clampedTone * 0.96);
      albedoData.data[offset + 1] = Math.round(clampedTone * 0.98);
      albedoData.data[offset + 2] = Math.round(Math.min(255, clampedTone * 1.02));
      albedoData.data[offset + 3] = 255;

      const roughnessBase = isTireTrack
        ? 184 + fineGrain * 20
        : isTarSeam
          ? 198 + fineGrain * 20
          : 205 + fineGrain * 22 + mediumGravel * 17;
      const roughness = Math.round(
        isTireTrack
          ? Math.max(184, Math.min(204, roughnessBase))
          : Math.max(205, Math.min(244, roughnessBase)),
      );
      const metallic = Math.round(4 + fineGrain * 6);

      mrData.data[offset] = 0;
      mrData.data[offset + 1] = roughness;
      mrData.data[offset + 2] = metallic;
      mrData.data[offset + 3] = 255;

      heightMap[idx] = isTarSeam ? 0.15 + fineGrain * 0.15 : fineGrain * 0.55 + mediumGravel * 0.45;
    }
  }

  albedo.ctx.putImageData(albedoData, 0, 0);
  mr.ctx.putImageData(mrData, 0, 0);

  const bumpData = bump.ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    const yPrev = (y - 1 + size) % size;
    const yNext = (y + 1) % size;
    for (let x = 0; x < size; x += 1) {
      const xPrev = (x - 1 + size) % size;
      const xNext = (x + 1) % size;

      const hL = heightMap[y * size + xPrev] ?? 0;
      const hR = heightMap[y * size + xNext] ?? 0;
      const hU = heightMap[yPrev * size + x] ?? 0;
      const hD = heightMap[yNext * size + x] ?? 0;

      const dx = (hL - hR) * 2.2;
      const dy = (hU - hD) * 2.2;
      const offset = (y * size + x) * 4;

      bumpData.data[offset] = Math.round(Math.max(0, Math.min(255, 128 + dx * 127)));
      bumpData.data[offset + 1] = Math.round(Math.max(0, Math.min(255, 128 + dy * 127)));
      bumpData.data[offset + 2] = 245;
      bumpData.data[offset + 3] = 255;
    }
  }
  bump.ctx.putImageData(bumpData, 0, 0);

  const albedoTexture = copyCanvasToDynamicTexture('wet-asphalt-albedo', albedo.canvas, scene);
  const metallicRoughnessTexture = copyCanvasToDynamicTexture('wet-asphalt-mr', mr.canvas, scene);
  const bumpTexture = copyCanvasToDynamicTexture('wet-asphalt-bump', bump.canvas, scene);

  configureRepeatingTexture(albedoTexture, uScale, vScale);
  configureRepeatingTexture(metallicRoughnessTexture, uScale, vScale);
  configureRepeatingTexture(bumpTexture, uScale, vScale);

  return { albedoTexture, metallicRoughnessTexture, bumpTexture };
}

/**
 * Crea la textura equirectangular crepuscular con nubes iluminadas en el horizonte.
 */
export function createDuskSkyTexture(scene: Scene): DynamicTexture {
  const width = 1024;
  const height = 512;
  const { canvas, ctx } = createCanvas2D(width, height);
  const rand = createPrng(99104);

  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0.0, '#040814');
  skyGradient.addColorStop(0.28, '#0b142b');
  skyGradient.addColorStop(0.45, '#192848');
  skyGradient.addColorStop(0.54, '#503740');
  skyGradient.addColorStop(0.58, '#8a5038');
  skyGradient.addColorStop(0.62, '#1f2538');
  skyGradient.addColorStop(1.0, '#05070d');

  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  const horizonGlow = ctx.createRadialGradient(
    width * 0.28,
    height * 0.56,
    10,
    width * 0.28,
    height * 0.56,
    width * 0.28,
  );
  horizonGlow.addColorStop(0, 'rgba(255, 168, 96, 0.45)');
  horizonGlow.addColorStop(0.45, 'rgba(196, 98, 70, 0.2)');
  horizonGlow.addColorStop(1, 'rgba(30, 38, 68, 0)');
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, height * 0.3, width, height * 0.36);

  for (let i = 0; i < 65; i += 1) {
    const cx = rand() * width;
    const cy = height * (0.14 + rand() * 0.38);
    const rx = 45 + rand() * 140;
    const ry = 8 + rand() * 22;
    const nearHorizon = cy > height * 0.38;

    const cloudGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
    if (nearHorizon) {
      cloudGrad.addColorStop(0, 'rgba(34, 38, 58, 0.65)');
      cloudGrad.addColorStop(0.7, 'rgba(128, 80, 68, 0.22)');
      cloudGrad.addColorStop(1, 'rgba(20, 26, 48, 0)');
    } else {
      cloudGrad.addColorStop(0, 'rgba(14, 20, 38, 0.68)');
      cloudGrad.addColorStop(1, 'rgba(10, 16, 32, 0)');
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = cloudGrad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const skyTexture = copyCanvasToDynamicTexture('dusk-sky-dome', canvas, scene);
  skyTexture.wrapU = Texture.WRAP_ADDRESSMODE;
  skyTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return skyTexture;
}

/**
 * Genera mapas separados de albedo (muros/marcos arquitectónicos oscuros) y emissive
 * (fondo #000000 puro + ventanas iluminadas individuales) para evitar resplandor blanco en muros.
 */
export function createBuildingWindowTexture(
  scene: Scene,
  seed: number,
  facadeTint = '#171c29',
  uScale = 1,
  vScale = 1,
): BuildingTextureSet {
  const width = 256;
  const height = 512;
  const albedo = createCanvas2D(width, height);
  const emissive = createCanvas2D(width, height);
  const rand = createPrng(seed);

  albedo.ctx.fillStyle = facadeTint;
  albedo.ctx.fillRect(0, 0, width, height);

  // Fondo negro puro en emissive para que el concreto y marcos nunca emitan luz
  emissive.ctx.fillStyle = '#000000';
  emissive.ctx.fillRect(0, 0, width, height);

  const cols = 10;
  const rows = 24;
  const cellW = width / cols;
  const cellH = height / rows;

  // Bandas horizontales de losa de entrepiso en albedo
  albedo.ctx.fillStyle = '#0f131d';
  for (let row = 0; row < rows; row += 1) {
    albedo.ctx.fillRect(0, row * cellH, width, 3);
  }

  for (let row = 1; row < rows - 1; row += 1) {
    const floorOccupancy = 0.2 + rand() * 0.4;
    for (let col = 0; col < cols; col += 1) {
      const litRoll = rand();
      const x = col * cellW + 4;
      const y = row * cellH + 5;
      const w = cellW - 8;
      const h = cellH - 9;

      if (litRoll < floorOccupancy) {
        const toneRoll = rand();
        const color = toneRoll < 0.56 ? '#d9a45b' : toneRoll < 0.86 ? '#a9c7e8' : '#7ac2db';
        albedo.ctx.fillStyle = color;
        albedo.ctx.fillRect(x, y, w, h);

        emissive.ctx.fillStyle = color;
        emissive.ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      } else {
        albedo.ctx.fillStyle = '#0a0f1a';
        albedo.ctx.fillRect(x, y, w, h);
      }
    }
  }

  const albedoTexture = copyCanvasToDynamicTexture(`building-albedo-${seed}`, albedo.canvas, scene);
  const emissiveTexture = copyCanvasToDynamicTexture(
    `building-emissive-${seed}`,
    emissive.canvas,
    scene,
  );
  configureRepeatingTexture(albedoTexture, uScale, vScale);
  configureRepeatingTexture(emissiveTexture, uScale, vScale);

  return { albedoTexture, emissiveTexture };
}

/**
 * Renderiza un letrero luminoso de neón con contorno brillante y halo para calles urbanas.
 */
export function createNeonSignTexture(scene: Scene, options: NeonSignOptions): DynamicTexture {
  const width = options.width ?? (options.vertical ? 192 : 512);
  const height = options.height ?? (options.vertical ? 512 : 160);
  const { canvas, ctx } = createCanvas2D(width, height);

  ctx.fillStyle = options.backgroundColor ?? '#060912';
  ctx.fillRect(0, 0, width, height);

  if (options.showBorder !== false) {
    const borderColor = options.secondaryColor ?? options.primaryColor;
    ctx.save();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 5;
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 14;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.shadowBlur = 0;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.restore();
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = options.primaryColor;
  ctx.shadowBlur = 16;

  if (options.vertical) {
    const chars = options.text.split('');
    const step = (height - 48) / Math.max(chars.length, 1);
    const fontSize = Math.min(46, Math.floor(step * 0.8));
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;

    chars.forEach((char, idx) => {
      const y = 30 + step * (idx + 0.5);
      ctx.fillStyle = options.primaryColor;
      ctx.fillText(char, width / 2, y);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.55;
      ctx.fillText(char, width / 2, y);
      ctx.globalAlpha = 1;
    });
  } else {
    const fontSize = Math.min(
      64,
      Math.floor((width - 48) / Math.max(options.text.length * 0.58, 1)),
    );
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = options.primaryColor;
    ctx.fillText(options.text, width / 2, height / 2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.55;
    ctx.fillText(options.text, width / 2, height / 2);
  }
  ctx.restore();

  return copyCanvasToDynamicTexture(options.name, canvas, scene);
}

/**
 * Crea la textura de la placa frontal blanca con tipografía TSURU o CDMX.
 */
export function createTsuruPlateTexture(scene: Scene, text = 'TSURU'): DynamicTexture {
  const width = 256;
  const height = 96;
  const { canvas, ctx } = createCanvas2D(width, height);

  ctx.fillStyle = '#f2f4f7';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#2a303c';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, width - 8, height - 8);

  ctx.fillStyle = '#141922';
  ctx.font = '800 44px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 2);

  return copyCanvasToDynamicTexture(`plate-${text}`, canvas, scene);
}

/**
 * Genera una textura de tapón/rin metálico con 7 orificios radiales estilo Nissan Tsuru.
 */
export function createHubcapTexture(scene: Scene, rimHex = '#c9d1dc'): DynamicTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas2D(size, size);
  const cx = size / 2;
  const cy = size / 2;

  ctx.fillStyle = '#181c24';
  ctx.fillRect(0, 0, size, size);

  const grad = ctx.createRadialGradient(cx, cy, 12, cx, cy, 118);
  grad.addColorStop(0, '#eef2f7');
  grad.addColorStop(0.65, rimHex);
  grad.addColorStop(1, '#7c8492');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 116, 0, Math.PI * 2);
  ctx.fill();

  // Ranuras radiales del tapón clásico de 7 orificios
  ctx.fillStyle = '#1b2029';
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * 68, cy + Math.sin(angle) * 68);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Emblema central
  ctx.strokeStyle = '#525b68';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.stroke();

  return copyCanvasToDynamicTexture(`hubcap-${rimHex}`, canvas, scene);
}

/**
 * Crea una textura suave radial para partículas de humo de neumáticos en derrape.
 */
export function createSmokeTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const { canvas, ctx } = createCanvas2D(size, size);
  const rand = createPrng(4096);

  ctx.clearRect(0, 0, size, size);

  for (let i = 0; i < 6; i += 1) {
    const ox = size / 2 + (rand() - 0.5) * 24;
    const oy = size / 2 + (rand() - 0.5) * 24;
    const r = 28 + rand() * 24;
    const grad = ctx.createRadialGradient(ox, oy, 2, ox, oy, r);
    grad.addColorStop(0, 'rgba(235, 240, 250, 0.34)');
    grad.addColorStop(0.55, 'rgba(195, 206, 224, 0.16)');
    grad.addColorStop(1, 'rgba(170, 182, 205, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return copyCanvasToDynamicTexture('tire-smoke-puff', canvas, scene, true);
}

/**
 * Textura de fachada diagrid tricolor (verde/blanco/rojo) estilo Torre BBVA Reforma.
 */
export function createBbvaTowerTexture(scene: Scene): BuildingTextureSet {
  const width = 256;
  const height = 512;
  const albedo = createCanvas2D(width, height);
  const emissive = createCanvas2D(width, height);
  const rand = createPrng(8801);

  albedo.ctx.fillStyle = '#0c1320';
  albedo.ctx.fillRect(0, 0, width, height);
  emissive.ctx.fillStyle = '#000000';
  emissive.ctx.fillRect(0, 0, width, height);

  const cols = 12;
  const rows = 26;
  const cellW = width / cols;
  const cellH = height / rows;

  for (let row = 1; row < rows - 1; row += 1) {
    // Terraza sky-garden oscura a mitad de la torre
    if (row === 10 || row === 11 || row === 19) {
      continue;
    }
    for (let col = 0; col < cols; col += 1) {
      const x = col * cellW + 2;
      const y = row * cellH + 3;
      const w = cellW - 4;
      const h = cellH - 5;

      const u = col / cols;
      const tricolor = u < 0.34 ? '#0da857' : u < 0.67 ? '#d7e6f5' : '#cf1f3c';
      const intensity = 0.55 + rand() * 0.45;

      albedo.ctx.fillStyle = tricolor;
      albedo.ctx.globalAlpha = 0.72 * intensity;
      albedo.ctx.fillRect(x, y, w, h);

      emissive.ctx.fillStyle = tricolor;
      emissive.ctx.globalAlpha = 0.68 * intensity;
      emissive.ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    }
  }
  albedo.ctx.globalAlpha = 1;
  emissive.ctx.globalAlpha = 1;

  // Celosía diagonal (diagrid) estructural oscura característica de Torre BBVA
  for (const target of [albedo.ctx, emissive.ctx]) {
    target.strokeStyle = target === emissive.ctx ? '#000000' : '#0b1019';
    target.lineWidth = 4;
    for (let i = -height; i < width + height; i += 44) {
      target.beginPath();
      target.moveTo(i, 0);
      target.lineTo(i + height * 0.55, height);
      target.stroke();

      target.beginPath();
      target.moveTo(i, height);
      target.lineTo(i + height * 0.55, 0);
      target.stroke();
    }
  }

  return {
    albedoTexture: copyCanvasToDynamicTexture('bbva-albedo', albedo.canvas, scene),
    emissiveTexture: copyCanvasToDynamicTexture('bbva-emissive', emissive.canvas, scene),
  };
}

/**
 * Textura de bandas horizontales de cristal y aluminio estilo Hotel St. Regis Reforma.
 */
export function createStRegisTowerTexture(scene: Scene): BuildingTextureSet {
  const width = 256;
  const height = 512;
  const albedo = createCanvas2D(width, height);
  const emissive = createCanvas2D(width, height);
  const rand = createPrng(8802);

  albedo.ctx.fillStyle = '#121926';
  albedo.ctx.fillRect(0, 0, width, height);
  emissive.ctx.fillStyle = '#000000';
  emissive.ctx.fillRect(0, 0, width, height);

  const rows = 28;
  const rowH = height / rows;
  for (let row = 1; row < rows - 2; row += 1) {
    // Franja horizontal de losa clara metálica
    albedo.ctx.fillStyle = '#2b3446';
    albedo.ctx.fillRect(0, row * rowH, width, 4);

    // Bandas de cristal horizontales con suites iluminadas dispersas
    const cols = 10;
    const colW = width / cols;
    for (let col = 0; col < cols; col += 1) {
      if (rand() < 0.28) {
        const tone = rand() < 0.65 ? '#e4ba78' : '#b7d6f0';
        albedo.ctx.fillStyle = tone;
        albedo.ctx.fillRect(col * colW + 2, row * rowH + 5, colW - 4, rowH - 8);
        emissive.ctx.fillStyle = tone;
        emissive.ctx.fillRect(col * colW + 3, row * rowH + 6, colW - 6, rowH - 10);
      } else {
        albedo.ctx.fillStyle = '#0a101b';
        albedo.ctx.fillRect(col * colW + 2, row * rowH + 5, colW - 4, rowH - 8);
      }
    }
  }

  return {
    albedoTexture: copyCanvasToDynamicTexture('stregis-albedo', albedo.canvas, scene),
    emissiveTexture: copyCanvasToDynamicTexture('stregis-emissive', emissive.canvas, scene),
  };
}

/**
 * Textura de concreto oscuro con ranuras verticales luminosas estilo Torre Reforma.
 */
export function createTorreReformaTexture(scene: Scene): BuildingTextureSet {
  const width = 256;
  const height = 512;
  const albedo = createCanvas2D(width, height);
  const emissive = createCanvas2D(width, height);
  const rand = createPrng(8803);

  albedo.ctx.fillStyle = '#151922';
  albedo.ctx.fillRect(0, 0, width, height);
  emissive.ctx.fillStyle = '#000000';
  emissive.ctx.fillRect(0, 0, width, height);

  const slitX = [68, 126, 184];
  for (const sx of slitX) {
    albedo.ctx.fillStyle = '#0a0d14';
    albedo.ctx.fillRect(sx - 8, 24, 16, height - 48);

    for (let y = 32; y < height - 44; y += 16) {
      if (rand() < 0.62) {
        const color = rand() < 0.6 ? '#ffe2aa' : '#a8d5ff';
        albedo.ctx.fillStyle = color;
        albedo.ctx.fillRect(sx - 5, y, 10, 10);
        emissive.ctx.fillStyle = color;
        emissive.ctx.fillRect(sx - 4, y + 1, 8, 8);
      }
    }
  }

  return {
    albedoTexture: copyCanvasToDynamicTexture('torre-reforma-albedo', albedo.canvas, scene),
    emissiveTexture: copyCanvasToDynamicTexture('torre-reforma-emissive', emissive.canvas, scene),
  };
}

/**
 * Textura de iluminación tricolor mexicano (verde, blanco, rojo) sobre la columna del Ángel.
 */
export function createAngelColumnTricolorTexture(scene: Scene): BuildingTextureSet {
  const width = 256;
  const height = 512;
  const albedo = createCanvas2D(width, height);
  const emissive = createCanvas2D(width, height);

  albedo.ctx.fillStyle = '#c8c3ba';
  albedo.ctx.fillRect(0, 0, width, height);

  // Estrías verticales sutiles de mármol
  albedo.ctx.fillStyle = 'rgba(20, 22, 28, 0.14)';
  for (let x = 0; x < width; x += 12) {
    albedo.ctx.fillRect(x, 0, 3, height);
  }

  // Baño tricolor suave (verde en base -> blanco centro -> rojo superior, como en la foto real)
  const triGrad = emissive.ctx.createLinearGradient(0, height, 0, 0);
  triGrad.addColorStop(0.0, '#10a854');
  triGrad.addColorStop(0.28, '#1ec468');
  triGrad.addColorStop(0.45, '#e8eef5');
  triGrad.addColorStop(0.62, '#f2dfe4');
  triGrad.addColorStop(0.78, '#df1d42');
  triGrad.addColorStop(1.0, '#d8163a');

  emissive.ctx.fillStyle = triGrad;
  emissive.ctx.fillRect(0, 0, width, height);

  // Oscurece levemente los flancos para acentuar volumen cilíndrico
  const shadeGrad = emissive.ctx.createLinearGradient(0, 0, width, 0);
  shadeGrad.addColorStop(0, 'rgba(0,0,0,0.45)');
  shadeGrad.addColorStop(0.5, 'rgba(0,0,0,0.0)');
  shadeGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
  emissive.ctx.fillStyle = shadeGrad;
  emissive.ctx.fillRect(0, 0, width, height);

  return {
    albedoTexture: copyCanvasToDynamicTexture('angel-tricolor-albedo', albedo.canvas, scene),
    emissiveTexture: copyCanvasToDynamicTexture('angel-tricolor-emissive', emissive.canvas, scene),
  };
}

/**
 * Señalización vial verde reflectiva de Ciudad de México (Paseo de la Reforma).
 */
export function createRoadSignTexture(scene: Scene, lines: readonly string[]): DynamicTexture {
  const width = 512;
  const height = 192;
  const { canvas, ctx } = createCanvas2D(width, height);

  ctx.fillStyle = '#0b5d34';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#edf2f7';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 36px system-ui, -apple-system, sans-serif';

  const step = (height - 32) / Math.max(lines.length, 1);
  lines.forEach((line, idx) => {
    ctx.fillText(line, width / 2, 22 + step * (idx + 0.5));
  });

  return copyCanvasToDynamicTexture(`road-sign-${lines.join('-')}`, canvas, scene);
}

/**
 * Señalización preventiva amarilla reflectiva para curvas cerradas (chevrons >>> / <<<).
 */
export function createChevronSignTexture(
  scene: Scene,
  direction: 'LEFT' | 'RIGHT',
): DynamicTexture {
  const width = 256;
  const height = 192;
  const { canvas, ctx } = createCanvas2D(width, height);

  ctx.fillStyle = '#ffbe0b';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#111419';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, width - 16, height - 16);

  ctx.strokeStyle = '#111419';
  ctx.lineWidth = 18;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';

  const dir = direction === 'RIGHT' ? 1 : -1;
  for (const cx of [64, 128, 192]) {
    ctx.beginPath();
    ctx.moveTo(cx - 22 * dir, 36);
    ctx.lineTo(cx + 16 * dir, 76);
    ctx.lineTo(cx - 22 * dir, 116);
    ctx.stroke();
  }

  ctx.fillStyle = '#111419';
  ctx.fillRect(14, 138, width - 28, 38);

  ctx.fillStyle = '#ffbe0b';
  ctx.font = '900 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CURVA CERRADA', width / 2, 158);

  return copyCanvasToDynamicTexture(`chevron-sign-${direction}`, canvas, scene);
}

/**
 * Crea textura suave para llamaradas de contraexplosión (backfire) en escapes.
 */
export function createFlameTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const { canvas, ctx } = createCanvas2D(size, size);

  ctx.clearRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, 56);
  grad.addColorStop(0, 'rgba(255, 255, 240, 1)');
  grad.addColorStop(0.28, 'rgba(255, 196, 68, 0.92)');
  grad.addColorStop(0.58, 'rgba(255, 92, 24, 0.55)');
  grad.addColorStop(0.82, 'rgba(92, 168, 255, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 56, 0, Math.PI * 2);
  ctx.fill();

  return copyCanvasToDynamicTexture('exhaust-backfire-flame', canvas, scene, true);
}
