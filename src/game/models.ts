import * as THREE from "three";
import type { Assets } from "./assets";
import type { BodyId, ShipId } from "./catalog";

export type AstronautRig = {
  group: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
};

export type ShipRig = {
  group: THREE.Group;
  flames: THREE.Object3D[];
  hull: THREE.Object3D[];
  interior: THREE.Group;
  hatch: THREE.Vector3;
  cockpitPos: THREE.Vector3;
  lookPos: THREE.Vector3;
  half: THREE.Vector3;
  light: THREE.PointLight;
};

function add(parent: THREE.Object3D, mesh: THREE.Object3D): THREE.Mesh {
  parent.add(mesh);
  return mesh as THREE.Mesh;
}

function std(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function hullMesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = std(geo, mat, x, y, z);
  m.userData.hull = true;
  return m;
}

function flameCone(mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.ConeGeometry(0.28, 1.4, 10, 1, true);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -0.7);
  const m = new THREE.Mesh(geo, mat);
  m.userData.flame = true;
  return m;
}

function cockpitInterior(mat: Assets["mats"], zFront: number): THREE.Group {
  const g = new THREE.Group();
  g.userData.interior = true;
  const panel = std(new THREE.BoxGeometry(1.1, 0.45, 0.08), mat.dark, 0, 0.15, zFront);
  panel.userData.screen = true;
  g.add(panel);
  g.add(std(new THREE.BoxGeometry(0.5, 0.12, 0.5), mat.dark, 0, -0.15, zFront - 0.55));
  const strutL = std(new THREE.BoxGeometry(0.06, 0.7, 0.06), mat.metal, -0.55, 0.4, zFront - 0.2);
  const strutR = std(new THREE.BoxGeometry(0.06, 0.7, 0.06), mat.metal, 0.55, 0.4, zFront - 0.2);
  g.add(strutL, strutR);
  g.add(std(new THREE.BoxGeometry(0.08, 0.08, 0.2), mat.orange, -0.35, 0.42, zFront + 0.02));
  g.add(std(new THREE.BoxGeometry(0.08, 0.08, 0.2), mat.orange, 0.35, 0.42, zFront + 0.02));
  return g;
}

function collect(group: THREE.Group): { hull: THREE.Object3D[]; flames: THREE.Object3D[] } {
  const hull: THREE.Object3D[] = [];
  const flames: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o.userData.hull) hull.push(o);
    if (o.userData.flame) flames.push(o);
  });
  return { hull, flames };
}

export function buildAstronaut(a: Assets): AstronautRig {
  const group = new THREE.Group();
  const suit = a.mats.suit;
  const dark = a.mats.dark;
  const orange = a.mats.orange;
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9ec9ea,
    metalness: 0.92,
    roughness: 0.08,
  });
  group.add(std(new THREE.CapsuleGeometry(0.28, 0.55, 4, 10), suit, 0, 1.15, 0));
  group.add(std(new THREE.SphereGeometry(0.23, 16, 12), suit, 0, 1.62, 0));
  const visor = std(new THREE.SphereGeometry(0.16, 16, 12), glass, 0, 1.64, 0.12);
  visor.scale.set(1, 0.8, 0.55);
  group.add(visor);
  group.add(std(new THREE.BoxGeometry(0.34, 0.42, 0.18), dark, 0, 1.25, -0.22));
  group.add(std(new THREE.BoxGeometry(0.5, 0.06, 0.06), orange, 0, 1.2, 0.22));
  group.add(std(new THREE.TorusGeometry(0.18, 0.02, 6, 12), a.mats.metal, 0, 1.5, 0));

  const armL = new THREE.Group();
  armL.position.set(-0.34, 1.38, 0);
  armL.add(std(new THREE.CapsuleGeometry(0.07, 0.38, 3, 8), suit, 0, -0.28, 0));
  armL.add(std(new THREE.SphereGeometry(0.08, 8, 8), dark, 0, -0.52, 0));
  const armR = armL.clone();
  armR.position.x = 0.34;
  const legL = new THREE.Group();
  legL.position.set(-0.12, 0.82, 0);
  legL.add(std(new THREE.CapsuleGeometry(0.09, 0.42, 3, 8), suit, 0, -0.32, 0));
  legL.add(std(new THREE.BoxGeometry(0.16, 0.08, 0.28), dark, 0, -0.58, 0.04));
  const legR = legL.clone();
  legR.position.x = 0.12;
  group.add(armL, armR, legL, legR);
  group.add(std(new THREE.BoxGeometry(0.08, 0.16, 0.08), orange, 0.2, 1.05, 0.2));
  return { group, legL, legR, armL, armR };
}

