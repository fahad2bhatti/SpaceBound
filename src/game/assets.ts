import * as THREE from "three";

function hash3(ix: number, iy: number, iz: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);
  return l(
    l(l(n000, n100, ux), l(n010, n110, ux), uy),
    l(l(n001, n101, ux), l(n011, n111, ux), uy),
    uz,
  );
}

function fbm(x: number, y: number, z: number): number {
  let a = 0;
  let f = 1;
  let amp = 0.5;
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    a += noise3(x * f, y * f, z * f) * amp;
    sum += amp;
    f *= 2.05;
    amp *= 0.5;
  }
  return a / sum;
}

function sphereDir(u: number, v: number): [number, number, number] {
  const theta = u * Math.PI * 2;
  const phi = v * Math.PI;
  const sp = Math.sin(phi);
  return [sp * Math.cos(theta), Math.cos(phi), sp * Math.sin(theta)];
}

function canvasTex(w: number, h: number, paint: (img: ImageData, w: number, h: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  const img = ctx.createImageData(w, h);
  paint(img, w, h);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function paintEarth(img: ImageData, w: number, h: number): void {
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const [sx, sy, sz] = sphereDir(u, v);
      const n = fbm(sx * 2.4, sy * 2.4, sz * 2.4);
      const n2 = fbm(sx * 5.5 + 4, sy * 5.5, sz * 5.5);
      const pole = Math.abs(v - 0.5);
      const i = (y * w + x) * 4;
      let r: number;
      let g: number;
      let b: number;
      if (pole > 0.4) {
        const ice = (pole - 0.4) / 0.1;
        r = 210 + ice * 30;
        g = 220 + ice * 25;
        b = 230;
      } else if (n > 0.54) {
        const desert = n2 > 0.58;
        if (desert) {
          r = 168;
          g = 142;
          b = 96;
        } else if (n2 > 0.46) {
          r = 86;
          g = 120;
          b = 72;
        } else {
          r = 46;
          g = 92;
          b = 64;
        }
        const shade = (n - 0.54) * 80;
        r += shade;
        g += shade * 0.6;
        b += shade * 0.3;
      } else {
        const depth = (0.54 - n) * 1.4;
        r = 18 + depth * 10;
        g = 70 + (1 - depth) * 50;
        b = 120 + (1 - depth) * 70;
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
}

function paintCloud(img: ImageData, w: number, h: number): void {
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sx, sy, sz] = sphereDir(x / w, y / h);
      const n = fbm(sx * 3.2 + 2, sy * 3.2, sz * 3.2);
      const a = Math.max(0, (n - 0.52) * 3.2);
      const i = (y * w + x) * 4;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = Math.min(255, a * 180);
    }
  }
}

function paintMoon(img: ImageData, w: number, h: number): void {
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const [sx, sy, sz] = sphereDir(u, v);
      let n = fbm(sx * 4, sy * 4, sz * 4);
      const crater = (cx: number, cy: number, r: number, depth: number) => {
        const du = Math.min(Math.abs(u - cx), 1 - Math.abs(u - cx));
        const dv = v - cy;
        const dist = Math.hypot(du * 2, dv);
        if (dist < r) n -= depth * (1 - dist / r);
      };
      crater(0.2, 0.35, 0.08, 0.25);
      crater(0.55, 0.6, 0.12, 0.3);
      crater(0.72, 0.28, 0.05, 0.18);
      crater(0.4, 0.48, 0.04, 0.12);
      crater(0.15, 0.7, 0.07, 0.2);
      const g = 150 + n * 90;
      const i = (y * w + x) * 4;
      d[i] = g;
      d[i + 1] = g + 2;
      d[i + 2] = g + 6;
      d[i + 3] = 255;
    }
  }
}

function paintMars(img: ImageData, w: number, h: number): void {
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sx, sy, sz] = sphereDir(x / w, y / h);
      const n = fbm(sx * 3.1, sy * 3.1, sz * 3.1);
      const pole = Math.abs(y / h - 0.5) > 0.42;
      const i = (y * w + x) * 4;
      if (pole) {
        d[i] = 230;
        d[i + 1] = 220;
        d[i + 2] = 210;
      } else {
        d[i] = 150 + n * 80;
        d[i + 1] = 70 + n * 40;
        d[i + 2] = 42 + n * 20;
      }
      d[i + 3] = 255;
    }
  }
}

function paintBands(img: ImageData, w: number, h: number, colors: [number, number, number][]): void {
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sx, sy, sz] = sphereDir(x / w, y / h);
      const n = fbm(sx * 6, sy * 2, sz * 6);
      const band = (Math.sin((y / h) * Math.PI * 10 + n * 2) + 1) / 2;
      const idx = Math.min(colors.length - 1, Math.floor(band * colors.length));
      const c = colors[idx] ?? colors[0]!;
      const i = (y * w + x) * 4;
      d[i] = c[0] + n * 20;
      d[i + 1] = c[1] + n * 16;
      d[i + 2] = c[2] + n * 12;
      d[i + 3] = 255;
    }
  }
}

