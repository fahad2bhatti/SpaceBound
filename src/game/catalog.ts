export type ShipId =
  | "starter"
  | "orbital"
  | "lunar"
  | "advanced"
  | "heavy"
  | "elite"
  | "ultimate";

export type BodyId = "earth" | "moon" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune";

export type DestId =
  | "earth"
  | "orbit"
  | "station"
  | "moon"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune";

export type Upgrade = { engine: number; tank: number; nav: number };

export type ShipDef = {
  id: ShipId;
  name: string;
  category: string;
  price: number;
  speed: number;
  fuel: number;
  accel: number;
  crew: number;
  range: number;
  life: number;
  cargo: number;
  burn: number;
  unlock: string | null;
  blurb: string;
};

export type BodyDef = {
  id: BodyId;
  name: string;
  radius: number;
  atmo: number;
  g: number;
  dist: number;
  route: number;
  landable: boolean;
  gas: boolean;
  soi: number;
  color: string;
  blurb: string;
};

export type DestDef = {
  id: DestId;
  name: string;
  route: number;
  blurb: string;
  body: BodyId | null;
};

export type MissionDef = {
  id: string;
  name: string;
  brief: string;
  reward: number;
  requires: string | null;
  unlocks: ShipId | null;
  dest: DestId | null;
};

export const SHIP_LIST: ShipDef[] = [
  {
    id: "starter",
    name: "Ares Scout",
    category: "Starter Explorer",
    price: 0,
    speed: 4.2,
    fuel: 100,
    accel: 11,
    crew: 1,
    range: 90,
    life: 12 * 60,
    cargo: 1,
    burn: 2.4,
    unlock: null,
    blurb: "Single-seat trainer. Certified for Earth orbit and nothing farther.",
  },
  {
    id: "orbital",
    name: "Horizon",
    category: "Orbital Shuttle",
    price: 2500,
    speed: 5.1,
    fuel: 150,
    accel: 12,
    crew: 4,
    range: 160,
    life: 18 * 60,
    cargo: 2,
    burn: 2.6,
    unlock: "reach-orbit",
    blurb: "Winged orbiter for station runs. Still short of a lunar transfer.",
  },
  {
    id: "lunar",
    name: "Selene",
    category: "Lunar Explorer",
    price: 7000,
    speed: 5.6,
    fuel: 240,
    accel: 12,
    crew: 3,
    range: 360,
    life: 28 * 60,
    cargo: 4,
    burn: 2.8,
    unlock: "visit-station",
    blurb: "Legged lander with the tanks and life support the Moon actually demands.",
  },
  {
    id: "advanced",
    name: "Ares Ferry",
    category: "Advanced Interplanetary",
    price: 15000,
    speed: 6.2,
    fuel: 360,
    accel: 12.5,
    crew: 4,
    range: 700,
    life: 40 * 60,
    cargo: 6,
    burn: 3.1,
    unlock: "return-earth",
    blurb: "Habitable transfer ship. Mars is the design point.",
  },
  {
    id: "heavy",
    name: "Jove",
    category: "Heavy Exploration Ship",
    price: 28000,
    speed: 5.8,
    fuel: 520,
    accel: 13,
    crew: 6,
    range: 1100,
    life: 55 * 60,
    cargo: 10,
    burn: 3.6,
    unlock: "mars-samples",
    blurb: "External tanks and a brutal engine cluster for the Jovian well.",
  },
  {
    id: "elite",
    name: "Cronus",
    category: "Elite Deep Space Shuttle",
    price: 48000,
    speed: 7.2,
    fuel: 700,
    accel: 13,
    crew: 5,
    range: 1700,
    life: 70 * 60,
    cargo: 8,
    burn: 3.2,
    unlock: "jupiter-flyby",
    blurb: "Long-spine cruiser cleared through the Saturn system.",
  },
  {
    id: "ultimate",
    name: "Voyager Prime",
    category: "Ultimate Exploration Ship",
    price: 80000,
    speed: 8.2,
    fuel: 980,
    accel: 14,
    crew: 8,
    range: 3200,
    life: 100 * 60,
    cargo: 14,
    burn: 3.4,
    unlock: "saturn-flyby",
    blurb: "Ring-habitat flagship. The only hull rated for Uranus and Neptune.",
  },
];

export const SHIPS: Record<ShipId, ShipDef> = Object.fromEntries(
  SHIP_LIST.map((s) => [s.id, s]),
) as Record<ShipId, ShipDef>;