function finish(
  group: THREE.Group,
  a: Assets,
  hatch: THREE.Vector3,
  cockpit: THREE.Vector3,
  look: THREE.Vector3,
  half: THREE.Vector3,
  interiorZ: number,
): ShipRig {
  const interior = cockpitInterior(a.mats, interiorZ);
  group.add(interior);
  interior.traverse((o) => {
    if (o.userData.screen) (o as THREE.Mesh).material = a.mats.screen;
  });
  const { hull, flames } = collect(group);
  const light = new THREE.PointLight(0xff7a2a, 0, 8, 2);
  light.position.set(0, 0, -half.z);
  group.add(light);
  return { group, flames, hull, interior, hatch, cockpitPos: cockpit, lookPos: look, half, light };
}

export function buildShip(id: ShipId, a: Assets): ShipRig {
  const g = new THREE.Group();
  const m = a.mats;
  if (id === "starter") {
    const body = new THREE.CapsuleGeometry(0.55, 2.2, 4, 12);
    body.rotateX(Math.PI / 2);
    g.add(hullMesh(body, m.white));
    const nose = new THREE.ConeGeometry(0.55, 1.1, 14);
    nose.rotateX(Math.PI / 2);
    nose.translate(0, 0, 1.7);
    g.add(hullMesh(nose, m.white));
    g.add(hullMesh(new THREE.SphereGeometry(0.22, 12, 10), m.glass, 0, 0.28, 0.9));
    for (const side of [-1, 1]) {
      const fin = new THREE.BoxGeometry(0.08, 0.7, 0.7);
      g.add(hullMesh(fin, m.tile, side * 0.7, 0, -0.9));
    }
    g.add(hullMesh(new THREE.BoxGeometry(0.08, 0.7, 0.55), m.orange, 0, 0.7, -0.2));
    const bell = new THREE.CylinderGeometry(0.18, 0.36, 0.45, 12);
    bell.rotateX(Math.PI / 2);
    bell.translate(0, 0, -1.5);
    g.add(hullMesh(bell, m.dark));
    const f = flameCone(m.flame);
    f.position.set(0, 0, -1.55);
    g.add(f);
    return finish(g, a, new THREE.Vector3(0.85, 0.2, 0.4), new THREE.Vector3(0, 0.25, 0.55), new THREE.Vector3(0, 0.15, 2.2), new THREE.Vector3(0.9, 0.9, 2.1), 1.15);
  }

  if (id === "orbital") {
    const fuse = new THREE.CapsuleGeometry(0.48, 3.4, 4, 12);
    fuse.rotateX(Math.PI / 2);
    g.add(hullMesh(fuse, m.white));
    const belly = new THREE.BoxGeometry(0.7, 0.18, 2.6);
    g.add(hullMesh(belly, m.tile, 0, -0.4, 0));
    const wingGeo = new THREE.BoxGeometry(2.6, 0.06, 1.1);
    g.add(hullMesh(wingGeo, m.white, 0, -0.15, -0.2));
    g.add(hullMesh(new THREE.BoxGeometry(0.08, 0.9, 0.7), m.tile, 0, 0.7, -1.5));
    const nose = new THREE.ConeGeometry(0.48, 1.2, 12);
    nose.rotateX(Math.PI / 2);
    nose.translate(0, 0, 2.3);
    g.add(hullMesh(nose, m.white));
    g.add(hullMesh(new THREE.SphereGeometry(0.28, 12, 10), m.glass, 0, 0.25, 1.15));
    for (const x of [-0.28, 0, 0.28]) {
      const bell = new THREE.CylinderGeometry(0.1, 0.2, 0.4, 10);
      bell.rotateX(Math.PI / 2);
      const mesh = hullMesh(bell, m.dark, x, -0.05, -1.9);
      g.add(mesh);
      const f = flameCone(m.flame);
      f.scale.setScalar(0.65);
      f.position.set(x, -0.05, -2);
      g.add(f);
    }
    return finish(g, a, new THREE.Vector3(0.7, 0, 0.2), new THREE.Vector3(0, 0.22, 0.9), new THREE.Vector3(0, 0.1, 2.6), new THREE.Vector3(1.4, 0.9, 2.5), 1.5);
  }

  if (id === "lunar") {
    g.add(hullMesh(new THREE.CylinderGeometry(1.05, 1.15, 0.45, 8), m.gold, 0, 0.4, 0));
    g.add(hullMesh(new THREE.CylinderGeometry(0.55, 0.62, 0.7, 10), m.white, 0, 0.95, 0));
    g.add(hullMesh(new THREE.SphereGeometry(0.22, 12, 10), m.glass, 0, 1.15, 0.35));
    for (const [x, z] of [
      [0.95, 0.95],
      [-0.95, 0.95],
      [0.95, -0.95],
      [-0.95, -0.95],
    ] as const) {
      const leg = new THREE.CylinderGeometry(0.045, 0.045, 1.15, 6);
      const mesh = hullMesh(leg, m.metal, x * 0.72, -0.2, z * 0.72);
      mesh.rotation.z = -x * 0.45;
      mesh.rotation.x = z * 0.45;
      g.add(mesh);
      g.add(hullMesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 8), m.dark, x, -0.72, z));
    }
    g.add(hullMesh(new THREE.BoxGeometry(0.7, 0.35, 0.08), m.gold, 0, 0.7, 0.7));
    const bell = new THREE.CylinderGeometry(0.16, 0.32, 0.35, 10);
    g.add(hullMesh(bell, m.dark, 0, 0.15, 0));
    const f = flameCone(m.flame);
    f.rotation.x = -Math.PI / 2;
    f.position.set(0, -0.2, 0);
    g.add(f);
    g.add(hullMesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 4), m.metal, 0.4, 1.5, -0.2));
    return finish(
      g,
      a,
      new THREE.Vector3(0.85, 0.7, 0.2),
      new THREE.Vector3(0, 1.05, 0.05),
      new THREE.Vector3(0, 1.0, 1.4),
      new THREE.Vector3(1.3, 1.3, 1.3),
      0.55,
    );
  }

  if (id === "advanced") {
    const hab = new THREE.CylinderGeometry(0.7, 0.7, 3.2, 16);
    hab.rotateX(Math.PI / 2);
    g.add(hullMesh(hab, m.white));
    g.add(hullMesh(new THREE.BoxGeometry(0.15, 0.2, 2.4), m.orange, 0.72, 0.1, 0));
    const nose = new THREE.ConeGeometry(0.7, 1.3, 14);
    nose.rotateX(Math.PI / 2);
    nose.translate(0, 0, 2.2);
    g.add(hullMesh(nose, m.white));
    g.add(hullMesh(new THREE.SphereGeometry(0.26, 12, 10), m.glass, 0, 0.35, 1.3));
    for (const side of [-1, 1]) {
      g.add(hullMesh(new THREE.BoxGeometry(2.4, 0.04, 0.9), m.solar, side * 2.1, 0.1, -0.2));
      g.add(hullMesh(new THREE.BoxGeometry(0.08, 0.08, 0.4), m.metal, side * 0.9, 0.1, -0.2));
    }
    for (const x of [-0.32, 0.32]) {
      const bell = new THREE.CylinderGeometry(0.16, 0.32, 0.5, 10);
      bell.rotateX(Math.PI / 2);
      g.add(hullMesh(bell, m.dark, x, 0, -1.9));
      const f = flameCone(m.flame);
      f.position.set(x, 0, -2);
      g.add(f);
    }
    return finish(g, a, new THREE.Vector3(0.95, 0, 0.4), new THREE.Vector3(0, 0.25, 0.85), new THREE.Vector3(0, 0.15, 2.4), new THREE.Vector3(2.4, 0.9, 2.4), 1.4);
  }

  if (id === "heavy") {
    g.add(hullMesh(new THREE.BoxGeometry(1.6, 1.3, 4.2), m.dark));
    g.add(hullMesh(new THREE.BoxGeometry(1.2, 0.5, 1.1), m.white, 0, 0.85, 1.2));
    g.add(hullMesh(new THREE.BoxGeometry(0.8, 0.28, 0.08), m.glass, 0, 0.95, 1.72));
    for (const side of [-1, 1]) {
      const tank = new THREE.CapsuleGeometry(0.38, 2.6, 4, 10);
      tank.rotateX(Math.PI / 2);
      g.add(hullMesh(tank, m.orange, side * 1.15, -0.1, -0.2));
    }
    for (const x of [-0.45, 0.45]) {
      for (const y of [-0.25, 0.25]) {
        const bell = new THREE.CylinderGeometry(0.16, 0.34, 0.55, 10);
        bell.rotateX(Math.PI / 2);
        g.add(hullMesh(bell, m.tile, x, y, -2.3));
        const f = flameCone(m.flame);
        f.scale.setScalar(0.85);
        f.position.set(x, y, -2.45);
        g.add(f);
      }
    }
    return finish(g, a, new THREE.Vector3(1.15, 0.2, 0.6), new THREE.Vector3(0, 0.7, 1.15), new THREE.Vector3(0, 0.55, 2.6), new THREE.Vector3(1.7, 1.1, 2.6), 1.85);
  }

  if (id === "elite") {
    const fuse = new THREE.CapsuleGeometry(0.42, 4.6, 4, 12);
    fuse.rotateX(Math.PI / 2);
    g.add(hullMesh(fuse, m.dark));
    const nose = new THREE.ConeGeometry(0.42, 1.5, 14);
    nose.rotateX(Math.PI / 2);
    nose.translate(0, 0, 3);
    g.add(hullMesh(nose, m.copper));
    g.add(hullMesh(new THREE.SphereGeometry(0.2, 12, 8), m.glass, 0, 0.22, 1.6));
    for (const side of [-1, 1]) {
      const nac = new THREE.CapsuleGeometry(0.22, 2.2, 4, 8);
      nac.rotateX(Math.PI / 2);
      g.add(hullMesh(nac, m.tile, side * 0.85, -0.15, -0.4));
      const f = flameCone(m.flame);
      f.scale.setScalar(0.7);
      f.position.set(side * 0.85, -0.15, -1.7);
      g.add(f);
      const bell = new THREE.CylinderGeometry(0.1, 0.22, 0.35, 8);
      bell.rotateX(Math.PI / 2);
      g.add(hullMesh(bell, m.dark, side * 0.85, -0.15, -1.55));
    }
    g.add(hullMesh(new THREE.BoxGeometry(1.8, 0.05, 0.7), m.solar, 0, 0.15, 0.2));
    return finish(g, a, new THREE.Vector3(0.6, 0, 0.8), new THREE.Vector3(0, 0.18, 1.3), new THREE.Vector3(0, 0.1, 3.2), new THREE.Vector3(1.2, 0.7, 3.2), 1.9);
  }

  const spine = new THREE.CylinderGeometry(0.28, 0.28, 5.5, 10);
  spine.rotateX(Math.PI / 2);
  g.add(hullMesh(spine, m.white));
  const ring = new THREE.TorusGeometry(1.15, 0.18, 10, 28);
  const ringMesh = hullMesh(ring, m.gold, 0, 0, 0.4);
  ringMesh.userData.spin = true;
  g.add(ringMesh);
  g.add(hullMesh(new THREE.SphereGeometry(0.55, 16, 12), m.white, 0, 0, 1.8));
  g.add(hullMesh(new THREE.SphereGeometry(0.22, 12, 8), m.glass, 0, 0.15, 2.25));
  for (const ang of [0, 2.1, 4.2]) {
    const x = Math.cos(ang) * 0.55;
    const y = Math.sin(ang) * 0.55;
    const bell = new THREE.CylinderGeometry(0.16, 0.36, 0.6, 10);
    bell.rotateX(Math.PI / 2);
    g.add(hullMesh(bell, m.dark, x, y, -2.8));
    const f = flameCone(m.flame);
    f.position.set(x, y, -2.95);
    g.add(f);
  }
  g.add(hullMesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), m.metal, 0, 1.3, -0.6));
  return finish(g, a, new THREE.Vector3(0.7, 0.3, 1.5), new THREE.Vector3(0, 0.15, 1.7), new THREE.Vector3(0, 0.1, 3), new THREE.Vector3(1.4, 1.4, 3.2), 2.15);
}