function paintConcrete(img: ImageData, w: number, h: number): void {
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = hash3(x, y, 3);
      let g = 92 + n * 28;
      const cx = w / 2;
      const cy = h / 2;
      const dist = Math.hypot(x - cx, y - cy) / (w * 0.48);
      if (dist < 1 && dist > 0.72 && dist < 0.78) g = 210;
      if (Math.abs(x - cx) < 2 || Math.abs(y - cy) < 2) g = 180;
      const i = (y * w + x) * 4;
      d[i] = g;
      d[i + 1] = g + 2;
      d[i + 2] = g + 4;
      d[i + 3] = 255;
    }
  }
}

function radialCanvas(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Assets {
  earth: THREE.CanvasTexture;
  clouds: THREE.CanvasTexture;
  moon: THREE.CanvasTexture;
  mars: THREE.CanvasTexture;
  jupiter: THREE.CanvasTexture;
  saturn: THREE.CanvasTexture;
  uranus: THREE.CanvasTexture;
  neptune: THREE.CanvasTexture;
  concrete: THREE.CanvasTexture;
  puff: THREE.CanvasTexture;
  mats: {
    white: THREE.MeshStandardMaterial;
    tile: THREE.MeshStandardMaterial;
    gold: THREE.MeshStandardMaterial;
    glass: THREE.MeshStandardMaterial;
    orange: THREE.MeshStandardMaterial;
    dark: THREE.MeshStandardMaterial;
    copper: THREE.MeshStandardMaterial;
    solar: THREE.MeshStandardMaterial;
    suit: THREE.MeshStandardMaterial;
    metal: THREE.MeshStandardMaterial;
    flame: THREE.MeshBasicMaterial;
    screen: THREE.MeshBasicMaterial;
  };

  constructor() {
    this.earth = canvasTex(512, 256, paintEarth);
    this.clouds = canvasTex(512, 256, paintCloud);
    this.moon = canvasTex(384, 192, paintMoon);
    this.mars = canvasTex(384, 192, paintMars);
    this.jupiter = canvasTex(384, 192, (img, w, h) =>
      paintBands(img, w, h, [
        [196, 160, 120],
        [150, 110, 78],
        [210, 186, 150],
        [120, 86, 64],
        [176, 140, 100],
      ]),
    );
    this.saturn = canvasTex(384, 192, (img, w, h) =>
      paintBands(img, w, h, [
        [230, 210, 170],
        [196, 176, 130],
        [214, 190, 140],
        [160, 140, 100],
      ]),
    );
    this.uranus = canvasTex(256, 128, (img, w, h) =>
      paintBands(img, w, h, [
        [170, 220, 216],
        [140, 196, 198],
        [190, 230, 226],
      ]),
    );
    this.neptune = canvasTex(256, 128, (img, w, h) =>
      paintBands(img, w, h, [
        [40, 80, 170],
        [30, 60, 140],
        [70, 110, 190],
        [24, 48, 120],
      ]),
    );
    this.concrete = canvasTex(256, 256, paintConcrete);
    this.concrete.wrapS = THREE.RepeatWrapping;
    this.concrete.wrapT = THREE.RepeatWrapping;
    this.concrete.repeat.set(4, 4);
    this.puff = radialCanvas();
    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 256;
    screenCanvas.height = 128;
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    this.mats = {
      white: new THREE.MeshStandardMaterial({ color: 0xe7eef2, roughness: 0.42, metalness: 0.18 }),
      tile: new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.52, metalness: 0.45 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xc6a15b, roughness: 0.32, metalness: 0.86 }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x9fd4ff,
        roughness: 0.08,
        metalness: 0.25,
        transparent: true,
        opacity: 0.55,
      }),
      orange: new THREE.MeshStandardMaterial({
        color: 0xe8893a,
        emissive: 0xe8893a,
        emissiveIntensity: 0.35,
        roughness: 0.4,
      }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.48, metalness: 0.62 }),
      copper: new THREE.MeshStandardMaterial({ color: 0xb8734a, metalness: 0.82, roughness: 0.28 }),
      solar: new THREE.MeshStandardMaterial({
        color: 0x1d3d6e,
        metalness: 0.55,
        roughness: 0.22,
        emissive: 0x0a2040,
        emissiveIntensity: 0.4,
      }),
      suit: new THREE.MeshStandardMaterial({ color: 0xe7eef4, roughness: 0.55, metalness: 0.08 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.75 }),
      flame: new THREE.MeshBasicMaterial({
        color: 0xffb15a,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      screen: new THREE.MeshBasicMaterial({ map: screenTex }),
    };
    this.screenCanvas = screenCanvas;
    this.screenTex = screenTex;
  }

  screenCanvas: HTMLCanvasElement;
  screenTex: THREE.CanvasTexture;

  paintScreen(lines: string[]): void {
    const ctx = this.screenCanvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#071018";
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = "#8ecfff";
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(4, 4, 248, 120);
    ctx.globalAlpha = 1;
    ctx.font = "16px monospace";
    ctx.fillStyle = "#8ecfff";
    lines.forEach((line, i) => ctx.fillText(line, 12, 28 + i * 22));
    this.screenTex.needsUpdate = true;
  }

  dispose(): void {
    for (const t of [
      this.earth,
      this.clouds,
      this.moon,
      this.mars,
      this.jupiter,
      this.saturn,
      this.uranus,
      this.neptune,
      this.concrete,
      this.puff,
      this.screenTex,
    ]) {
      t.dispose();
    }
    Object.values(this.mats).forEach((m) => m.dispose());
  }
}
