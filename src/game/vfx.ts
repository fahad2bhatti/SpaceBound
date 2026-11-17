import * as THREE from "three";

/**
 * vfx-polish-v1: chhota pooled particle system (sprites, koi naya asset nahi).
 * Do pools: "add" (aag, chingari, plasma: additive) aur "norm" (dhool, dhuan: normal blending).
 * Sab world-space mein hain, scene badalne par clear() karna hai.
 */

type Quality = "low" | "medium" | "high";

type Part = {
  s: THREE.Sprite;
  life: number;
  max: number;
  v: THREE.Vector3;
  s0: number;
  s1: number;
  a0: number;
  drag: number;
  rise: number;
  c0: THREE.Color;
  c1: THREE.Color;
};

const POOL: Record<Quality, { add: number; norm: number; rate: number }> = {
  low: { add: 60, norm: 28, rate: 0.5 },
  medium: { add: 110, norm: 50, rate: 0.8 },
  high: { add: 190, norm: 80, rate: 1 },
};

const FIRE0 = new THREE.Color(0xffd27a);
const FIRE1 = new THREE.Color(0xff3d12);
const SMOKE0 = new THREE.Color(0x56575c);
const SMOKE1 = new THREE.Color(0x1d1e22);
const PLASMA0 = new THREE.Color(0xfff0c8);
const PLASMA1 = new THREE.Color(0xff5a1a);
const SPARK0 = new THREE.Color(0xffffff);
const SPARK1 = new THREE.Color(0xff8a2a);
const STAR0 = new THREE.Color(0xdfeaff);

export class Vfx {
  readonly group = new THREE.Group();
  private add: Part[] = [];
  private norm: Part[] = [];
  private q: Quality = "medium";
  private rate = 0.8;
  private accThrust = 0;
  private accHeat = 0;
  private accDust = 0;
  private accSpace = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly t1 = new THREE.Vector3();
  private readonly t2 = new THREE.Vector3();

  constructor(private tex: THREE.Texture, quality: Quality) {
    this.group.name = "vfx";
    this.build(quality);
  }

  setQuality(q: Quality): void {
    if (q === this.q) return;
    this.dispose();
    this.build(q);
  }

  private build(q: Quality): void {
    this.q = q;
    this.rate = POOL[q].rate;
    for (let i = 0; i < POOL[q].add; i++) this.add.push(this.make(true));
    for (let i = 0; i < POOL[q].norm; i++) this.norm.push(this.make(false));
  }