export function buildSpaceport(a: Assets): THREE.Group {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(42, 48), new THREE.MeshStandardMaterial({ map: a.concrete, roughness: 0.9, metalness: 0.02 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(6.5, 6.8, 0.08, 24),
    new THREE.MeshStandardMaterial({ color: 0x4e555c, roughness: 0.72, metalness: 0.18 }),
  );
  pad.position.y = 0.04;
  pad.receiveShadow = true;
  pad.castShadow = true;
  g.add(pad);
  // upright-launch-v1: rocket is seated on this launch stand (ship base at y = 1.05)
  const stand = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.2, 20), a.mats.dark);
  plate.position.y = 0.1;
  plate.receiveShadow = true;
  stand.add(plate);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.32), a.mats.metal);
      pillar.position.set(sx * 0.92, 0.625, sz * 0.92);
      pillar.castShadow = true;
      stand.add(pillar);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.14), a.mats.orange);
      arm.position.set(sx * 0.619, 0.99, sz * 0.619);
      arm.rotation.y = -Math.atan2(sz, sx);
      arm.castShadow = true;
      stand.add(arm);
    }
  }
  g.add(stand);
  const tower = new THREE.Group();
  tower.position.set(-8, 0, -6);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.4, 14, 1.4), a.mats.dark);
  shaft.position.y = 7;
  shaft.castShadow = true;
  tower.add(shaft);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 2.2), a.mats.metal);
  deck.position.set(1.5, 8.5, 1);
  tower.add(deck);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 0.4), a.mats.orange);
  arm.position.set(2.2, 6.2, 2.4);
  tower.add(arm);
  g.add(tower);
  const truck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.1), a.mats.orange);
  truck.position.set(7.5, 0.7, -5);
  truck.castShadow = true;
  truck.userData.fuel = true;
  g.add(truck);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 10), a.mats.white);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(7.5, 1.5, -5);
  g.add(tank);
  const fenceGeo = new THREE.BoxGeometry(0.08, 1.1, 1.6);
  const fences = new THREE.InstancedMesh(fenceGeo, a.mats.metal, 28);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 28; i++) {
    const side = i < 14 ? -1 : 1;
    dummy.position.set(side * 16, 0.55, -18 + (i % 14) * 2.4);
    dummy.updateMatrix();
    fences.setMatrixAt(i, dummy.matrix);
  }
  fences.castShadow = true;
  g.add(fences);
  const sky = skyDome("dawn");
  g.add(sky);
  return g;
}

