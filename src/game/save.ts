import {
  emptyUpgrades,
  SHIPS,
  type BodyId,
  type DestId,
  type ShipId,
  type Upgrade,
} from "./catalog";
import { HINT_IDS } from "./hints";

export type Quality = "low" | "medium" | "high";

export type Settings = {
  muted: boolean;
  volume: number;
  quality: Quality;
  sens: number;
  ambient: boolean;
  assist: boolean;
  /** Mirror the touch controls (stick/D-pad on the right, buttons on the left). */
  leftHanded: boolean;
  /** Touch button and stick scale, 0.8 to 1.4. */
  touchScale: number;
  haptics: boolean;
};

export type Resume = {
  view: "pad" | "flight" | "surface";
  body: BodyId;
  dest: DestId;
  fuel: number;
  life: number;
  ox: number;
  pos: [number, number, number];
  vel: [number, number, number];
  quat: [number, number, number, number];
  yaw: number;
  wx: number;
  wz: number;
};

export type SaveData = {
  version: 1;
  started: boolean;
  credits: number;
  owned: ShipId[];
  selected: ShipId;
  upgrades: Record<ShipId, Upgrade>;
  fuel: Record<ShipId, number>;
  done: string[];
  samples: Partial<Record<BodyId, number>>;
  flags: { moonLanded: boolean; returning: boolean };
  destination: DestId;
  settings: Settings;
  stats: { launches: number; landings: number };
  /** First-time tips the player has already seen (see hints.ts). */
  hints: string[];
  resume: Resume | null;
};

const KEY = "spacebound-beyond-earth-v1";

export function defaultSave(): SaveData {
  const fuel = {} as Record<ShipId, number>;
  (Object.keys(SHIPS) as ShipId[]).forEach((id) => {
    fuel[id] = SHIPS[id].fuel;
  });
  return {
    version: 1,
    started: false,
    credits: 2000,
    owned: ["starter"],
    selected: "starter",
    upgrades: emptyUpgrades(),
    fuel,
    done: [],
    samples: {},
    flags: { moonLanded: false, returning: false },
    destination: "orbit",
    settings: {
      muted: false,
      volume: 0.7,
      quality: typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true ? "low" : "medium",
      sens: 0.0022,
      ambient: true,
      assist: typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true,
      leftHanded: false,
      touchScale: 1,
      haptics: true,
    },
    stats: { launches: 0, landings: 0 },
    hints: [],
    resume: null,
  };
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function sanitize(raw: Partial<SaveData>): SaveData {
  const base = defaultSave();
  const owned = (Array.isArray(raw.owned) ? raw.owned : base.owned).filter(
    (id): id is ShipId => typeof id === "string" && id in SHIPS,
  );
  if (!owned.includes("starter")) owned.unshift("starter");
  const selected = owned.includes(raw.selected as ShipId) ? (raw.selected as ShipId) : "starter";
  const upgrades = emptyUpgrades();
  if (raw.upgrades) {
    for (const id of Object.keys(upgrades) as ShipId[]) {
      const u = raw.upgrades[id];
      if (!u) continue;
      upgrades[id] = {
        engine: clamp(u.engine ?? 0, 0, 3),
        tank: clamp(u.tank ?? 0, 0, 3),
        nav: clamp(u.nav ?? 0, 0, 3),
      };
    }
  }
  const fuel = { ...base.fuel };
  if (raw.fuel) {
    for (const id of Object.keys(fuel) as ShipId[]) {
      const v = raw.fuel[id];
      if (typeof v === "number" && Number.isFinite(v)) fuel[id] = Math.max(0, v);
    }
  }
  const settings: Settings = {
    ...base.settings,
    ...(raw.settings ?? {}),
    volume: clamp(raw.settings?.volume ?? base.settings.volume, 0, 1),
    sens: clamp(raw.settings?.sens ?? base.settings.sens, 0.0008, 0.006),
    assist: typeof raw.settings?.assist === "boolean" ? raw.settings.assist : base.settings.assist,
    leftHanded: typeof raw.settings?.leftHanded === "boolean" ? raw.settings.leftHanded : base.settings.leftHanded,
    touchScale: clamp(raw.settings?.touchScale ?? base.settings.touchScale, 0.8, 1.4),
    haptics: typeof raw.settings?.haptics === "boolean" ? raw.settings.haptics : base.settings.haptics,
    quality:
      raw.settings?.quality === "low" || raw.settings?.quality === "high"
        ? raw.settings.quality
        : "medium",
  };
  const dest = raw.destination;
  const destination: DestId =
    dest === "earth" ||
    dest === "orbit" ||
    dest === "station" ||
    dest === "moon" ||
    dest === "mars" ||
    dest === "jupiter" ||
    dest === "saturn" ||
    dest === "uranus" ||
    dest === "neptune"
      ? dest
      : "orbit";
  // Saves from before tips existed: players who already launched have seen enough.
  const hints = Array.isArray(raw.hints)
    ? raw.hints.filter((x): x is string => typeof x === "string")
    : (raw.stats?.launches ?? 0) > 0
      ? [...HINT_IDS]
      : [];
  return {
    version: 1,
    started: Boolean(raw.started),
    credits: Math.max(0, Math.round(raw.credits ?? base.credits)),
    owned,
    selected,
    upgrades,
    fuel,
    done: Array.isArray(raw.done) ? raw.done.filter((x) => typeof x === "string") : [],
    samples: raw.samples ?? {},
    flags: {
      moonLanded: Boolean(raw.flags?.moonLanded),
      returning: Boolean(raw.flags?.returning),
    },
    destination,
    settings,
    stats: {
      launches: Math.max(0, raw.stats?.launches ?? 0),
      landings: Math.max(0, raw.stats?.landings ?? 0),
    },
    hints,
    resume: raw.resume ?? null,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    return sanitize(JSON.parse(raw) as Partial<SaveData>);
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota — game still runs this session */
  }
}

export function hasStartedSave(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as Partial<SaveData>;
    return Boolean(data.started);
  } catch {
    return false;
  }
}