export const BODIES: Record<BodyId, BodyDef> = {
  earth: {
    id: "earth",
    name: "Earth",
    radius: 16,
    atmo: 3.6,
    g: 7.2,
    dist: 0,
    route: 0,
    landable: true,
    gas: false,
    soi: 55,
    color: "#7eb6ff",
    blurb: "Northline Launch Complex sits on the dawn terminator. Home.",
  },
  moon: {
    id: "moon",
    name: "Moon",
    radius: 5.2,
    atmo: 0,
    g: 1.35,
    dist: 210,
    route: 210,
    landable: true,
    gas: false,
    soi: 26,
    color: "#c5c8ce",
    blurb: "Airless, sharp, and close enough to get wrong in a hurry.",
  },
  mars: {
    id: "mars",
    name: "Mars",
    radius: 6.6,
    atmo: 1.1,
    g: 2.4,
    dist: 470,
    route: 470,
    landable: true,
    gas: false,
    soi: 34,
    color: "#c4654a",
    blurb: "Thin air, rust dunes, and a beacon on the dawn plain.",
  },
  jupiter: {
    id: "jupiter",
    name: "Jupiter",
    radius: 13,
    atmo: 4,
    g: 9.5,
    dist: 900,
    route: 900,
    landable: false,
    gas: true,
    soi: 54,
    color: "#d2b48c",
    blurb: "No surface. Thread the beacon above the cloud deck.",
  },
  saturn: {
    id: "saturn",
    name: "Saturn",
    radius: 11,
    atmo: 3,
    g: 7.2,
    dist: 1380,
    route: 1380,
    landable: false,
    gas: true,
    soi: 50,
    color: "#e6d3a3",
    blurb: "Rings and a science beacon. Do not try to land.",
  },
  uranus: {
    id: "uranus",
    name: "Uranus",
    radius: 7.4,
    atmo: 1.4,
    g: 5,
    dist: 2150,
    route: 2150,
    landable: false,
    gas: true,
    soi: 42,
    color: "#9fd6d2",
    blurb: "Cold ice giant. Survey beacon only.",
  },
  neptune: {
    id: "neptune",
    name: "Neptune",
    radius: 7.2,
    atmo: 1.5,
    g: 5.4,
    dist: 2700,
    route: 2700,
    landable: false,
    gas: true,
    soi: 42,
    color: "#3d6fbf",
    blurb: "The far marker of this catalog. Fly the beacon and come home.",
  },
};

export const DESTS: Record<DestId, DestDef> = {
  earth: {
    id: "earth",
    name: "Earth Spaceport",
    route: 0,
    body: "earth",
    blurb: "Northline. The only certified runway home.",
  },
  orbit: {
    id: "orbit",
    name: "Earth Orbit",
    route: 40,
    body: "earth",
    blurb: "Hold a stable band above the atmosphere.",
  },
  station: {
    id: "station",
    name: "Vesper Station",
    route: 80,
    body: null,
    blurb: "Crewed platform on the Earth-Moon route. Match speed, close in, and suit up if it needs repairs.",
  },
  moon: {
    id: "moon",
    name: "Moon",
    route: BODIES.moon.route,
    body: "moon",
    blurb: BODIES.moon.blurb,
  },
  mars: {
    id: "mars",
    name: "Mars",
    route: BODIES.mars.route,
    body: "mars",
    blurb: BODIES.mars.blurb,
  },
  jupiter: {
    id: "jupiter",
    name: "Jupiter",
    route: BODIES.jupiter.route,
    body: "jupiter",
    blurb: BODIES.jupiter.blurb,
  },
  saturn: {
    id: "saturn",
    name: "Saturn",
    route: BODIES.saturn.route,
    body: "saturn",
    blurb: BODIES.saturn.blurb,
  },
  uranus: {
    id: "uranus",
    name: "Uranus",
    route: BODIES.uranus.route,
    body: "uranus",
    blurb: BODIES.uranus.blurb,
  },
  neptune: {
    id: "neptune",
    name: "Neptune",
    route: BODIES.neptune.route,
    body: "neptune",
    blurb: BODIES.neptune.blurb,
  },
};

export const DEST_LIST: DestId[] = [
  "earth",
  "orbit",
  "station",
  "moon",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
];

