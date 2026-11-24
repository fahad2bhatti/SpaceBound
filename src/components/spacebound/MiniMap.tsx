// minimap-v1: chhota naqsha (top-down), ship hamesha beech mein aur naak hamesha upar.
// Target naqshe par ho to diamond, bahar ho to kinare par teer. Tap = bara naqsha (Solar chart).
import { useEffect, useRef } from "react";
import type { Spacebound } from "@/game/engine";
import { km } from "@/game/catalog";

const MIN_R = 30;
const MAX_R = 1600;

export function MiniMap({
  engineRef,
  name,
  onOpen,
}: {
  engineRef: React.RefObject<Spacebound | null>;
  name: string;
  onOpen: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let R = 120; // world units from the centre to the edge, eased
    let hx = 0;
    let hz = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = cv.current;
      const e = engineRef.current;
      if (!c || !e) return;
      const m = e.miniMap();
      if (!m) return;
      const W = c.clientWidth || 1;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(W * dpr)) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(W * dpr);
      }
      const g = c.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, W);
      const half = W / 2;

      // Heading-up: the ship's nose is always "up" on the map, so a target on the left means turn left.
      const hl = Math.hypot(m.hx, m.hz);
      if (hl > 0.2) {
        hx = m.hx / hl;
        hz = m.hz / hl;
      }
      const rx = -hz; // right = forward x world-up, on the x / z plane
      const rz = hx;
      const want = Math.min(MAX_R, Math.max(MIN_R, m.tdist * 1.25));
      R += (want - R) * 0.06;
      const s = (half - 6) / R;
      const px = (x: number, z: number) => half + ((x - m.sx) * rx + (z - m.sz) * rz) * s;
      const py = (x: number, z: number) => half - ((x - m.sx) * hx + (z - m.sz) * hz) * s;

      g.save();
      g.beginPath();
      g.arc(half, half, half - 1, 0, Math.PI * 2);
      g.fillStyle = "rgba(7, 9, 13, 0.82)";
      g.fill();
      g.clip();
      // range rings
      g.strokeStyle = "rgba(142, 207, 255, 0.18)";
      g.lineWidth = 1;
      for (const f of [0.33, 0.66]) {
        g.beginPath();
        g.arc(half, half, (half - 6) * f, 0, Math.PI * 2);
        g.stroke();
      }
      // Sun
      {
        const x = px(m.sun.x, m.sun.z);
        const y = py(m.sun.x, m.sun.z);
        g.beginPath();
        g.arc(x, y, Math.max(3, m.sun.r * s), 0, Math.PI * 2);
        g.fillStyle = "#ffcf6b";
        g.fill();
      }
      // planets
      for (const b of m.bodies) {
        const x = px(b.x, b.z);
        const y = py(b.x, b.z);
        g.beginPath();
        g.arc(x, y, Math.max(2.5, b.r * s), 0, Math.PI * 2);
        g.fillStyle = b.color;
        g.fill();
      }
      // station
      {
        const x = px(m.station.x, m.station.z);
        const y = py(m.station.x, m.station.z);
        g.fillStyle = "#8ecfff";
        g.fillRect(x - 2, y - 2, 4, 4);
      }
      g.restore();

      // target: diamond inside, arrow on the rim outside
      const tx = px(m.tx, m.tz);
      const ty = py(m.tx, m.tz);
      const dx = tx - half;
      const dy = ty - half;
      const dl = Math.hypot(dx, dy);
      g.fillStyle = "#e8893a";
      g.strokeStyle = "#e8893a";
      if (dl < half - 8) {
        g.save();
        g.translate(tx, ty);
        g.rotate(Math.PI / 4);
        g.lineWidth = 2;
        g.strokeRect(-4, -4, 8, 8);
        g.restore();
      } else {
        const ux = dx / (dl || 1);
        const uy = dy / (dl || 1);
        const ex = half + ux * (half - 7);
        const ey = half + uy * (half - 7);
        g.save();
        g.translate(ex, ey);
        g.rotate(Math.atan2(uy, ux) + Math.PI / 2);
        g.beginPath();
        g.moveTo(0, -6);
        g.lineTo(5, 4);
        g.lineTo(-5, 4);
        g.closePath();
        g.fill();
        g.restore();
      }
      // ship (always centre, nose up)
      g.beginPath();
      g.moveTo(half, half - 7);
      g.lineTo(half + 5, half + 5);
      g.lineTo(half, half + 2);
      g.lineTo(half - 5, half + 5);
      g.closePath();
      g.fillStyle = "#f3f6fa";
      g.fill();
      // rim
      g.beginPath();
      g.arc(half, half, half - 1, 0, Math.PI * 2);
      g.strokeStyle = "rgba(142, 207, 255, 0.45)";
      g.lineWidth = 1.5;
      g.stroke();
      if (label.current) label.current.textContent = name.toUpperCase() + " · " + km(m.tdist);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [engineRef, name]);
  return (
    <button
      type="button"
      aria-label="Open the map"
      className="pointer-events-auto flex touch-none select-none flex-col items-center gap-0.5 sb-minimap"
      onClick={onOpen}
    >
      <canvas ref={cv} className="sb-minimap-cv block rounded-full" />
      <span ref={label} className="whitespace-nowrap font-display text-[0.6rem] tracking-widest text-accent" />
    </button>
  );
}