  private make(additive: boolean): Part {
    const mat = new THREE.SpriteMaterial({
      map: this.tex,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    this.group.add(s);
    return {
      s,
      life: 0,
      max: 1,
      v: new THREE.Vector3(),
      s0: 1,
      s1: 1,
      a0: 1,
      drag: 0,
      rise: 0,
      c0: new THREE.Color(),
      c1: new THREE.Color(),
    };
  }

  private spawn(
    pool: Part[],
    pos: THREE.Vector3,
    v: THREE.Vector3,
    life: number,
    s0: number,
    s1: number,
    a0: number,
    c0: THREE.Color,
    c1: THREE.Color,
    drag = 0,
    rise = 0,
  ): void {
    const p = pool.find((x) => x.life <= 0);
    if (!p) return;
    p.life = p.max = life;
    p.s.position.copy(pos);
    p.v.copy(v);
    p.s0 = s0;
    p.s1 = s1;
    p.a0 = a0;
    p.drag = drag;
    p.rise = rise;
    p.c0.copy(c0);
    p.c1.copy(c1);
    p.s.visible = true;
    p.s.scale.setScalar(s0);
    (p.s.material as THREE.SpriteMaterial).color.copy(c0);
    (p.s.material as THREE.SpriteMaterial).opacity = a0;
  }

  /**
   * Thruster flame + trail. pos = nozzle, back = unit vector peeche ki taraf, shipV = ship ki velocity
   * (particles woh velocity lekar nikalte hain, isliye ship aage nikalti hai aur lakeer peeche reh jati hai).
   */
  thrust(pos: THREE.Vector3, back: THREE.Vector3, shipV: THREE.Vector3, throttle: number, len: number, dt: number): void {
    if (throttle < 0.05) return;
    this.accThrust += dt * (28 + throttle * 60) * this.rate;
    const n = Math.floor(this.accThrust);
    this.accThrust -= n;
    for (let i = 0; i < n; i++) {
      // frame ke andar random jagah par spawn: tez speed par bhi lakeer jur kar rehti hai
      this.tmp.copy(pos).addScaledVector(shipV, -Math.random() * dt);
      this.tmp.x += (Math.random() - 0.5) * len * 0.06;
      this.tmp.y += (Math.random() - 0.5) * len * 0.06;
      this.tmp.z += (Math.random() - 0.5) * len * 0.06;
      this.t1.copy(shipV).multiplyScalar(0.96).addScaledVector(back, len * (2.2 + throttle * 3.2));
      this.t1.x += (Math.random() - 0.5) * len * 0.5;
      this.t1.y += (Math.random() - 0.5) * len * 0.5;
      this.t1.z += (Math.random() - 0.5) * len * 0.5;
      this.spawn(
        this.add,
        this.tmp,
        this.t1,
        0.28 + Math.random() * 0.3 * (0.5 + throttle),
        len * (0.1 + throttle * 0.09),
        len * 0.025,
        0.55 + throttle * 0.35,
        FIRE0,
        FIRE1,
        1.2,
      );
    }
  }

  /** Re-entry plasma: nose ke gird jalta hua lakeer. intensity 0..1. */
  reentry(pos: THREE.Vector3, shipV: THREE.Vector3, intensity: number, len: number, dt: number): void {
    if (intensity < 0.06) return;
    this.accHeat += dt * (20 + intensity * 70) * this.rate;
    const n = Math.floor(this.accHeat);
    this.accHeat -= n;
    for (let i = 0; i < n; i++) {
      this.tmp.copy(pos).addScaledVector(shipV, -Math.random() * dt);
      this.tmp.x += (Math.random() - 0.5) * len * 0.45;
      this.tmp.y += (Math.random() - 0.5) * len * 0.45;
      this.tmp.z += (Math.random() - 0.5) * len * 0.45;
      this.t1.copy(shipV).multiplyScalar(0.9);
      this.spawn(
        this.add,
        this.tmp,
        this.t1,
        0.3 + Math.random() * 0.35,
        len * (0.14 + intensity * 0.16),
        len * 0.04,
        0.35 + intensity * 0.4,
        PLASMA0,
        PLASMA1,
        2,
      );
    }
  }

  /**
   * Zameen ke paas thrust se uthti dhool: ground = zameen par point, normal = bahar ki taraf.
   * strength 0..1.
   */
  dust(ground: THREE.Vector3, normal: THREE.Vector3, strength: number, len: number, color: THREE.Color, dt: number): void {
    if (strength < 0.04) return;
    this.accDust += dt * (14 + strength * 40) * this.rate;
    const n = Math.floor(this.accDust);
    this.accDust -= n;
    // tangent basis
    this.t2.set(0, 1, 0);
    if (Math.abs(normal.y) > 0.9) this.t2.set(1, 0, 0);
    const tx = this.t1.crossVectors(normal, this.t2).normalize();
    const tz = this.t2.crossVectors(normal, tx).normalize();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = len * (1.2 + Math.random() * 2.2) * (0.5 + strength);
      this.tmp.set(
        (tx.x * Math.cos(a) + tz.x * Math.sin(a)) * sp + normal.x * len * 0.25,
        (tx.y * Math.cos(a) + tz.y * Math.sin(a)) * sp + normal.y * len * 0.25,
        (tx.z * Math.cos(a) + tz.z * Math.sin(a)) * sp + normal.z * len * 0.25,
      );
      this.spawn(
        this.norm,
        ground,
        this.tmp,
        0.9 + Math.random() * 0.9,
        len * 0.25,
        len * (0.9 + strength * 0.9),
        0.28 + strength * 0.22,
        color,
        color,
        1.6,
      );
    }
  }

  /** Crash / dhamaka: aag + dhuan + chingariyan. size = ship ki lambai. */
  explosion(pos: THREE.Vector3, size: number): void {
    const k = this.rate;
    const fire = Math.round(26 * k) + 6;
    for (let i = 0; i < fire; i++) {
      this.randDir(this.t1).multiplyScalar(size * (1.5 + Math.random() * 3.2));
      this.spawn(this.add, pos, this.t1, 0.5 + Math.random() * 0.55, size * (0.5 + Math.random() * 0.5), size * 0.15, 0.9, FIRE0, FIRE1, 1.8);
    }
    const smoke = Math.round(14 * k) + 4;
    for (let i = 0; i < smoke; i++) {
      this.randDir(this.t1).multiplyScalar(size * (0.6 + Math.random() * 1.6));
      this.spawn(this.norm, pos, this.t1, 1.4 + Math.random() * 1.4, size * 0.5, size * 2.6, 0.5, SMOKE0, SMOKE1, 1.1, size * 0.5);
    }
    const sparks = Math.round(22 * k) + 6;
    for (let i = 0; i < sparks; i++) {
      this.randDir(this.t1).multiplyScalar(size * (4 + Math.random() * 7));
      this.spawn(this.add, pos, this.t1, 0.4 + Math.random() * 0.6, size * 0.07, size * 0.02, 1, SPARK0, SPARK1, 0.6);
    }
  }

  /**
   * Speed dust: jahan ship hai uske aas-paas chhote sitare jo world mein thehre rehte hain,
   * isliye ship guzarte waqt unka parallax speed ka ehsaas deta hai. Sirf khuli space mein.
   */
  spaceDust(center: THREE.Vector3, speed: number, len: number, dt: number): void {
    if (speed < 6) return;
    this.accSpace += dt * Math.min(40, 6 + speed * 0.25) * this.rate;
    const n = Math.floor(this.accSpace);
    this.accSpace -= n;
    for (let i = 0; i < n; i++) {
      this.randDir(this.t1).multiplyScalar(len * (4 + Math.random() * 14));
      this.tmp.copy(center).add(this.t1);
      this.t2.set(0, 0, 0);
      this.spawn(this.add, this.tmp, this.t2, 1.1 + Math.random() * 0.8, len * 0.05, len * 0.05, 0.7, STAR0, STAR0);
    }
  }

  private randDir(out: THREE.Vector3): THREE.Vector3 {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    return out.set(r * Math.cos(a), u, r * Math.sin(a));
  }

  update(dt: number): void {
    this.step(this.add, dt);
    this.step(this.norm, dt);
  }

  private step(pool: Part[], dt: number): void {
    for (const p of pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      const k = p.life / p.max; // 1 -> 0
      if (p.drag > 0) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.s.position.addScaledVector(p.v, dt);
      if (p.rise) p.s.position.y += p.rise * dt;
      const m = p.s.material as THREE.SpriteMaterial;
      p.s.scale.setScalar(p.s1 + (p.s0 - p.s1) * k);
      m.color.copy(p.c1).lerp(p.c0, k);
      m.opacity = p.a0 * k;
    }
  }

  clear(): void {
    for (const p of this.add) {
      p.life = 0;
      p.s.visible = false;
    }
    for (const p of this.norm) {
      p.life = 0;
      p.s.visible = false;
    }
    this.accThrust = this.accHeat = this.accDust = this.accSpace = 0;
  }

  private dispose(): void {
    for (const p of [...this.add, ...this.norm]) {
      this.group.remove(p.s);
      (p.s.material as THREE.Material).dispose();
    }
    this.add = [];
    this.norm = [];
  }

  destroy(): void {
    this.dispose();
    this.group.removeFromParent();
  }
}
