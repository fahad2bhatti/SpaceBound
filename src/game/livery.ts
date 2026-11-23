// looks-v1: puts a paint and a sticker on a ship that was just built (see cosmetics.ts for what exists).
// Paint: the main body material and the accent material of the ship are replaced with tinted copies, so shared
// materials (used by other ships) are never changed. Sticker: a flat decal on each side of the hull, placed by
// shooting a ray at the hull, so it sits right on every ship shape. Anything that goes wrong leaves the stock look.

import * as THREE from "three";
import type { Assets } from "./assets";
import { NO_STICKER, paintById, STOCK_PAINT, stickerById, type ShipLook } from "./cosmetics";
import type { ShipRig } from "./models";

// ---------- sticker pictures (drawn once with canvas, no image files) ----------

type Draw = (g: CanvasRenderingContext2D) => void;

function star(g: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

function poly(g: CanvasRenderingContext2D, pts: [number, number][]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
}

/** Every picture is drawn around (0, 0), about 110 units wide, then outlined dark and filled light. */
const DRAW: Record<string, { path: Draw; extra?: Draw }> = {
  star: { path: (g) => star(g, 0, 2, 54, 23) },
  bolt: {
    path: (g) =>
      poly(g, [
        [12, -56],
        [-30, 8],
        [-4, 8],
        [-16, 56],
        [32, -14],
        [4, -14],
      ]),
  },
  flame: {
    path: (g) => {
      g.beginPath();
      g.moveTo(4, -58);
      g.bezierCurveTo(38, -24, 46, 8, 26, 40);
      g.bezierCurveTo(16, 58, -16, 58, -26, 40);
      g.bezierCurveTo(-46, 8, -32, -16, -10, -30);
      g.bezierCurveTo(-10, -12, 0, -10, 4, -58);
      g.closePath();
    },
  },
  planet: {
    path: (g) => {
      g.beginPath();
      g.arc(0, 0, 30, 0, Math.PI * 2);
    },
    extra: (g) => {
      g.beginPath();
      g.ellipse(0, 0, 58, 16, -0.45, 0, Math.PI * 2);
    },
  },
  crescent: {
    path: (g) => {
      // Big circle minus a smaller one, as one outline.
      g.beginPath();
      g.arc(0, 0, 46, -0.888, 0.888, true);
      g.arc(16, 0, 38, 1.222, Math.PI * 2 - 1.222, false);
      g.closePath();
    },
    extra: (g) => star(g, 26, -2, 15, 6.5),
  },
  crown: {
    path: (g) =>
      poly(g, [
        [-50, 32],
        [-50, -22],
        [-25, 4],
        [0, -36],
        [25, 4],
        [50, -22],
        [50, 32],
      ]),
  },
};

const textures = new Map<string, THREE.CanvasTexture>();

function stickerTexture(id: string): THREE.CanvasTexture | null {
  const cached = textures.get(id);
  if (cached) return cached;
  const d = DRAW[id];
  if (!d) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.translate(64, 64);
  g.lineJoin = "round";
  g.lineCap = "round";
  const outline = "#0b0f14";
  const fill = "#f4f7fa";
  // Outline first, then fill, so the picture reads on any hull colour.
  d.path(g);
  g.lineWidth = 10;
  g.strokeStyle = outline;
  g.stroke();
  g.fillStyle = fill;
  g.fill();
  if (d.extra) {
    d.extra(g);
    g.lineWidth = id === "planet" ? 13 : 10;
    g.strokeStyle = outline;
    g.stroke();
    if (id === "planet") {
      g.lineWidth = 6;
      g.strokeStyle = fill;
      g.stroke();
    } else {
      g.fillStyle = fill;
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  textures.set(id, t);
  return t;
}

// ---------- paint ----------

function bodyVolume(mesh: THREE.Mesh): number {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const size = new THREE.Vector3();
  g.boundingBox?.getSize(size);
  size.multiply(mesh.scale);
  return size.x * size.y * size.z;
}

function applyPaint(rig: ShipRig, a: Assets, paintId: string): void {
  const paint = paintById(paintId);
  if (!paint || paint.id === STOCK_PAINT) return;
  const m = a.mats;
  const volume = new Map<THREE.Material, number>();
  for (const o of rig.hull) {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) continue;
    volume.set(mesh.material, (volume.get(mesh.material) ?? 0) + bodyVolume(mesh));
  }
  const biggest = (list: THREE.Material[]): THREE.Material[] =>
    list.filter((x) => volume.has(x)).sort((p, q) => (volume.get(q) ?? 0) - (volume.get(p) ?? 0));
  // The body is whatever bright or metal material covers most of the ship. Dark ships (no such material) use their dark one.
  let bodies = biggest([m.white, m.gold, m.copper]);
  if (!bodies.length) bodies = biggest([m.tile, m.dark]);
  const primary = bodies[0];
  if (!primary) return;
  const accent = volume.has(m.orange) ? m.orange : bodies[1];

  const swap = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const tint = (src: THREE.Material, hex: number, shiny: boolean): void => {
    const c = (src as THREE.MeshStandardMaterial).clone();
    c.color.setHex(hex);
    if (c.emissive.getHex() !== 0) c.emissive.setHex(hex); // glowing trim keeps glowing, in the new colour
    if (shiny) {
      c.metalness = 0.95;
      c.roughness = 0.22;
    }
    swap.set(src, c);
  };
  tint(primary, paint.hull, !!paint.metal);
  if (accent && accent !== primary) tint(accent, paint.accent, false);
  for (const o of rig.hull) {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) continue;
    const rep = swap.get(mesh.material);
    if (rep) mesh.material = rep;
  }
}

// ---------- sticker ----------

function applySticker(rig: ShipRig, stickerId: string): void {
  if (stickerId === NO_STICKER || !stickerById(stickerId)) return;
  const map = stickerTexture(stickerId);
  if (!map) return;
  const targets = rig.hull.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh === true);
  if (!targets.length) return;
  rig.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const size = THREE.MathUtils.clamp(Math.min(rig.half.x, rig.half.z) * 0.45, 0.28, 0.75);
  for (const side of [1, -1]) {
    // Try a few spots along the hull; the first one that is a flat-ish side wall wins.
    for (const f of [0.3, 0, 0.55, -0.25]) {
      ray.set(
        new THREE.Vector3(side * (rig.half.x + 4), rig.half.y * 0.1, rig.half.z * f),
        new THREE.Vector3(-side, 0, 0),
      );
      const hit = ray.intersectObjects(targets, false)[0];
      if (!hit?.face) continue;
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (Math.abs(normal.x) < 0.5) continue;
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          toneMapped: false,
        }),
      );
      decal.position.copy(hit.point).addScaledVector(normal, 0.02);
      decal.lookAt(decal.position.clone().add(normal));
      decal.castShadow = false;
      decal.userData.decal = true;
      rig.group.add(decal);
      rig.hull.push(decal); // hidden together with the hull when the camera is inside the cockpit
      break;
    }
  }
}

/** Paints and decorates a freshly built ship. Never throws: on any problem the ship keeps its stock look. */
export function applyLook(rig: ShipRig, a: Assets, look: ShipLook): void {
  try {
    applyPaint(rig, a, look.paint);
  } catch (err) {
    console.error("paint failed", err);
  }
  try {
    applySticker(rig, look.sticker);
  } catch (err) {
    console.error("sticker failed", err);
  }
}