export const MISSIONS: MissionDef[] = [
  {
    id: "first-launch",
    name: "First Launch",
    brief: "Board the Ares Scout, finish preflight, and leave the pad.",
    reward: 1200,
    requires: null,
    unlocks: null,
    dest: "orbit",
  },
  {
    id: "reach-orbit",
    name: "Reach Earth Orbit",
    brief: "Hold the orbital band above the atmosphere for 6 seconds.",
    reward: 1800,
    requires: "first-launch",
    unlocks: "orbital",
    dest: "orbit",
  },
  {
    id: "visit-station",
    name: "Visit the Space Station",
    brief: "Fly within range of Vesper Station and bleed off speed.",
    reward: 3000,
    requires: "reach-orbit",
    unlocks: "lunar",
    dest: "station",
  },
  {
    id: "travel-moon",
    name: "Travel to the Moon",
    brief: "Select the Moon and enter its sphere of influence.",
    reward: 3000,
    requires: "visit-station",
    unlocks: null,
    dest: "moon",
  },
  {
    id: "lunar-landing",
    name: "Lunar Landing",
    brief: "Find the beacon and set the ship down inside the pad tolerance.",
    reward: 4000,
    requires: "travel-moon",
    unlocks: null,
    dest: "moon",
  },
  {
    id: "moon-samples",
    name: "Collect Moon Samples",
    brief: "Step outside and collect three glowing samples. Watch your oxygen.",
    reward: 3500,
    requires: "lunar-landing",
    unlocks: null,
    dest: "moon",
  },
  {
    id: "return-earth",
    name: "Return to Earth",
    brief: "Lift off the Moon, ride back, and land at Northline.",
    reward: 7000,
    requires: "moon-samples",
    unlocks: "advanced",
    dest: "earth",
  },
  {
    id: "mars-transfer",
    name: "Mars Transfer",
    brief: "Enter the Martian sphere of influence.",
    reward: 5000,
    requires: "return-earth",
    unlocks: null,
    dest: "mars",
  },
  {
    id: "mars-landing",
    name: "Mars Landing",
    brief: "Land inside the Martian beacon.",
    reward: 6000,
    requires: "mars-transfer",
    unlocks: null,
    dest: "mars",
  },
  {
    id: "mars-samples",
    name: "Mars Samples",
    brief: "Collect three surface samples and return to the ship.",
    reward: 6000,
    requires: "mars-landing",
    unlocks: "heavy",
    dest: "mars",
  },
  {
    id: "jupiter-flyby",
    name: "Jupiter Flyby",
    brief: "Pass the cloud-deck beacon. There is no landing.",
    reward: 9000,
    requires: "mars-samples",
    unlocks: "elite",
    dest: "jupiter",
  },
  {
    id: "saturn-flyby",
    name: "Saturn Flyby",
    brief: "Thread the ring-plane beacon.",
    reward: 11000,
    requires: "jupiter-flyby",
    unlocks: "ultimate",
    dest: "saturn",
  },
  {
    id: "uranus-survey",
    name: "Uranus Survey",
    brief: "Reach the ice-giant survey beacon.",
    reward: 12000,
    requires: "saturn-flyby",
    unlocks: null,
    dest: "uranus",
  },
  {
    id: "neptune-survey",
    name: "Neptune Survey",
    brief: "Reach the final beacon and close the catalog.",
    reward: 16000,
    requires: "uranus-survey",
    unlocks: null,
    dest: "neptune",
  },
];

export const NAV_BONUS = 0.05;
export const MAX_UPGRADE = 3;

export function emptyUpgrades(): Record<ShipId, Upgrade> {
  const out = {} as Record<ShipId, Upgrade>;
  for (const s of SHIP_LIST) out[s.id] = { engine: 0, tank: 0, nav: 0 };
  return out;
}

export function shipStats(id: ShipId, up: Upgrade) {
  const s = SHIPS[id];
  const eng = 1 + 0.08 * up.engine;
  return {
    speed: s.speed * (1 + 0.05 * up.engine),
    accel: s.accel * eng,
    fuel: s.fuel * (1 + 0.18 * up.tank),
    range: s.range * (1 + NAV_BONUS * up.nav),
    life: s.life * (1 + 0.08 * up.nav),
    burn: s.burn * (1 - 0.04 * up.engine),
    crew: s.crew,
    cargo: s.cargo,
  };
}

export function maxRange(ship: ShipDef): number {
  return ship.range * (1 + NAV_BONUS * MAX_UPGRADE);
}

export function gateShip(route: number): ShipDef {
  return SHIP_LIST.find((s) => maxRange(s) >= route) ?? SHIP_LIST[SHIP_LIST.length - 1]!;
}

export function isShipUnlocked(done: readonly string[], ship: ShipDef): boolean {
  if (!ship.unlock) return true;
  return done.includes(ship.unlock);
}

export function upgradeCost(id: ShipId, level: number): number {
  const base = Math.max(SHIPS[id].price, 1800);
  const n = level + 1;
  return Math.round(base * 0.06 * n * n);
}

export function refuelCost(missing: number, remote: boolean): number {
  return Math.ceil(missing * (remote ? 4 : 2));
}

export function activeMission(done: readonly string[]): MissionDef | null {
  return (
    MISSIONS.find((m) => !done.includes(m.id) && (!m.requires || done.includes(m.requires))) ??
    null
  );
}

export function missionState(
  done: readonly string[],
  id: string,
): "locked" | "active" | "done" {
  if (done.includes(id)) return "done";
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) return "locked";
  if (!m.requires || done.includes(m.requires)) return "active";
  return "locked";
}

/** Fixed ecliptic placement. Distances are compressed simulation units. */
export function bodyOffset(id: BodyId): [number, number, number] {
  if (id === "earth") return [0, 0, 0];
  const b = BODIES[id];
  const ang: Record<Exclude<BodyId, "earth">, number> = {
    moon: 0.55,
    mars: 1.35,
    jupiter: 2.15,
    saturn: 2.9,
    uranus: 3.7,
    neptune: 4.55,
  };
  const a = ang[id];
  return [Math.cos(a) * b.dist, Math.sin(a) * b.dist * 0.07, Math.sin(a) * b.dist];
}

export function cruiseMultiplier(distanceFromEarth: number): number {
  if (distanceFromEarth < 280) return 1;
  return 1 + Math.min(1.8, (distanceFromEarth - 280) / 500);
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function km(units: number): string {
  return `${formatInt(units * 40)} km`;
}

export function mps(unitsPerSec: number): string {
  return `${formatInt(unitsPerSec * 250)} m/s`;
}