export function skyDome(kind: "dawn" | "void"): THREE.Mesh {
  const geo = new THREE.SphereGeometry(kind === "dawn" ? 80 : 400, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uKind: { value: kind === "dawn" ? 1 : 0 },
    },
    vertexShader: `
      varying float vH;
      void main() {
        vH = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vH;
      uniform float uKind;
      void main() {
        vec3 top = vec3(0.02, 0.035, 0.07);
        vec3 mid = vec3(0.16, 0.28, 0.42);
        vec3 hor = vec3(0.78, 0.46, 0.24);
        float t = clamp(vH * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(hor, mid, smoothstep(0.35, 0.62, t));
        col = mix(col, top, smoothstep(0.55, 0.95, t));
        if (uKind < 0.5) col = vec3(0.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

export function buildAtmosphere(radius: number, color: THREE.Color): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      varying vec3 vN;
      varying vec3 vW;
      uniform vec3 uColor;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vW);
        float f = pow(1.0 - clamp(dot(normalize(vN), viewDir), 0.0, 1.0), 2.15);
        gl_FragColor = vec4(uColor, f * 0.95);
      }
    `,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 48, 32), mat);
}

// stars-round-v1
function starSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

export function buildStars(count: number, inner: number, outer: number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = inner + Math.random() * (outer - inner);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xd5e4ff,
    size: 1.4,
    sizeAttenuation: true,
    depthWrite: false,
    map: starSprite(),
    transparent: true,
    alphaTest: 0.01,
  });
  return new THREE.Points(geo, mat);
}

