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
 * Genera un conjunto de texturas PBR procedurales (albedo, metallicRoughness con charcos
 * y mapa de relieve) para simular asfalto mojado nocturno con reflejos estirados.
 */
export function createWetAsphaltTextures(
  scene: Scene,
  uScale = 4.0,
  vScale = 34,
): WetAsphaltTextureSet {
  const size = 512;
  const rand = createPrng(20261116);

  const albedo = createCanvas2D(size, size);
  const mr = createCanvas2D(size, size);
  const bump = createCanvas2D(size, size);

  const puddleMask = new Float32Array(size * size);
  const puddleCenters: Array<{ x: number; y: number; rx: number; ry: number }> = [];
  for (let i = 0; i < 16; i += 1) {
    puddleCenters.push({
      x: rand() * size,
      y: rand() * size,
      rx: 28 + rand() * 72,
      ry: 45 + rand() * 110,
    });
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let maxPool = 0;
      for (const p of puddleCenters) {
        const dx = Math.min(Math.abs(x - p.x), size - Math.abs(x - p.x)) / p.rx;
        const dy = Math.min(Math.abs(y - p.y), size - Math.abs(y - p.y)) / p.ry;
        const distSq = dx * dx + dy * dy;
        if (distSq < 1) {
          const strength = (1 - distSq) * (1 - distSq);
          if (strength > maxPool) {
            maxPool = strength;
          }
        }
      }
      puddleMask[y * size + x] = maxPool;
    }
  }

  const albedoData = albedo.ctx.createImageData(size, size);
  const mrData = mr.ctx.createImageData(size, size);
  const heightMap = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const offset = idx * 4;
      const pool = puddleMask[idx] ?? 0;
      const grain = rand();
      const fineSpeck = grain > 0.94 ? 12 : grain < 0.08 ? -8 : (grain - 0.5) * 9;

      const trackFactor = Math.sin((x / size) * Math.PI * 6) * 2.5;
      const baseTone = 24 - pool * 10 + fineSpeck * (1 - pool * 0.72) + trackFactor;
      const clampedTone = Math.max(8, Math.min(54, baseTone));

      albedoData.data[offset] = clampedTone * 0.92;
      albedoData.data[offset + 1] = clampedTone * 0.96;
      albedoData.data[offset + 2] = clampedTone * 1.1;
      albedoData.data[offset + 3] = 255;

      const roughness = Math.round(
        Math.max(18, Math.min(155, 128 - pool * 104 + (grain - 0.5) * 18)),
      );
      const metallic = Math.round(14 + pool * 28);

      mrData.data[offset] = 0;
      mrData.data[offset + 1] = roughness;
      mrData.data[offset + 2] = metallic;
      mrData.data[offset + 3] = 255;

      heightMap[idx] = grain * (1 - pool * 0.92);
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

      const dx = (hL - hR) * 1.4;
      const dy = (hU - hD) * 1.4;
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
        const color =
          toneRoll < 0.56 ? '#d9a45b' : toneRoll < 0.86 ? '#a9c7e8' : '#7ac2db';
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