export type Terrain = {
  group: THREE.Group;
  heightAt: (x: number, z: number) => number;
  samples: THREE.Object3D[];
  rocks: { x: number; z: number; r: number }[];
};

type Crater = { x: number; z: number; r: number; depth: number };

function makeHeight(craters: Crater[], amp: number) {
  return (x: number, z: number) => {
    let h = Math.sin(x * 0.11) * Math.cos(z * 0.09) * amp;
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) {
        const u = d / c.r;
        h += -c.depth * (1 - u * u);
        if (u > 0.78) h += c.depth * 0.45 * ((u - 0.78) / 0.22);
      }
    }
    return h;
  };
}

export function buildTerrain(body: "moon" | "mars", a: Assets): Terrain {
  const moon = body === "moon";
  const craters: Crater[] = [
    { x: 12, z: 8, r: 7, depth: moon ? 1.3 : 0.8 },
    { x: -16, z: 14, r: 9, depth: moon ? 1.6 : 0.9 },
    { x: 6, z: -18, r: 5, depth: 0.7 },
    { x: -8, z: -10, r: 4, depth: 0.5 },
    { x: 22, z: -6, r: 6, depth: 0.9 },
  ];
  const heightAt = makeHeight(craters, moon ? 0.35 : 0.55);
  const geo = new THREE.PlaneGeometry(120, 120, 70, 70);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  if (!pos) throw new Error("terrain");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: moon ? a.moon : a.mars,
    roughness: 0.92,
    metalness: 0.04,
    color: moon ? 0xb7b8bc : 0xffffff,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: moon ? 0x9a9ca2 : 0x8a4030,
    roughness: 0.88,
  });
  const rocks: { x: number; z: number; r: number }[] = [];
  const inst = new THREE.InstancedMesh(rockGeo, rockMat, 26);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 26; i++) {
    const x = ((i * 37) % 70) - 35;
    const z = ((i * 53) % 70) - 32;
    const s = 0.35 + (i % 5) * 0.18;
    dummy.position.set(x, heightAt(x, z) + s * 0.4, z);
    dummy.rotation.set(i, i * 0.7, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    rocks.push({ x, z, r: s + 0.4 });
  }
  inst.castShadow = true;
  inst.receiveShadow = true;
  group.add(inst);
  const samples: THREE.Object3D[] = [];
  const sampleMat = new THREE.MeshStandardMaterial({
    color: 0xe8893a,
    emissive: 0xe8893a,
    emissiveIntensity: 0.8,
    roughness: 0.35,
  });
  const spots = [
    [10, 14],
    [-12, 8],
    [4, -14],
    [-18, -6],
  ];
  spots.forEach(([x, z], idx) => {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), sampleMat);
    s.position.set(x ?? 0, heightAt(x ?? 0, z ?? 0) + 0.35, z ?? 0);
    s.userData.sample = idx;
    group.add(s);
    samples.push(s);
  });
  const flag = new THREE.Group();
  flag.position.set(3.2, heightAt(3.2, 2.4), 2.4);
  flag.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), a.mats.metal));
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.38), a.mats.orange);
  cloth.position.set(0.35, 0.45, 0);
  flag.add(cloth);
  flag.children[0]!.position.y = 0.7;
  group.add(flag);
  if (!moon) {
    group.add(skyDome("dawn"));
  }
  return { group, heightAt, samples, rocks };
}

export function bodyTexture(a: Assets, id: BodyId): THREE.Texture {
  if (id === "earth") return a.earth;
  if (id === "moon") return a.moon;
  if (id === "mars") return a.mars;
  if (id === "jupiter") return a.jupiter;
  if (id === "saturn") return a.saturn;
  if (id === "uranus") return a.uranus;
  return a.neptune;
}

export function disposeGeometries(root: THREE.Object3D): void {
  const seen = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !seen.has(mesh.geometry)) {
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
  });
}
