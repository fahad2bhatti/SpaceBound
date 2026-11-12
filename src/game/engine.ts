import * as THREE from "three";
import { Assets } from "./assets";
import {
  activeMission,
  BODIES,
  bodyOffset,
  cruiseMultiplier,
  DESTS,
  gateShip,
  isShipUnlocked,
  km,
  MISSIONS,
  mps,
  refuelCost,
  SHIPS,
  shipStats,
  upgradeCost,
  type BodyId,
  type DestId,
  type MissionDef,
  type ShipId,
  type Upgrade,
} from "./catalog";
import { AudioBus } from "./audio";
import { Input } from "./input";
import {
  bodyTexture,
  buildAstronaut,
  buildAtmosphere,
  buildShip,
  buildSpaceport,
  buildStars,
  buildTerrain,
  type AstronautRig,
  type ShipRig,
  type Terrain,
} from "./models";
import { haptic, setHapticsEnabled } from "./haptics";
import { gradeLanding } from "./landing";
import { KIND_LABEL, PLANETS, ZONE_COLORS, type ZoneDef, type ZoneKind } from "./planets";
import { defaultSave, loadSave, writeSave, type Quality, type SaveData, type Settings } from "./save";

export type Screen = "menu" | "garage" | "missions" | "solar" | "settings" | "credits" | "play" | "pause";
export type Phase =
  | "pad"
  | "cockpit"
  | "countdown"
  | "liftoff"
  | "flight"
  | "surface"
  | "surfaceCockpit"
  | "surfaceCountdown"
  | "surfaceLiftoff";
export type CamMode = "chase" | "cockpit";

export type Modal = { title: string; text: string; reward: number; kicker?: string };

export type Snap = {
  screen: Screen;
  fault: string | null;
  credits: number;
  started: boolean;
  phase: Phase;
  prompt: string | null;
  toast: string | null;
  selected: ShipId;
  inspect: ShipId;
  owned: ShipId[];
  done: string[];
  upgrades: SaveData["upgrades"];
  destination: DestId;
  chartFocus: DestId;
  settings: Settings;
  confirmNew: boolean;
  confirmReset: boolean;
  modal: Modal | null;
  countdown: number | null;
  checks: { fuel: boolean; eng: boolean; nav: boolean };
  fuel: number;
  fuelMax: number;
  life: number;
  ox: number;
  altitude: number;
  speed: number;
  climb: number;
  throttle: number;
  destDist: number;
  objective: string;
  detail: string;
  envelope: boolean;
  rangeLocked: boolean;
  braking: boolean;
  assistActive: boolean;
  hints: string[];
  cam: CamMode;
  flash: number;
  sampleCount: number;
  shipDist: number;
  docked: boolean;
  refuelPrice: number;
  body: BodyId;
  freeCam: boolean;
  atmo: { name: string; label: string; depth: number; tint: string } | null;
  zones: {
    found: number;
    total: number;
    scanIn: number;
    target: { name: string; kind: ZoneKind; dist: number; angle: number; near: boolean; inside: boolean } | null;
  } | null;
};

type LandingZone = { i: number; z: ZoneDef; arc: number; inside: boolean };

const PAD = new THREE.Vector3(0.2, 0.38, 0.9).normalize();
const FLIGHT_SCALE = 0.22;
// Landing assist: active below this altitude while descending (see applyLandingAssist).
const ASSIST_ALT = 45; // easy-flight-v1: assist ab pehle shuru hota hai
const ASSIST_DESC_MIN = 1.8;
const ASSIST_DRIFT_MIN = 2.2;
// land-anywhere-v1: touchdown limits for any spot outside a marked zone (same as the easy zones).
const FREE_LAND = { maxDescent: 6, maxDrift: 4.8 };
const BODY_IDS: BodyId[] = ["earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"];
// upright-turn-v1: upright rocket = nose up (rotate -90deg about X); gravity turn tilts it about the WORLD X axis.
const UPRIGHT_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const WORLD_X = new THREE.Vector3(1, 0, 0);

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
      setSteer?: (v: number) => void;
      debugBoard?: () => void;
      debugLaunch?: () => void;
      debugNear?: (id: string) => void;
    };
  }
}

type Puff = { mesh: THREE.Sprite; life: number; max: number; v: THREE.Vector3 };

export class Spacebound {
  readonly input = new Input();
  readonly audio = new AudioBus();

  private canvas: HTMLCanvasElement;
  private onChange: () => void;
  private dead = false;
  private raf = 0;
  private timer = new THREE.Timer();
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(62, 1, 0.08, 400);
  private assets: Assets;
  private save: SaveData;
  private fault: string | null = null;

  private screen: Screen = "menu";
  private phase: Phase = "pad";
  private camMode: CamMode = "chase";
  private view: "menu" | "garage" | "solar" | "pad" | "flight" | "surface" = "menu";
  // back-fix-v1: panel kahan se khola gaya (back ke liye)
  private backTo: Screen | null = null;
  private modalQ: Modal[] = [];
  private toastText: string | null = null;
  private toastT = 0;
  private flash = 0;
  private confirmNew = false;
  private confirmReset = false;
  private inspect: ShipId = "starter";
  private chartFocus: DestId = "orbit";
  private checks = { fuel: false, eng: false, nav: false };
  private notifyNow = true;
  private hudAcc = 0;
  private reduce: boolean;

  private menuScene = new THREE.Scene();
  private garageScene = new THREE.Scene();
  private solarScene = new THREE.Scene();
  private padScene = new THREE.Scene();
  private flightScene = new THREE.Scene();
  private surfaceScene: THREE.Scene | null = null;
  private activeScene: THREE.Scene = this.menuScene;

  private astro: AstronautRig;
  private menuRig: ShipRig | null = null;
  private garageRig: ShipRig | null = null;
  private padRig: ShipRig | null = null;
  private flightRig: ShipRig | null = null;
  private surfaceRig: ShipRig | null = null;
  private terrain: Terrain | null = null;
  private surfaceBody: BodyId = "moon";
  private garageYaw = 0.6;
  private garageDist = 11;
  private solarYaw = 0.4;
  private solarPitch = 0.35;
  private solarDist = 36;
  private menuT = 0;
  private solarMeshes: THREE.Object3D[] = [];
  private focusRing: THREE.Mesh;

  private bodyPos = new Map<BodyId, THREE.Vector3>();
  private beacons = new Map<string, THREE.Vector3>();
  private station = new THREE.Vector3();
  private heat: THREE.Mesh;
  private puffGroup = new THREE.Group();
  private puffs: Puff[] = [];
  private lamp: THREE.SpotLight;

  private fuel = 100;
  private life = 600;
  private ox = 100;
  private throttle = 0;
  private bank = 0;
  private count = 0;
  private lastBeep = 99;
  private liftY = 0;
  private liftV = 0;
  private sinceLaunch = 0;
  private orbitHold = 0;
  private orbitPaid = false;
  private stationPaid = false;
  private inside = new Set<string>();
  private flyPaid = new Set<string>();
  private replayAt = new Map<string, number>();
  private rangeLockToast = false;
  private walker = { x: 9, y: 0, z: 7, yaw: 0.8, vy: 0, speed: 0, pitch: 0.32, grounded: true, phase: 0 };
  private jumpHeld = false;
  private prevE = false;
  private prevC = false;
  private prevV = false;
  private prevEsc = false;
  private footT = 0;
  private screenT = 0;
  private saveT = 0;
  private camDist = 6.2;
  private lookX = 0;
  private lookY = 0;
  private shipHalfX = 1.6;
  private shipHalfZ = 2.4;
  yaw = 0;
  speedAbs = 0;

  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private v4 = new THREE.Vector3();
  private v5 = new THREE.Vector3();
  private basis = new THREE.Matrix4();
  private assistActive = false;
  private steerSm = 0; // easy-flight-v1
  private pitchSm = 0;
  // free-cam-v1
  private fcYaw = 0;
  private fcPitch = 0;
  private fcZoom = 1;
  private fcHold = 0;
  private look = { dx: 0, dy: 0, zoom: 0, active: false };
  private frameWheel = 0;
  // planet-zones-v1
  private zoneNs = new Map<BodyId, THREE.Vector3[]>();
  private zoneRings: { body: BodyId; idx: number; mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  private zA = new THREE.Vector3();
  private zB = new THREE.Vector3();
  private atmoBody: BodyId | null = null;
  private atmoDepth = 0;
  private atmoAud = 0;
  private scanT = 2;
  private scanCool = 0;
  private landedZone = 0;
  // land-anywhere-v1: exact touchdown direction (unit vector from the planet centre), used for the next liftoff.
  private landed: { body: BodyId; n: THREE.Vector3 } | null = null;
  private prevR = false;
  private aUp = new THREE.Vector3();
  private aFwd = new THREE.Vector3();
  private aSide = new THREE.Vector3();
  private aHoriz = new THREE.Vector3();
  private aQ = new THREE.Quaternion();
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private clockMouse = { x: 0, y: 0 };
  private onPointer: () => void;
  private onResize: () => void;
  private onVis: () => void;

  constructor(canvas: HTMLCanvasElement, onChange: () => void) {
    this.canvas = canvas;
    this.onChange = onChange;
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.save = loadSave();
    this.inspect = this.save.selected;
    this.chartFocus = this.save.destination;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.save.settings.quality !== "low",
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = this.save.settings.quality !== "low";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x07090d, 1);
    if (!this.renderer.getContext()) {
      this.fault = "WebGL is unavailable in this browser.";
    }
    this.assets = new Assets();
    this.audio.setVolume(this.save.settings.volume);
    this.audio.setMuted(this.save.settings.muted);
    this.audio.setAmbient(this.save.settings.ambient);
    setHapticsEnabled(this.save.settings.haptics);
    this.astro = buildAstronaut(this.assets);
    this.lamp = new THREE.SpotLight(0xdde7ff, 0, 16, 0.55, 0.45, 1);
    this.lamp.position.set(0, 1.55, 0.2);
    this.astro.group.add(this.lamp);
    this.lamp.target.position.set(0, 1.1, 3);
    this.astro.group.add(this.lamp.target);
    this.heat = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff5a2a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    );
    this.focusRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.03, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xe8893a }),
    );
    this.focusRing.rotation.x = Math.PI / 2;
    this.initPuffs();
    this.cacheBodies();
    this.buildMenu();
    this.buildGarage();
    this.buildSolar();
    this.buildPad();
    this.buildFlight();
    this.input.attach(canvas);
    this.onPointer = () => this.audio.unlock();
    this.onResize = () => this.resize();
    this.onVis = () => {
      if (document.hidden) this.audio.suspend();
      else this.audio.resume();
    };
    window.addEventListener("pointerdown", this.onPointer);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVis);
    this.resize();
    this.applyQuality();
    this.useScene(this.menuScene, "menu");
    this.installProbe();
    this.timer.update();
    this.raf = requestAnimationFrame(this.loop);
    this.notifyNow = true;
  }

  dispose(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this.input.exitLock();
    window.removeEventListener("pointerdown", this.onPointer);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVis);
    this.audio.dispose();
    for (const s of [this.menuScene, this.garageScene, this.solarScene, this.padScene, this.flightScene, this.surfaceScene]) {
      if (s) this.disposeScene(s);
    }
    for (const p of this.puffs) (p.mesh.material as THREE.Material).dispose();
    (this.heat.material as THREE.Material).dispose();
    this.heat.geometry.dispose();
    this.assets.dispose();
    this.renderer.dispose();
    if (window.__controlsTest) delete window.__controlsTest;
  }

  getSnap(): Snap {
    const stats = this.stats();
    const mission = activeMission(this.save.done);
    const missing = Math.max(0, stats.fuel - this.fuel);
    const docked = this.phase !== "flight" && this.phase !== "liftoff";
    return {
      screen: this.screen,
      fault: this.fault,
      credits: this.save.credits,
      started: this.save.started,
      phase: this.phase,
      prompt: this.prompt(),
      toast: this.toastText,
      selected: this.save.selected,
      inspect: this.inspect,
      owned: this.save.owned,
      done: this.save.done,
      upgrades: this.save.upgrades,
      destination: this.save.destination,
      chartFocus: this.chartFocus,
      settings: this.save.settings,
      confirmNew: this.confirmNew,
      confirmReset: this.confirmReset,
      modal: this.modalQ[0] ?? null,
      countdown:
        this.phase === "countdown" || this.phase === "surfaceCountdown" ? Math.max(0, Math.ceil(this.count)) : null,
      checks: this.checks,
      fuel: this.fuel,
      fuelMax: stats.fuel,
      life: this.life,
      ox: this.ox,
      altitude: this.phase === "flight" ? this.altitude() : this.liftY,
      speed: this.phase === "flight" ? this.velLen() : Math.abs(this.walker.speed),
      climb: this.phase === "flight" ? this.climbRate() : this.liftV,
      throttle: this.throttle,
      destDist: this.phase === "flight" ? this.pos().distanceTo(this.targetPoint(this.v5)) : 0,
      objective: mission ? mission.name : "Catalog complete",
      detail: this.detail(mission),
      envelope: this.inEnvelope(),
      rangeLocked: this.outOfRange(),
      braking: this.phase === "flight" && this.velLen() > this.speedCap() * 1.08,
      assistActive: this.phase === "flight" && this.assistActive,
      hints: this.save.hints,
      cam: this.camMode,
      flash: this.flash,
      sampleCount: this.save.samples[this.surfaceBody] ?? 0,
      shipDist: this.shipDistance(),
      docked,
      refuelPrice: refuelCost(missing, this.phase.startsWith("surface")),
      body: this.phase.startsWith("surface") ? this.surfaceBody : this.dominant(),
      freeCam:
        this.phase === "flight" &&
        this.camMode === "chase" &&
        (this.look.active || Math.abs(this.fcYaw) + Math.abs(this.fcPitch) + Math.abs(this.fcZoom - 1) > 0.05),
      atmo:
        this.phase === "flight" && this.atmoBody
          ? {
              name: BODIES[this.atmoBody].name,
              label: PLANETS[this.atmoBody].label,
              depth: this.atmoDepth,
              tint: PLANETS[this.atmoBody].tint,
            }
          : null,
      zones: this.zoneSnap(),
    };
  }

  requestNew(): void {
    this.audio.unlock();
    if (this.save.started) {
      this.confirmNew = true;
      this.notifyNow = true;
      return;
    }
    this.newGame();
  }

  cancelNew(): void {
    this.confirmNew = false;
    this.notifyNow = true;
  }

  newGame(): void {
    const settings = { ...this.save.settings };
    const hints = [...this.save.hints];
    this.save = defaultSave();
    this.save.settings = settings;
    this.save.hints = hints;
    this.save.started = true;
    this.confirmNew = false;
    this.modalQ = [];
    this.landed = null;
    this.inspect = "starter";
    this.syncRuntimeFromShip(true);
    this.enterPad();
    this.screen = "play";
    this.toast("Walk to the hatch and press E.");
    this.persist(true);
    this.notifyNow = true;
  }

  continueGame(): void {
    this.audio.unlock();
    if (!this.save.started) {
      this.newGame();
      return;
    }
    this.confirmNew = false;
    const resume = this.save.resume;
    this.syncRuntimeFromShip(false);
    if (!resume || resume.view === "pad") this.enterPad();
    else if (resume.view === "surface") {
      this.fuel = resume.fuel;
      this.life = resume.life;
      this.ox = resume.ox;
      this.enterSurface(resume.body, false);
      this.landedZone = resume.zi ?? 0;
      this.walker.x = resume.wx;
      this.walker.z = resume.wz;
      this.walker.yaw = resume.yaw;
    } else {
      this.fuel = resume.fuel;
      this.life = resume.life;
      this.pos().fromArray(resume.pos);
      this.flightVel().fromArray(resume.vel);
      this.ensureFlightRig().group.quaternion.fromArray(resume.quat);
      this.phase = "flight";
      this.camMode = "chase";
      this.screen = "play";
      this.useScene(this.flightScene, "flight");
      this.attachPuffs(this.flightScene);
    }
    this.screen = "play";
    this.notifyNow = true;
  }

  open(screen: Screen): void {
    this.audio.ui();
    this.confirmNew = false;
    this.confirmReset = false;
    if (screen === "garage" || screen === "solar" || screen === "missions" || screen === "settings" || screen === "credits") {
      if (this.screen === "menu" || this.screen === "pause" || this.screen === "play") this.backTo = this.screen;
    }
    if (screen === "menu") {
      this.screen = "menu";
      this.input.exitLock();
      this.captureResume();
      this.persist(true);
      this.useScene(this.menuScene, "menu");
    } else if (screen === "garage") {
      this.inspect = this.save.selected;
      this.mountGarage();
      this.screen = "garage";
      this.useScene(this.garageScene, "garage");
    } else if (screen === "solar") {
      this.chartFocus = this.save.destination;
      this.screen = "solar";
      this.useScene(this.solarScene, "solar");
    } else if (screen === "missions" || screen === "settings" || screen === "credits") {
      this.screen = screen;
      if (this.view === "flight" || this.view === "pad" || this.view === "surface") {
        /* keep the world behind the panel */
      } else this.useScene(this.menuScene, "menu");
    } else if (screen === "play") {
      this.resumePlay();
      return;
    } else if (screen === "pause") {
      this.pause();
      return;
    }
    this.notifyNow = true;
  }

  back(): void {
    this.audio.ui();
    const to = this.backTo;
    this.backTo = null;
    if (to === "menu") {
      this.open("menu");
      return;
    }
    if (to === "pause") {
      this.resumePlay();
      this.screen = "pause";
      this.notifyNow = true;
      return;
    }
    if (this.save.started && (this.phase === "flight" || this.phase.startsWith("surface") || this.phase === "pad" || this.phase === "cockpit")) {
      this.resumePlay();
      return;
    }
    this.open("menu");
  }

  resumePlay(): void {
    this.screen = "play";
    this.input.exitLock();
    if (this.phase === "flight") this.useScene(this.flightScene, "flight");
    else if (this.phase.startsWith("surface")) this.useScene(this.surfaceScene ?? this.padScene, "surface");
    else this.useScene(this.padScene, "pad");
    this.notifyNow = true;
  }

  pause(): void {
    if (this.screen !== "play") return;
    this.screen = "pause";
    this.input.exitLock();
    this.captureResume();
    this.persist(true);
    this.notifyNow = true;
  }

  ackModal(): void {
    this.audio.ui();
    this.modalQ.shift();
    this.notifyNow = true;
  }

  requestReset(): void {
    this.confirmReset = true;
    this.notifyNow = true;
  }

  cancelReset(): void {
    this.confirmReset = false;
    this.notifyNow = true;
  }

  resetProgress(): void {
    const settings = { ...this.save.settings };
    const hints = [...this.save.hints];
    this.save = defaultSave();
    this.save.settings = settings;
    this.save.hints = hints;
    this.confirmReset = false;
    this.modalQ = [];
    this.syncRuntimeFromShip(true);
    this.screen = "menu";
    this.useScene(this.menuScene, "menu");
    this.persist(true);
    this.toast("Progress cleared.");
    this.notifyNow = true;
  }

  setInspect(id: ShipId): void {
    this.inspect = id;
    this.mountGarage();
    this.notifyNow = true;
  }

  buy(id: ShipId): void {
    this.audio.ui();
    const ship = SHIPS[id];
    if (!isShipUnlocked(this.save.done, ship)) {
      const mission = MISSIONS.find((m) => m.id === ship.unlock);
      this.toast(mission ? `Locked until you complete ${mission.name}.` : "Locked.");
      return;
    }
    if (this.save.owned.includes(id)) {
      this.toast("Already in the hangar.");
      return;
    }
    if (this.save.credits < ship.price) {
      this.toast(`Need ${ship.price - this.save.credits} more credits.`);
      return;
    }
    this.save.credits -= ship.price;
    this.save.owned.push(id);
    this.save.fuel[id] = shipStats(id, this.save.upgrades[id]).fuel;
    this.toast(`${ship.name} is yours.`);
    this.persist(true);
    this.notifyNow = true;
  }

  sell(id: ShipId): void {
    this.audio.ui();
    if (!this.save.owned.includes(id)) return;
    if (id === this.save.selected) {
      this.toast("Select another ship before selling this one.");
      return;
    }
    if (this.save.owned.length < 2) {
      this.toast("You can't sell your only spacecraft.");
      return;
    }
    const pay = Math.round(SHIPS[id].price * 0.5);
    this.save.owned = this.save.owned.filter((s) => s !== id);
    this.save.credits += pay;
    this.toast(`Sold for ${pay} credits.`);
    this.persist(true);
    this.notifyNow = true;
  }

  selectShip(id: ShipId): void {
    this.audio.ui();
    if (!this.save.owned.includes(id)) {
      this.toast("Buy it before selecting it.");
      return;
    }
    if (this.phase === "flight" || this.phase.startsWith("surface")) {
      this.toast("Land at Northline before changing spacecraft.");
      return;
    }
    this.parkFuel();
    this.save.selected = id;
    this.inspect = id;
    this.syncRuntimeFromShip(false);
    this.mountPadShip();
    this.mountMenuShip();
    this.mountGarage();
    this.toast(`${SHIPS[id].name} is on the pad.`);
    this.persist(true);
    this.notifyNow = true;
  }

  upgrade(slot: keyof Upgrade): void {
    this.audio.ui();
    const id = this.inspect;
    if (!this.save.owned.includes(id)) {
      this.toast("Own this ship before upgrading it.");
      return;
    }
    const level = this.save.upgrades[id][slot];
    if (level >= 3) {
      this.toast("That system is maxed.");
      return;
    }
    const cost = upgradeCost(id, level);
    if (this.save.credits < cost) {
      this.toast(`Upgrade costs ${cost} credits.`);
      return;
    }
    this.save.credits -= cost;
    this.save.upgrades[id][slot] += 1;
    if (id === this.save.selected) this.life = Math.min(this.stats().life, this.life);
    this.toast("Upgrade installed.");
    this.persist(true);
    this.notifyNow = true;
  }

  setDest(id: DestId): void {
    this.audio.ui();
    const route = DESTS[id].route;
    const range = this.stats().range;
    if (range + 0.01 < route) {
      const gate = gateShip(route);
      this.toast(`${SHIPS[this.save.selected].name} range ${Math.round(range)} can't cover route ${route}. You need ${gate.name} or better.`);
      this.chartFocus = id;
      this.notifyNow = true;
      return;
    }
    this.save.destination = id;
    this.chartFocus = id;
    this.toast(`Nav target: ${DESTS[id].name}.`);
    this.persist(true);
    this.notifyNow = true;
  }

  focusChart(id: DestId): void {
    this.chartFocus = id;
    this.notifyNow = true;
  }

  markHint(id: string): void {
    if (this.save.hints.includes(id)) return;
    this.save.hints = [...this.save.hints, id];
    this.persist(true);
    this.notifyNow = true;
  }

  replayHints(): void {
    this.save.hints = [];
    this.persist(true);
    this.toast("Tips will show again.");
    this.notifyNow = true;
  }

  setSettings(partial: Partial<Settings>): void {
    this.save.settings = { ...this.save.settings, ...partial };
    this.audio.setVolume(this.save.settings.volume);
    this.audio.setMuted(this.save.settings.muted);
    this.audio.setAmbient(this.save.settings.ambient);
    setHapticsEnabled(this.save.settings.haptics);
    if (partial.quality) this.applyQuality();
    this.persist(true);
    this.notifyNow = true;
  }

  confirmCheck(part: "fuel" | "eng" | "nav"): void {
    this.audio.ui();
    if (part === "fuel") {
      if (this.fuel < this.stats().fuel * 0.15) {
        this.toast("Tanks are below the launch minimum. Refuel.");
        return;
      }
      this.checks.fuel = true;
    } else if (part === "eng") this.checks.eng = true;
    else if (this.stats().range + 0.01 < DESTS[this.save.destination].route) {
      this.toast("Nav target is outside this ship's certified range.");
      return;
    } else this.checks.nav = true;
    this.notifyNow = true;
  }

  requestLaunch(): void {
    this.audio.unlock();
    if (this.phase !== "cockpit" && this.phase !== "surfaceCockpit") {
      this.toast("Board the ship first.");
      return;
    }
    if (!this.checks.fuel || !this.checks.eng || !this.checks.nav) {
      this.toast("Finish the three preflight checks.");
      return;
    }
    this.phase = this.phase === "surfaceCockpit" ? "surfaceCountdown" : "countdown";
    this.count = 10;
    this.lastBeep = 10;
    this.throttle = 0.45;
    this.camMode = "cockpit";
    this.applyHull();
    this.notifyNow = true;
  }

  refuel(): void {
    this.audio.ui();
    const max = this.stats().fuel;
    const missing = max - this.fuel;
    if (missing < 1) {
      this.toast("Tanks are already full.");
      return;
    }
    if (this.phase === "flight" || this.phase === "liftoff") {
      this.toast("Refuel on the ground.");
      return;
    }
    const price = refuelCost(missing, this.phase.startsWith("surface"));
    if (this.save.credits < price) {
      this.toast(`Refuel costs ${price} credits.`);
      return;
    }
    this.save.credits -= price;
    this.fuel = max;
    this.toast("Tanks topped off.");
    this.persist(true);
    this.notifyNow = true;
  }

  abortToOrbit(): void {
    if (this.phase !== "flight" && !this.phase.startsWith("surface")) {
      this.toast("Abort is for when you're off the pad.");
      return;
    }
    this.audio.alarm();
    const earth = BODIES.earth;
    this.ensureFlightRig();
    this.pos().copy(PAD).multiplyScalar(earth.radius + 8);
    const tangent = this.v1.crossVectors(PAD, new THREE.Vector3(0, 1, 0)).normalize();
    this.flightVel().copy(tangent).multiplyScalar(3.4);
    this.orientShip(tangent, PAD);
    this.resetFlightControls();
    this.fuel = Math.max(this.fuel, this.stats().fuel * 0.3);
    this.life = Math.max(this.life, 180);
    this.phase = "flight";
    this.screen = "play";
    this.useScene(this.flightScene, "flight");
    this.attachPuffs(this.flightScene);
    this.toast("Abort burn. You're back in Earth orbit.");
    this.notifyNow = true;
  }

  private installProbe(): void {
    if (!import.meta.env.DEV) return;
    const self = this;
    window.__controlsTest = {
      getYaw: () => self.yaw,
      getSpeed: () => self.speedAbs,
      setKeys: (codes) => self.input.setOverride(codes),
      setSteer: (v) => {
        self.input.steerOverride = v;
      },
    };
    if (new URLSearchParams(location.search).get("qa") === "1") {
      window.__controlsTest.debugBoard = () => self.debugBoard();
      window.__controlsTest.debugLaunch = () => self.debugLaunch();
      window.__controlsTest.debugNear = (id) => self.debugNear(id);
    }
  }

  private debugBoard(): void {
    if (!this.save.started) this.newGame();
    this.enterPad();
    this.screen = "play";
    const h = this.hatchWorld(this.padRig!, this.v1);
    this.walker.x = h.x + 0.4;
    this.walker.z = h.z + 0.2;
    this.walker.y = 0;
    this.interact();
  }

  private debugLaunch(): void {
    this.debugBoard();
    this.checks = { fuel: true, eng: true, nav: true };
    this.requestLaunch();
    this.count = 0.08;
  }

  private debugNear(id: string): void {
    if (!this.save.started) this.newGame();
    const body = (BODY_IDS.includes(id as BodyId) ? id : "moon") as BodyId;
    this.ensureFlightRig();
    const p = this.bodyPos.get(body)!;
    const n = this.zoneNormal(body, this.v2);
    this.pos().copy(p).addScaledVector(n, BODIES[body].radius + (BODIES[body].gas ? 16 : 14));
    this.flightVel().set(0, 0, 0);
    this.orientShip(n, new THREE.Vector3(0, 1, 0));
    this.fuel = this.stats().fuel;
    this.phase = "flight";
    this.screen = "play";
    this.useScene(this.flightScene, "flight");
    this.attachPuffs(this.flightScene);
    this.notifyNow = true;
  }

  private loop = (t: number): void => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update(t);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    if (!document.hidden && dt > 0 && !this.fault) {
      try {
        this.update(dt);
      } catch (err) {
        console.error(err);
        this.fault = err instanceof Error ? err.message : "Simulation error";
        this.notifyNow = true;
      }
    }
    if (!this.fault) this.renderer.render(this.activeScene, this.camera);
    this.hudAcc += dt;
    if (this.notifyNow || this.hudAcc > 0.12) {
      this.notifyNow = false;
      this.hudAcc = 0;
      if (!this.dead) this.onChange();
    }
  };

  private update(dt: number): void {
    this.menuT += dt;
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) {
        this.toastText = null;
        this.notifyNow = true;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 1.6);
    const mouse = this.input.consumeMouse();
    this.clockMouse.x = mouse.x;
    this.clockMouse.y = mouse.y;
    const pulses = this.input.consumePulses();
    const click = this.input.consumeClick();
    const drag = this.input.consumeDrag();
    const wheel = this.input.consumeWheel();
    this.handleEdges(pulses);
    this.look = this.input.consumeLook(); // free-cam-v1: consumed every frame so nothing piles up
    this.frameWheel = wheel;
    if (this.phase !== "flight" && this.atmoBody) {
      this.atmoBody = null;
      this.atmoDepth = 0;
      this.atmoAud = 0;
      this.audio.setAtmo(0);
    }

    if (this.view === "solar" && click) this.pickSolar(click);
    else if (click && this.screen === "play" && this.modalQ.length === 0) this.input.requestLock();

    const simulate = this.screen === "play" && this.modalQ.length === 0;
    if (this.view === "menu") this.animMenu(dt);
    else if (this.view === "garage") this.animGarage(dt, drag, wheel);
    else if (this.view === "solar") this.animSolar(dt, drag, wheel);
    else if (simulate) this.animPlay(dt);
    this.tickSpin(dt);

    this.saveT += dt;
    if (this.saveT > 2) {
      this.saveT = 0;
      this.captureResume();
      this.persist(false);
    }
  }

  private handleEdges(pulses: { interact: boolean; launch: boolean; cam: boolean }): void {
    const e = this.input.held("KeyE") || this.input.held("KeyF");
    if ((e && !this.prevE) || pulses.interact) this.interact();
    this.prevE = e;
    const c = this.input.held("KeyC");
    if ((c && !this.prevC) || pulses.cam) this.cycleCam();
    this.prevC = c;
    const v = this.input.held("KeyV");
    if (v && !this.prevV && this.phase === "flight") this.levelShip(false);
    this.prevV = v;
    const rk = this.input.held("KeyR");
    if (rk && !this.prevR) this.scanNow();
    this.prevR = rk;
    const esc = this.input.held("Escape");
    if (esc && !this.prevEsc) this.onEsc();
    this.prevEsc = esc;
    if (pulses.launch) this.requestLaunch();
  }

  // phone-fix-escape-v1
  escape(): void {
    this.onEsc();
  }

  private onEsc(): void {
    if (this.modalQ.length) {
      this.ackModal();
      return;
    }
    if (this.confirmNew || this.confirmReset) {
      this.confirmNew = false;
      this.confirmReset = false;
      this.notifyNow = true;
      return;
    }
    if (this.screen === "pause") this.resumePlay();
    else if (this.screen === "play") this.pause();
    else if (this.screen !== "menu") this.back();
  }

  private cycleCam(): void {
    if (this.phase === "pad" || this.phase === "surface") {
      this.camDist = this.camDist > 6 ? 4.2 : 6.6;
      return;
    }
    this.camMode = this.camMode === "chase" ? "cockpit" : "chase";
    this.applyHull();
    this.notifyNow = true;
  }

  private interact(): void {
    if (this.screen !== "play" || this.modalQ.length) return;
    if (this.phase === "countdown" || this.phase === "surfaceCountdown") {
      this.phase = this.phase === "countdown" ? "cockpit" : "surfaceCockpit";
      this.throttle = 0;
      this.audio.setThrottle(0);
      this.toast("Countdown aborted.");
      this.notifyNow = true;
      return;
    }
    if (this.phase === "cockpit" || this.phase === "surfaceCockpit") {
      this.exitHatch();
      return;
    }
    if (this.phase === "pad") {
      const h = this.hatchWorld(this.padRig!, this.v1);
      if (this.walkerDist(h) < 2.6) {
        this.board("cockpit");
        return;
      }
      if (this.walkerDistXYZ(7.5, -5) < 2.8) {
        this.refuel();
        return;
      }
    }
    if (this.phase === "surface" && this.surfaceRig && this.terrain) {
      for (const s of this.terrain.samples) {
        if (!s.visible) continue;
        if (this.walkerDist(s.position) < 2.1) {
          this.collectSample(s);
          return;
        }
      }
      const h = this.hatchWorld(this.surfaceRig, this.v1);
      if (this.walkerDist(h) < 2.6) this.board("surfaceCockpit");
    }
  }

  private board(next: "cockpit" | "surfaceCockpit"): void {
    this.phase = next;
    this.camMode = "cockpit";
    this.checks = { fuel: false, eng: false, nav: false };
    this.lookX = 0;
    this.lookY = 0;
    this.astro.group.visible = false;
    this.applyHull();
    this.input.exitLock();
    this.toast(next === "cockpit" ? "Preflight the three checks, then ignite." : "Ascent checklist. Confirm tanks, engines, and the route home.");
    this.notifyNow = true;
  }

  private exitHatch(): void {
    const rig = this.phase.startsWith("surface") ? this.surfaceRig : this.padRig;
    this.phase = this.phase.startsWith("surface") ? "surface" : "pad";
    this.camMode = "chase";
    this.throttle = 0;
    this.audio.setThrottle(0);
    if (rig) {
      const h = this.hatchWorld(rig, this.v1);
      this.walker.x = h.x + 1.1;
      this.walker.z = h.z;
      this.walker.vy = 0;
    }
    this.astro.group.visible = true;
    this.applyHull();
    this.notifyNow = true;
  }

  private collectSample(mesh: THREE.Object3D): void {
    mesh.visible = false;
    const body = this.surfaceBody;
    const prev = this.save.samples[body] ?? 0;
    const next = prev + 1;
    this.save.samples[body] = next;
    this.audio.ui();
    if (prev < 3 && next >= 3) {
      if (body === "moon") this.tryEvent("moon-samples");
      if (body === "mars") this.tryEvent("mars-samples");
    } else if (next > 3) {
      this.save.credits += 100;
      this.toast("Extra sample stowed. +100 cr");
    } else this.toast(`Sample ${Math.min(next, 3)} of 3.`);
    this.persist(true);
    this.notifyNow = true;
  }

  private animPlay(dt: number): void {
    if (this.phase === "pad" || this.phase === "surface") this.updateWalker(dt);
    else if (this.phase === "cockpit" || this.phase === "surfaceCockpit") this.updateCockpitCam(dt);
    else if (this.phase === "countdown" || this.phase === "surfaceCountdown") this.updateCountdown(dt);
    else if (this.phase === "liftoff" || this.phase === "surfaceLiftoff") this.updateLiftoff(dt);
    else if (this.phase === "flight") this.updateFlight(dt);
    this.screenT += dt;
    if (this.screenT > 0.25 && this.camMode === "cockpit") {
      this.screenT = 0;
      this.paintInstruments();
    }
  }

  private updateWalker(dt: number): void {
    const moon = this.phase === "surface" && this.surfaceBody === "moon";
    const mars = this.phase === "surface" && this.surfaceBody === "mars";
    const g = this.phase === "pad" ? 14 : moon ? 1.62 : mars ? 3.71 : 9;
    let steer = 0;
    let throttle = 0;
    if (this.input.steerOverride !== null) steer = this.input.steerOverride;
    else {
      if (this.input.held("KeyA") || this.input.held("ArrowLeft")) steer += 1;
      if (this.input.held("KeyD") || this.input.held("ArrowRight")) steer -= 1;
    }
    if (this.input.held("KeyW") || this.input.held("ArrowUp")) throttle += 1;
    if (this.input.held("KeyS") || this.input.held("ArrowDown")) throttle -= 1;
    const touch = this.input.touch;
    if (this.input.override === null) {
      steer += -touch.x;
      throttle += touch.y;
    }
    steer = THREE.MathUtils.clamp(steer, -1, 1);
    throttle = THREE.MathUtils.clamp(throttle, -1, 1);
    if (this.input.pointerLocked) {
      this.walker.yaw -= this.clockMouse.x * this.save.settings.sens;
      this.walker.pitch = THREE.MathUtils.clamp(
        this.walker.pitch + this.clockMouse.y * this.save.settings.sens,
        -0.2,
        1.05,
      );
    }
    // A → +yaw. forward = (-sin yaw, -cos yaw) so +yaw noses left on the chase cam.
    this.walker.yaw += steer * 2.6 * dt;
    const yaw = this.walker.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const run = this.input.held("ShiftLeft") || this.input.held("ShiftRight") || touch.run;
    const max = (run ? 6.5 : 3.55) * (throttle < 0 ? 0.65 : 1);
    const target = throttle * max;
    if (this.walker.speed < target) this.walker.speed = Math.min(target, this.walker.speed + 14 * dt);
    else this.walker.speed = Math.max(target, this.walker.speed - 18 * dt);
    this.walker.x += fx * this.walker.speed * dt;
    this.walker.z += fz * this.walker.speed * dt;
    const lim = this.phase === "pad" ? 30 : 52;
    const radial = Math.hypot(this.walker.x, this.walker.z);
    if (radial > lim) {
      this.walker.x *= lim / radial;
      this.walker.z *= lim / radial;
    }
    const rig = this.phase === "pad" ? this.padRig : this.surfaceRig;
    if (rig) this.pushShip(rig);
    if (this.terrain && this.phase === "surface") {
      for (const rock of this.terrain.rocks) {
        const dx = this.walker.x - rock.x;
        const dz = this.walker.z - rock.z;
        const d = Math.hypot(dx, dz);
        if (d < rock.r && d > 0.001) {
          this.walker.x = rock.x + (dx / d) * rock.r;
          this.walker.z = rock.z + (dz / d) * rock.r;
        }
      }
    }
    const ground =
      this.phase === "surface" && this.terrain ? this.terrain.heightAt(this.walker.x, this.walker.z) : 0;
    const jump = this.input.held("Space") || touch.jump;
    if (jump && !this.jumpHeld && this.walker.grounded) {
      const hop = this.phase === "pad" ? 1.15 : moon ? 2.4 : 1.4;
      this.walker.vy = Math.sqrt(2 * g * hop);
      this.walker.grounded = false;
    }
    this.jumpHeld = jump;
    this.walker.vy -= g * dt;
    this.walker.y += this.walker.vy * dt;
    if (this.walker.y <= ground) {
      this.walker.y = ground;
      this.walker.vy = 0;
      this.walker.grounded = true;
    } else this.walker.grounded = false;

    const moving = Math.abs(this.walker.speed) > 0.35 && this.walker.grounded;
    const amp = moving ? 0.75 : 0;
    if (moving) this.walker.phase += dt * (run ? 11 : 8) * (Math.abs(this.walker.speed) / 3.5);
    this.astro.legL.rotation.x = Math.sin(this.walker.phase) * amp;
    this.astro.legR.rotation.x = Math.sin(this.walker.phase + Math.PI) * amp;
    this.astro.armL.rotation.x = Math.sin(this.walker.phase + Math.PI) * amp * 0.65;
    this.astro.armR.rotation.x = Math.sin(this.walker.phase) * amp * 0.65;
    const bob = moving ? Math.abs(Math.sin(this.walker.phase)) * 0.05 : 0;
    this.astro.group.position.set(this.walker.x, this.walker.y + bob, this.walker.z);
    this.orientFlat(this.astro.group, fx, fz);
    this.yaw = this.walker.yaw;
    this.speedAbs = Math.abs(this.walker.speed);

    if (moving) {
      this.footT -= dt;
      const step = run ? 0.28 : 0.42;
      if (this.footT <= 0) {
        this.footT = step;
        this.audio.foot();
      }
    }
    if (this.phase === "surface") {
      this.ox -= (mars ? 1.55 : 1.2) * dt;
      if (this.ox <= 0) {
        this.ox = 40;
        if (rig) {
          const h = this.hatchWorld(rig, this.v1);
          this.walker.x = h.x + 1.2;
          this.walker.z = h.z;
        }
        this.audio.alarm();
        this.toast("Suit pressure critical. Back to the hatch.");
      }
      this.lamp.intensity = moon ? 6 : 1.2;
    } else this.lamp.intensity = 0;

    const cp = this.walker.pitch;
    const dist = this.camDist;
    const back = dist * Math.cos(cp);
    const up = 1.35 + dist * Math.sin(cp);
    this.v4.set(this.walker.x - fx * back, this.walker.y + up, this.walker.z - fz * back);
    const k = 1 - Math.exp(-8 * dt);
    this.camera.position.lerp(this.v4, k);
    this.camera.lookAt(this.walker.x, this.walker.y + 1.45, this.walker.z);
    this.applyShake();
  }

  private pushShip(rig: ShipRig): void {
    const dx = this.walker.x - rig.group.position.x;
    const dz = this.walker.z - rig.group.position.z;
    const hx = (rig.group.userData.hx as number) || 1.8;
    const hz = (rig.group.userData.hz as number) || 2.2;
    if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
      const px = hx - Math.abs(dx);
      const pz = hz - Math.abs(dz);
      if (px < pz) this.walker.x += Math.sign(dx || 1) * (px + 0.05);
      else this.walker.z += Math.sign(dz || 1) * (pz + 0.05);
    }
  }

  private updateCockpitCam(dt: number): void {
    const rig = this.phase.startsWith("surface") ? this.surfaceRig : this.padRig;
    if (!rig) return;
    if (this.input.pointerLocked) {
      this.lookX = THREE.MathUtils.clamp(this.lookX - this.clockMouse.x * 0.002, -0.5, 0.5);
      this.lookY = THREE.MathUtils.clamp(this.lookY - this.clockMouse.y * 0.002, -0.3, 0.35);
    }
    this.placeCockpitCamera(rig, dt, 1);
    this.audio.setThrottle(this.phase === "countdown" ? 0.4 : 0);
  }

  private updateCountdown(dt: number): void {
    this.count -= dt;
    const c = Math.ceil(this.count);
    if (c < this.lastBeep && c >= 0) {
      this.audio.countdown(c === 0);
      this.lastBeep = c;
      this.notifyNow = true;
    }
    this.throttle = this.count < 3 ? 0.75 : 0.4;
    this.audio.setThrottle(this.throttle);
    const rig = this.phase === "countdown" ? this.padRig : this.surfaceRig;
    if (rig) {
      this.glow(rig, this.throttle);
      if (this.count < 4) this.burst(rig, 8);
      this.placeCockpitCamera(rig, dt, 1);
    }
    if (!this.reduce) this.trauma = Math.min(1, (this.trauma ?? 0) + dt * 0.4);
    if (this.count <= 0) this.beginLiftoff();
  }

  private trauma = 0;

  private beginLiftoff(): void {
    const surface = this.phase === "surfaceCountdown";
    this.phase = surface ? "surfaceLiftoff" : "liftoff";
    const rig = surface ? this.surfaceRig : this.padRig;
    if (rig) this.baseY.set(rig, rig.group.position.y);
    this.liftY = 0;
    this.liftV = 2;
    this.camMode = "chase";
    this.applyHull();
    this.throttle = 1;
    this.save.stats.launches += 1;
    this.flash = 0.65;
    if (!this.reduce) this.trauma = 0.8;
    this.notifyNow = true;
  }

  private updateLiftoff(dt: number): void {
    const surface = this.phase === "surfaceLiftoff";
    const rig = surface ? this.surfaceRig : this.padRig;
    if (!rig) return;
    const upright = !surface && !!rig.group.userData.upright;
    this.liftV += (surface ? 6 : upright ? 7 + this.liftY * 0.18 : 9) * dt;
    this.liftY += this.liftV * dt;
    const base = this.baseY.get(rig) ?? rig.group.position.y;
    rig.group.position.y = base + this.liftY;
    // upright-turn-v1: old code spun the rocket around its own nose axis. Now: slow gravity turn away from the camera.
    if (upright) rig.group.quaternion.setFromAxisAngle(WORLD_X, -Math.min(0.5, this.liftY * 0.004)).multiply(UPRIGHT_Q);
    this.glow(rig, 1);
    this.burst(rig, upright ? 28 : 16);
    this.audio.setThrottle(1);
    if (!this.reduce) this.trauma = Math.min(1, this.trauma + dt);
    const back = upright
        ? this.v4.set(rig.group.position.x + 16, 3.5 + Math.min(this.liftY * 0.15, 18), rig.group.position.z + 20)
        : this.v4.set(rig.group.position.x + 8, rig.group.position.y + 4, rig.group.position.z + 10);
    this.camera.position.lerp(back, 1 - Math.exp(-3 * dt));
    this.camera.lookAt(rig.group.position);
    this.applyShake();
    if (this.liftY > (surface ? 28 : upright ? 130 : 36)) {
      if (surface) this.enterFlightFrom(this.surfaceBody);
      else this.enterFlightFrom("earth");
    }
  }

  private baseY = new WeakMap<ShipRig, number>();

  private enterFlightFrom(body: BodyId): void {
    if (body === "earth") this.tryEvent("first-launch");
    if (body === "moon" && this.save.flags.moonLanded) this.save.flags.returning = true;
    if (body === "mars") this.save.flags.returning = true;
    const rig = this.ensureFlightRig();
    const origin = this.bodyPos.get(body)!;
    // land-anywhere-v1: lift off from the exact spot we touched down on; with no landing this session, the zone / pad.
    const spot = this.landed && this.landed.body === body && body !== "earth" ? this.landed.n : null; // earth-pad-fix-v1
    this.landed = null;
    const n = spot ? this.v2.copy(spot) : this.zoneNormalAt(body, body === "earth" ? 0 : this.landedZone, this.v2);
    this.pos().copy(origin).addScaledVector(n, BODIES[body].radius + 2.4);
    this.flightVel().copy(n).multiplyScalar(body === "earth" ? 5.2 : 3.2);
    this.orientShip(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    this.resetFlightControls();
    this.phase = "flight";
    this.sinceLaunch = 0;
    this.camMode = "chase";
    this.throttle = 0.85;
    rig.group.position.copy(this.flightPos);
    rig.group.scale.setScalar(FLIGHT_SCALE);
    this.useScene(this.flightScene, "flight");
    this.attachPuffs(this.flightScene);
    this.applyHull();
    this.flash = 0.8;
    this.toast(body === "earth" ? "Tower clear. Pitch forward with ↓ and aim the nav cue." : "Ascent. Point at the nav diamond.");
    this.notifyNow = true;
  }

  private flightPos = new THREE.Vector3();
  private flightV = new THREE.Vector3();

  /** Fresh camera and steering state for every flight start, so a relaunch never inherits the last flight's offset. */
  private resetFlightControls(): void {
    this.fcYaw = 0;
    this.fcPitch = 0;
    this.fcZoom = 1;
    this.fcHold = 0;
    this.steerSm = 0;
    this.pitchSm = 0;
    this.look = { dx: 0, dy: 0, zoom: 0, active: false };
    this.input.resetLook();
  }

  private pos(): THREE.Vector3 {
    return this.flightPos;
  }

  private flightVel(): THREE.Vector3 {
    return this.flightV;
  }

  private updateFlight(dt: number): void {
    const rig = this.ensureFlightRig();
    this.sinceLaunch += dt;
    const bodyE = this.dominant();
    const altE = this.flightPos.distanceTo(this.bodyPos.get(bodyE)!) - BODIES[bodyE].radius;
    let steer = 0;
    let pitch = 0;
    if (this.input.steerOverride !== null) steer = this.input.steerOverride;
    else {
      if (this.input.held("KeyA") || this.input.held("ArrowLeft")) steer += 1;
      if (this.input.held("KeyD") || this.input.held("ArrowRight")) steer -= 1;
    }
    if (this.input.held("ArrowUp") || this.input.touch.pitchUp) pitch += 1;
    if (this.input.held("ArrowDown") || this.input.touch.pitchDown) pitch -= 1;
    if (this.input.override === null) {
      if (this.input.touch.x < -0.25) steer += 1;
      if (this.input.touch.x > 0.25) steer -= 1;
    }
    steer = THREE.MathUtils.clamp(steer, -1, 1);
    pitch = THREE.MathUtils.clamp(pitch, -1, 1);
    if (this.input.pointerLocked) {
      steer += THREE.MathUtils.clamp(-this.clockMouse.x * this.save.settings.sens * 0.35, -1, 1);
      pitch += THREE.MathUtils.clamp(-this.clockMouse.y * this.save.settings.sens * 0.35, -1, 1);
    }
    // steer-fix-v1
    // Ship nose is local +Z and the chase cam sits behind it, so rotateY(+) swings the nose to screen-LEFT.
    // A / ArrowLeft (+steer) therefore uses rotateY(+).
    // easy-flight-v1: input smooth ramp hota hai (jhatka nahi), chhodte hi jaldi wapas, zameen ke paas turn dheema (precision).
    const kIn = Math.min(1, dt * 7);
    const kOut = Math.min(1, dt * 11);
    this.steerSm += (steer - this.steerSm) * (Math.abs(steer) > Math.abs(this.steerSm) ? kIn : kOut);
    this.pitchSm += (pitch - this.pitchSm) * (Math.abs(pitch) > Math.abs(this.pitchSm) ? kIn : kOut);
    const prec = THREE.MathUtils.clamp(0.55 + altE / 60, 0.55, 1);
    rig.group.rotateY(this.steerSm * 0.95 * prec * dt);
    // rotateX(+) swings the nose down, so ArrowUp (+pitch) uses rotateX(-).
    rig.group.rotateX(-this.pitchSm * 0.7 * prec * dt);
    const targetBank = -this.steerSm * 0.45; // rotateZ(+) banks right, so a left turn needs a negative bank
    const bankDelta = (targetBank - this.bank) * Math.min(1, dt * 4);
    this.bank += bankDelta;
    rig.group.rotateZ(bankDelta);

    if (this.input.held("KeyW") || (this.input.override === null && this.input.touch.y > 0.3))
      this.throttle = Math.min(1, this.throttle + dt * 0.9);
    if (this.input.held("KeyS") || (this.input.override === null && this.input.touch.y < -0.3))
      this.throttle = Math.max(0, this.throttle - dt * 1.6);

    const stats = this.stats();
    const locked = this.outOfRange();
    if (locked && !this.rangeLockToast) {
      this.rangeLockToast = true;
      this.audio.alarm();
      this.toast("Beyond certified range. Thrust cut. Esc → abort to Earth orbit.");
    }
    if (!locked) this.rangeLockToast = false;
    const rcs = this.input.held("Space") || this.input.touch.rcsUp;
    const rcsDn = this.input.held("ShiftLeft") || this.input.held("ShiftRight") || this.input.touch.rcsDown;
    let burn = 0;
    if (!locked && this.fuel > 0 && this.throttle > 0.02) burn += stats.burn * this.throttle * dt;
    if (this.fuel > 0 && (rcs || rcsDn)) burn += stats.burn * 0.35 * dt;
    this.fuel = Math.max(0, this.fuel - burn);
    if (this.fuel <= 0) this.throttle = 0;

    this.forward(rig, this.v1);
    const cap = this.speedCap();
    const speed = this.flightV.length();
    if (!locked && this.fuel > 0 && this.throttle > 0.02 && speed < cap) {
      this.flightV.addScaledVector(this.v1, stats.accel * this.throttle * dt);
    }
    const up = this.outward(this.flightPos, this.dominant(), this.v2);
    if (rcs && this.fuel > 0) this.flightV.addScaledVector(up, 6.5 * dt);
    if (rcsDn && this.fuel > 0) this.flightV.addScaledVector(up, -6.5 * dt);
    this.gravity(this.flightPos, this.v3);
    this.flightV.addScaledVector(this.v3, dt);
    const body = this.dominant();
    const alt = this.flightPos.distanceTo(this.bodyPos.get(body)!) - BODIES[body].radius;
    const dens = BODIES[body].atmo > 0 ? THREE.MathUtils.clamp(1 - alt / BODIES[body].atmo, 0, 1) : 0;
    if (dens > 0) {
      const sp = this.flightV.length();
      const drag = dens * (0.25 + sp * 0.08);
      this.flightV.multiplyScalar(Math.max(0, 1 - drag * dt));
      const mat = this.heat.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.clamp((sp - 3) * dens * 0.25, 0, 0.7);
    } else (this.heat.material as THREE.MeshBasicMaterial).opacity = 0;

    const sp2 = this.flightV.length();
    if (sp2 > cap) this.flightV.multiplyScalar(Math.max(cap / sp2, 1 - dt * 0.85));
    this.updateAtmosphere(dt, body, alt, cap);
    this.applyLandingAssist(dt, body, alt);
    this.flightPos.addScaledVector(this.flightV, dt);
    this.resolveGround(body);
    rig.group.position.copy(this.flightPos);
    rig.group.quaternion.normalize();
    this.glow(rig, locked ? 0 : this.throttle);
    this.heat.position.copy(this.flightPos);
    if (alt < 8 && this.throttle > 0.35 && body === "earth") this.burst(rig, 6);
    this.audio.setThrottle(locked ? 0 : this.throttle);
    this.life -= dt;
    if (this.life <= 0) {
      this.life = 90;
      this.toast("Life support exhausted.");
      this.abortToOrbit();
      return;
    }
    this.trackMissions(dt);
    this.yaw = rig.group.rotation.y;
    this.speedAbs = this.flightV.length();
    this.updateFlightCam(dt, rig);
    this.updateBeaconScales();
    if (!this.reduce && this.sinceLaunch < 6) this.trauma = Math.max(this.trauma, 0.25);
    this.applyShake();
  }

  private applyLandingAssist(dt: number, body: BodyId, alt: number): void {
    this.assistActive = false;
    const rig = this.flightRig;
    if (!rig || !this.save.settings.assist || this.fuel <= 0) return;
    if (BODIES[body].gas || alt > ASSIST_ALT || this.sinceLaunch < 8) return;
    const up = this.aUp.copy(this.flightPos).sub(this.bodyPos.get(body)!).normalize();
    const climb = this.flightV.dot(up);
    if (climb > 0.5) return;
    this.assistActive = true;

    // easy-flight-v1: throttle chhodo to ship khud dheere dheere ruk'ti hai (hath me feel).
    if (this.throttle < 0.05) this.flightV.multiplyScalar(Math.max(0, 1 - 0.4 * dt));

    // Level the nose to the local horizon, stronger the closer we are to the ground.
    const t = 1 - Math.exp(-3 * THREE.MathUtils.clamp((ASSIST_ALT - alt) / 20, 0, 1) * dt);
    this.forward(rig, this.aFwd);
    this.aFwd.addScaledVector(up, -this.aFwd.dot(up));
    if (this.aFwd.lengthSq() > 0.01) {
      this.aFwd.normalize();
      this.aSide.crossVectors(up, this.aFwd).normalize();
      this.basis.makeBasis(this.aSide, up, this.aFwd);
      this.aQ.setFromRotationMatrix(this.basis);
      rig.group.quaternion.slerp(this.aQ, t);
      this.bank *= 1 - t;
    }

    // Cap descent and sideways speed as the ground gets closer. Braking burns a little fuel.
    const rate = Math.min(1, dt * 8);
    let braked = false;
    const maxDesc = ASSIST_DESC_MIN + alt * 0.18;
    if (-climb > maxDesc) {
      this.flightV.addScaledVector(up, (-maxDesc - climb) * rate);
      braked = true;
    }
    const maxDrift = ASSIST_DRIFT_MIN + alt * 0.16;
    const hv = this.aHoriz.copy(this.flightV).addScaledVector(up, -this.flightV.dot(up));
    const hs = hv.length();
    if (hs > maxDrift) {
      this.flightV.addScaledVector(hv, -(1 - maxDrift / hs) * rate);
      braked = true;
    }
    if (braked) this.fuel = Math.max(0, this.fuel - this.stats().burn * 0.25 * dt);
  }

  private recordLanding(body: BodyId, descent: number, drift: number, fuelFrac: number): void {
    const assisted = this.save.settings.assist;
    const { grade, bonus } = gradeLanding(descent, drift, fuelFrac, assisted, body);
    this.save.credits += bonus;
    if (grade === "B") haptic.warn();
    else haptic.success();
    this.modalQ.push({
      kicker: "LANDING REPORT",
      title: `Grade ${grade}`,
      text: `Descent ${Math.max(0, descent).toFixed(1)} · Drift ${Math.abs(drift).toFixed(1)} · Fuel ${Math.round(fuelFrac * 100)}%.${assisted ? " Landing assist caps the grade at A." : ""}`,
      reward: bonus,
    });
    this.persist(true);
  }

  private resolveGround(body: BodyId): void {
    const def = BODIES[body];
    const center = this.bodyPos.get(body)!;
    const alt = this.flightPos.distanceTo(center) - def.radius;
    if (alt > 1.15) return;
    const up = this.v4.copy(this.flightPos).sub(center).normalize();
    const climb = this.flightV.dot(up);
    const descent = -climb;
    const horiz = this.v5.copy(this.flightV).addScaledVector(up, -climb).length();
    if (def.gas) {
      this.flightPos.copy(center).addScaledVector(up, def.radius + 8);
      this.flightV.addScaledVector(up, 6);
      this.audio.alarm();
      this.toast(`${def.name} has no surface. Climb away from the clouds.`);
      return;
    }
    // land-anywhere-v1: every spot on a solid planet is landable. A marked zone only tightens the limits (hard zones) and pays its bonus.
    const lz = this.landingZone(body, true);
    const zone = lz && lz.inside ? lz : null;
    const maxD = zone ? zone.z.maxDescent : FREE_LAND.maxDescent;
    const maxH = zone ? zone.z.maxDrift : FREE_LAND.maxDrift;
    if (descent > 9 || horiz > 8) {
      this.v2.copy(up);
      this.flightPos.copy(center).addScaledVector(this.v2, def.radius + 14);
      this.flightV.copy(this.v2).multiplyScalar(2.2);
      this.orientShip(this.v2, new THREE.Vector3(0, 1, 0));
      this.fuel = Math.max(6, this.fuel - 10);
      this.audio.alarm();
      this.flash = 0.5;
      haptic.heavy();
      this.toast("Hard impact. Kill more speed before touchdown.");
      return;
    }
    if (descent < maxD && horiz < maxH) {
      const spot = up.clone();
      const fuelFrac = this.fuel / Math.max(1, this.stats().fuel);
      this.audio.thud();
      this.audio.setThrottle(0);
      this.throttle = 0;
      this.save.stats.landings += 1;
      if (body === "earth") {
        if (this.save.flags.returning) this.tryEvent("return-earth");
        this.save.flags.returning = false;
        this.life = this.stats().life;
        this.enterPad();
        this.toast(zone ? "Northline. Welcome down." : "Touchdown on Earth. Welcome down.");
      } else {
        if (body === "moon") {
          this.save.flags.moonLanded = true;
          this.tryEvent("lunar-landing");
        }
        if (body === "mars") this.tryEvent("mars-landing");
        this.life = this.stats().life;
        this.enterSurface(body, true);
        this.toast(`${def.name} touchdown. Egress when you're ready.`);
      }
      this.recordLanding(body, descent, horiz, fuelFrac);
      this.landed = { body, n: spot };
      this.landedZone = lz ? lz.i : 0;
      this.onZoneLanded(zone);
      this.notifyNow = true;
      return;
    }
    // bounce: straight up from where we hit
    this.flightPos.copy(center).addScaledVector(up, def.radius + 1.05);
    this.flightV.addScaledVector(up, descent + 1.5);
    this.flightV.multiplyScalar(0.45);
    haptic.warn();
    this.toast("Too fast. Hover and bleed speed before touchdown.");
  }

  private trackMissions(dt: number): void {
    const earth = this.bodyPos.get("earth")!;
    const alt = this.flightPos.distanceTo(earth) - BODIES.earth.radius;
    const inBand = alt > 5.4 && alt < 18 && this.dominant() === "earth";
    if (inBand) this.orbitHold += dt;
    else {
      this.orbitHold = 0;
      this.orbitPaid = false;
    }
    if (this.orbitHold > 6 && !this.orbitPaid) {
      this.orbitPaid = true;
      this.tryEvent("reach-orbit");
    }
    const sd = this.flightPos.distanceTo(this.station);
    if (sd < 8 && this.flightV.length() < 8) {
      if (!this.stationPaid) {
        this.stationPaid = true;
        this.tryEvent("visit-station");
      }
    } else if (sd > 18) this.stationPaid = false;

    for (const id of BODY_IDS) {
      if (id === "earth") continue;
      const d = this.flightPos.distanceTo(this.bodyPos.get(id)!);
      const key = id;
      if (d < BODIES[id].soi) {
        if (!this.inside.has(key)) {
          this.inside.add(key);
          this.toast(`${BODIES[id].name} sphere of influence.`);
          if (id === "moon") this.tryEvent("travel-moon");
          if (id === "mars") this.tryEvent("mars-transfer");
        }
      } else if (d > BODIES[id].soi * 1.35) this.inside.delete(key);
      if (BODIES[id].gas) {
        const b = this.beacons.get(id);
        if (!b) continue;
        const bd = this.flightPos.distanceTo(b);
        if (bd < 8) {
          if (!this.flyPaid.has(id)) {
            this.flyPaid.add(id);
            if (id === "jupiter") this.tryEvent("jupiter-flyby");
            if (id === "saturn") this.tryEvent("saturn-flyby");
            if (id === "uranus") this.tryEvent("uranus-survey");
            if (id === "neptune") this.tryEvent("neptune-survey");
            this.toast(`${BODIES[id].name} beacon logged.`);
          }
        } else if (bd > 18) this.flyPaid.delete(id);
      }
    }
  }

  private tryEvent(id: string): void {
    const def = MISSIONS.find((m) => m.id === id);
    if (!def) return;
    if (def.requires && !this.save.done.includes(def.requires)) return;
    if (!this.save.done.includes(id)) {
      this.save.done.push(id);
      this.save.credits += def.reward;
      const unlock = def.unlocks ? ` ${SHIPS[def.unlocks].name} is now for sale in the garage.` : "";
      this.modalQ.push({ title: def.name, text: def.brief + unlock, reward: def.reward });
      this.audio.beep(660, 0.12, "triangle", 0.06);
      this.audio.beep(990, 0.18, "triangle", 0.05);
      this.replayAt.set(id, this.menuT + 50);
    } else {
      if ((this.replayAt.get(id) ?? 0) > this.menuT) return;
      this.replayAt.set(id, this.menuT + 50);
      const pay = Math.round(def.reward * 0.6);
      this.save.credits += pay;
      this.toast(`Replay cleared. +${pay} cr`);
    }
    this.persist(true);
    this.notifyNow = true;
  }

  private updateFlightCam(dt: number, rig: ShipRig): void {
    if (this.camMode === "cockpit") {
      this.placeCockpitCamera(rig, dt, FLIGHT_SCALE);
      return;
    }
    this.forward(rig, this.v1);
    const up = this.v2.set(0, 1, 0).applyQuaternion(rig.group.quaternion);
    // free-cam-v1: drag/swipe = orbit the ship, pinch/wheel = zoom, release = glide back to the chase view (~0.6s).
    // Pure camera work: it never touches steering, throttle or the ship.
    const set = this.save.settings;
    const L = this.look;
    const px = 0.0055 * (set.lookSens || 1);
    if (L.dx || L.dy) {
      this.fcYaw += L.dx * px;
      this.fcPitch = THREE.MathUtils.clamp(this.fcPitch + L.dy * px, -0.62, 1.03);
    }
    if (L.zoom) this.fcZoom *= Math.exp(-L.zoom * 0.006);
    if (this.frameWheel) this.fcZoom *= Math.exp(this.frameWheel * 0.0012);
    this.fcZoom = THREE.MathUtils.clamp(this.fcZoom, 0.5, 2.4);
    if (L.active) this.fcHold = 0;
    else if (this.frameWheel) this.fcHold = 1.2;
    else this.fcHold = Math.max(0, this.fcHold - dt);
    if (!L.active && this.fcHold <= 0 && !set.camLock) {
      this.fcYaw = THREE.MathUtils.euclideanModulo(this.fcYaw + Math.PI, Math.PI * 2) - Math.PI;
      const k = 1 - Math.exp(-dt / 0.2);
      this.fcYaw -= this.fcYaw * k;
      this.fcPitch -= this.fcPitch * k;
      this.fcZoom += (1 - this.fcZoom) * k;
    }
    const R0 = Math.hypot(7.5, 2.1) * this.fcZoom;
    const pa = Math.atan2(2.1, 7.5) + this.fcPitch;
    const cp = Math.cos(pa);
    this.v4
      .set(Math.sin(this.fcYaw) * cp * R0, Math.sin(pa) * R0, -Math.cos(this.fcYaw) * cp * R0)
      .applyQuaternion(rig.group.quaternion)
      .add(this.flightPos);
    // keep the camera out of the ground / planet
    const fb = this.dominant();
    const fc = this.bodyPos.get(fb)!;
    const minR = BODIES[fb].radius + 0.9;
    this.v3.copy(this.v4).sub(fc);
    const fl = this.v3.length();
    if (fl < minR) this.v4.copy(fc).addScaledVector(this.v3, minR / Math.max(fl, 1e-4));
    const off = Math.abs(this.fcYaw) + Math.abs(this.fcPitch) + Math.abs(this.fcZoom - 1) > 0.02;
    const rate = L.active || this.fcHold > 0 || off ? 12 : 4;
    this.camera.position.lerp(this.v4, 1 - Math.exp(-rate * dt));
    const kf = THREE.MathUtils.clamp(Math.abs(this.fcYaw) / 0.7 + Math.abs(this.fcPitch) / 0.5, 0, 1);
    this.v5.copy(this.flightPos).addScaledVector(this.v1, 3 * (1 - kf));
    this.camera.lookAt(this.v5);
  }

  private placeCockpitCamera(rig: ShipRig, dt: number, scale: number): void {
    rig.group.updateMatrixWorld(true);
    if (rig.group.userData.upright) {
      // launch cam: pad se thori door, ground level, rocket ki taraf
      const p = rig.group.position;
      this.v1.set(p.x + 12, 2.4, p.z + 15);
      this.v2.set(p.x, p.y + 0.6, p.z);
      this.camera.position.lerp(this.v1, 1 - Math.exp(-3 * dt));
      this.camera.lookAt(this.v2);
      return;
    }
    this.v1.copy(rig.cockpitPos).multiplyScalar(scale).applyQuaternion(rig.group.quaternion).add(rig.group.position);
    this.v2.copy(rig.lookPos).multiplyScalar(scale).applyQuaternion(rig.group.quaternion).add(rig.group.position);
    this.v3.set(this.lookX, this.lookY, 0).applyQuaternion(rig.group.quaternion);
    this.v2.add(this.v3);
    this.camera.position.lerp(this.v1, 1 - Math.exp(-10 * dt));
    this.camera.lookAt(this.v2);
  }

  private applyShake(): void {
    if (this.trauma <= 0 || this.reduce) return;
    const s = this.trauma * this.trauma;
    this.camera.position.x += (Math.random() - 0.5) * s * 0.35;
    this.camera.position.y += (Math.random() - 0.5) * s * 0.35;
    this.trauma = Math.max(0, this.trauma - 0.8 * 0.016);
  }

  private forward(rig: ShipRig, out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, 1).applyQuaternion(rig.group.quaternion);
  }

  private orientShip(forward: THREE.Vector3, upHint: THREE.Vector3): void {
    const rig = this.ensureFlightRig();
    const z = this.v1.copy(forward).normalize();
    const x = this.v3.crossVectors(upHint, z);
    if (x.lengthSq() < 1e-8) {
      this.v4.set(1, 0, 0);
      x.crossVectors(this.v4, z);
    }
    x.normalize();
    const y = this.v4.crossVectors(z, x).normalize();
    this.basis.makeBasis(x, y, z);
    rig.group.quaternion.setFromRotationMatrix(this.basis);
    this.bank = 0;
  }

  private levelShip(noseUp: boolean): void {
    const rig = this.flightRig;
    if (!rig) return;
    this.forward(rig, this.v1);
    const up = this.referenceUp(this.v2);
    const flat = this.v3.copy(this.v1).addScaledVector(up, -this.v1.dot(up));
    if (flat.lengthSq() < 0.04) {
      this.v4.set(1, 0, 0);
      flat.crossVectors(up, this.v4);
    }
    flat.normalize();
    const z = noseUp ? flat.multiplyScalar(0.45).add(up).normalize() : flat;
    this.orientShip(z, up);
  }

  private orientFlat(obj: THREE.Object3D, fx: number, fz: number): void {
    this.v1.set(fx, 0, fz);
    if (this.v1.lengthSq() < 1e-6) return;
    this.v1.normalize();
    this.v2.set(0, 1, 0);
    this.v3.crossVectors(this.v2, this.v1).normalize();
    this.basis.makeBasis(this.v3, this.v2, this.v1);
    obj.quaternion.setFromRotationMatrix(this.basis);
  }

  private gravity(pos: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, 0);
    for (const id of BODY_IDS) {
      const c = this.bodyPos.get(id)!;
      this.v4.copy(pos).sub(c);
      const r = this.v4.length();
      const body = BODIES[id];
      const infl = body.radius * 4.8;
      if (r < 0.2 || r > infl) continue;
      const fall = (body.radius / r) ** 2;
      const fade = 1 - THREE.MathUtils.clamp((r - body.radius) / (infl - body.radius), 0, 1);
      const strength = body.g * fall * (0.35 + 0.65 * fade);
      out.addScaledVector(this.v4, -strength / r);
    }
    return out;
  }

  private dominant(): BodyId {
    let best: BodyId = "earth";
    let score = Infinity;
    for (const id of BODY_IDS) {
      const d = this.flightPos.distanceTo(this.bodyPos.get(id)!);
      const s = d / BODIES[id].soi;
      if (s < score) {
        score = s;
        best = id;
      }
    }
    return best;
  }

  private outward(pos: THREE.Vector3, id: BodyId, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(pos).sub(this.bodyPos.get(id)!).normalize();
  }

  private referenceUp(out: THREE.Vector3): THREE.Vector3 {
    const id = this.dominant();
    const d = this.flightPos.distanceTo(this.bodyPos.get(id)!);
    if (d < BODIES[id].soi * 1.8) return this.outward(this.flightPos, id, out);
    return out.set(0, 1, 0);
  }

  private altitude(): number {
    const id = this.dominant();
    return this.flightPos.distanceTo(this.bodyPos.get(id)!) - BODIES[id].radius;
  }

  private climbRate(): number {
    const id = this.dominant();
    const up = this.outward(this.flightPos, id, this.v5);
    return this.flightV.dot(up);
  }

  private velLen(): number {
    return this.flightV.length();
  }

  private speedCap(): number {
    return this.stats().speed * cruiseMultiplier(this.flightPos.length());
  }

  private outOfRange(): boolean {
    return this.flightPos.length() > this.stats().range;
  }

  private zoneNormal(id: BodyId, out: THREE.Vector3): THREE.Vector3 {
    if (id === "earth") return out.copy(PAD);
    return out.copy(this.bodyPos.get(id)!).normalize().multiplyScalar(-1);
  }

  // ---- planet-zones-v1 -------------------------------------------------------------
  private zoneNormalAt(id: BodyId, i: number, out: THREE.Vector3): THREE.Vector3 {
    const n = this.zoneNs.get(id)?.[i];
    return n ? out.copy(n) : this.zoneNormal(id, out);
  }

  private buildZoneNormals(): void {
    for (const id of BODY_IDS) {
      const base = this.zoneNormal(id, new THREE.Vector3());
      const rad = BODIES[id].radius;
      const t1 = new THREE.Vector3().crossVectors(base, new THREE.Vector3(0, 1, 0));
      if (t1.lengthSq() < 1e-4) t1.crossVectors(base, new THREE.Vector3(1, 0, 0));
      t1.normalize();
      const t2 = new THREE.Vector3().crossVectors(base, t1).normalize();
      this.zoneNs.set(
        id,
        PLANETS[id].zones.map((z) => {
          if (z.arc <= 0) return base.clone();
          const a = z.arc / rad;
          const az = THREE.MathUtils.degToRad(z.az);
          const dir = t1.clone().multiplyScalar(Math.cos(az)).addScaledVector(t2, Math.sin(az));
          return base.clone().multiplyScalar(Math.cos(a)).addScaledVector(dir, Math.sin(a)).normalize();
        }),
      );
    }
  }

  /** Surface distance from the point under the ship to zone i. Uses its own scratch vectors. */
  private zoneArcAt(body: BodyId, i: number): number {
    this.zA.copy(this.flightPos).sub(this.bodyPos.get(body)!).normalize();
    return this.zoneNormalAt(body, i, this.zB).angleTo(this.zA) * BODIES[body].radius;
  }

  private zoneFound(body: BodyId, i: number): boolean {
    return i === 0 || this.save.zonesFound.includes(PLANETS[body].zones[i]!.id);
  }

  private landingZone(body: BodyId, assist: boolean): LandingZone | null {
    const zones = PLANETS[body].zones;
    if (!zones.length) return null;
    const mul = assist && this.save.settings.assist ? 1.5 : 1;
    let bi = 0;
    let bm = Infinity;
    let ba = 0;
    for (let i = 0; i < zones.length; i++) {
      const a = this.zoneArcAt(body, i);
      const m = a - zones[i]!.radius;
      if (m < bm) {
        bm = m;
        bi = i;
        ba = a;
      }
    }
    const z = zones[bi]!;
    return { i: bi, z, arc: ba, inside: ba < z.radius * mul };
  }

  private onZoneLanded(lz: LandingZone | null): void {
    if (!lz) return;
    this.landedZone = lz.i;
    const z = lz.z;
    if (lz.i > 0 && !this.save.zonesFound.includes(z.id)) this.save.zonesFound.push(z.id);
    if (z.reward > 0 && !this.save.zonesClaimed.includes(z.id)) {
      this.save.zonesClaimed.push(z.id);
      this.save.credits += z.reward;
      this.modalQ.push({
        kicker: KIND_LABEL[z.kind] + " ZONE",
        title: z.name,
        text:
          z.kind === "bonus"
            ? "Bonus landing zone secured. Survey teams pay extra for this one."
            : "Hard landing zone cleared. The first touchdown here pays a bonus.",
        reward: z.reward,
      });
    }
    this.persist(true);
  }

  private updateAtmosphere(dt: number, body: BodyId, alt: number, cap: number): void {
    const cfg = PLANETS[body];
    const inNow = this.atmoBody === body ? alt < cfg.boundary * 1.05 : alt < cfg.boundary;
    if (inNow) {
      const depth = THREE.MathUtils.clamp(1 - alt / cfg.boundary, 0, 1);
      this.atmoDepth += (depth - this.atmoDepth) * Math.min(1, dt * 3);
      if (this.atmoBody !== body) {
        this.atmoBody = body;
        this.scanT = 1.2;
        if (this.sinceLaunch > 2.5) {
          this.toast("Entering " + BODIES[body].name + " " + cfg.label);
          this.audio.ui();
          haptic.tap();
        }
      }
      // gentle slowdown inside the boundary (never below 70% of the normal cap, so leaving is always possible)
      const lim = cap * (1 - 0.3 * this.atmoDepth);
      const s = this.flightV.length();
      if (s > lim) this.flightV.multiplyScalar(Math.max(lim / s, 1 - dt * 0.6));
      if (Math.abs(this.atmoDepth - this.atmoAud) > 0.04) {
        this.atmoAud = this.atmoDepth;
        this.audio.setAtmo(this.atmoDepth);
      }
      if (cfg.zones.length > 1) {
        this.scanT -= dt;
        this.scanCool = Math.max(0, this.scanCool - dt);
        if (this.scanT <= 0) {
          this.scanT = cfg.scanEvery;
          this.pingScanner(body, false);
        }
      }
    } else if (this.atmoBody) {
      if (this.sinceLaunch > 2.5) this.toast("Leaving " + BODIES[this.atmoBody].name + " " + PLANETS[this.atmoBody].label + ". Scanner offline.");
      this.atmoBody = null;
      this.atmoDepth = 0;
      this.atmoAud = 0;
      this.audio.setAtmo(0);
    }
    this.updateZoneRings(body);
  }

  /** Manual scanner ping (R key / SCAN button). */
  scanNow(): void {
    if (this.phase !== "flight") return;
    const body = this.atmoBody;
    if (!body || PLANETS[body].zones.length < 2) {
      this.toast("Scanner needs a landable planet. Fly into its atmosphere.");
      return;
    }
    if (this.scanCool > 0) return;
    this.scanCool = 1.5;
    this.scanT = PLANETS[body].scanEvery;
    this.pingScanner(body, true);
  }

  private pingScanner(body: BodyId, manual: boolean): void {
    const cfg = PLANETS[body];
    const fresh: string[] = [];
    cfg.zones.forEach((z, i) => {
      if (this.zoneFound(body, i)) return;
      if (this.zoneArcAt(body, i) <= cfg.scanRange) {
        this.save.zonesFound.push(z.id);
        fresh.push(z.name + " (" + KIND_LABEL[z.kind] + ")");
      }
    });
    this.audio.scan();
    if (fresh.length) {
      this.toast("Landing zone found: " + fresh.join(", "));
      haptic.success();
      this.persist(true);
    } else if (manual) this.toast("Scan complete. No new zones in range. Move over fresh ground.");
    this.notifyNow = true;
  }

  private updateZoneRings(body: BodyId): void {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    for (const r of this.zoneRings) {
      const zones = PLANETS[r.body].zones;
      const show = r.body === body && zones.length > 1 && this.zoneFound(r.body, r.idx);
      r.mesh.visible = show;
      if (!show) continue;
      const z = zones[r.idx]!;
      const near = this.zoneArcAt(body, r.idx) < z.radius * 2.5;
      r.mat.color.setHex(near ? 0x4ade80 : ZONE_COLORS[z.kind]);
      r.mat.opacity = near ? 0.6 + 0.35 * pulse : 0.55;
    }
  }

  private buildZoneRings(scene: THREE.Scene): void {
    this.zoneRings = [];
    for (const id of BODY_IDS) {
      const def = BODIES[id];
      PLANETS[id].zones.forEach((z, i) => {
        if (PLANETS[id].zones.length < 2) return;
        const mat = new THREE.MeshBasicMaterial({
          color: ZONE_COLORS[z.kind],
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(this.sphereRing(def.radius + 0.12, z.radius, z.radius * 0.84), mat);
        mesh.position.copy(this.bodyPos.get(id)!);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.zoneNs.get(id)![i]!);
        mesh.visible = false;
        scene.add(mesh);
        this.zoneRings.push({ body: id, idx: i, mesh, mat });
      });
    }
  }

  /** Flat-looking ring that hugs the sphere (built around +Z, then rotated onto the zone normal). */
  private sphereRing(rad: number, outer: number, inner: number): THREE.BufferGeometry {
    const seg = 40;
    const ao = outer / rad;
    const ai = inner / rad;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let k = 0; k < seg; k++) {
      const th = (k / seg) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      pos.push(rad * Math.sin(ao) * c, rad * Math.sin(ao) * s, rad * Math.cos(ao));
      pos.push(rad * Math.sin(ai) * c, rad * Math.sin(ai) * s, rad * Math.cos(ai));
    }
    for (let k = 0; k < seg; k++) {
      const a = k * 2;
      const b = ((k + 1) % seg) * 2;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  private zoneSnap(): Snap["zones"] {
    const body = this.atmoBody;
    if (this.phase !== "flight" || !body) return null;
    const zones = PLANETS[body].zones;
    if (zones.length < 2) return null;
    let found = 0;
    let bi = -1;
    let ba = Infinity;
    for (let i = 0; i < zones.length; i++) {
      if (!this.zoneFound(body, i)) continue;
      found++;
      const a = this.zoneArcAt(body, i);
      if (a < ba) {
        ba = a;
        bi = i;
      }
    }
    let target: NonNullable<Snap["zones"]>["target"] = null;
    if (bi >= 0) {
      const z = zones[bi]!;
      const w = this.bodyPos.get(body)!.clone().addScaledVector(this.zoneNormalAt(body, bi, new THREE.Vector3()), BODIES[body].radius + 0.2);
      const c = w.clone().applyMatrix4(this.camera.matrixWorldInverse);
      target = {
        name: z.name,
        kind: z.kind,
        dist: this.flightPos.distanceTo(w),
        angle: Math.atan2(c.x, c.y),
        near: ba < z.radius * 2.5,
        inside: ba < z.radius,
      };
    }
    return { found, total: zones.length, scanIn: Math.max(0, this.scanT), target };
  }

  private zoneArc(id: BodyId): number {
    const up = this.outward(this.flightPos, id, this.v5);
    const n = this.zoneNormal(id, this.v4);
    return n.angleTo(up) * BODIES[id].radius;
  }

  private inEnvelope(): boolean {
    if (this.phase !== "flight") return false;
    const id = this.dominant();
    if (BODIES[id].gas) return false;
    const alt = this.altitude();
    if (alt > 14) return false;
    const descent = -this.climbRate();
    const up = this.outward(this.flightPos, id, this.v5);
    const climb = this.flightV.dot(up);
    const horiz = this.v4.copy(this.flightV).addScaledVector(up, -climb).length();
    const lz = this.landingZone(id, false);
    const zone = lz && lz.inside ? lz : null;
    return (
      descent < (zone ? zone.z.maxDescent : FREE_LAND.maxDescent) &&
      descent > -2 &&
      horiz < (zone ? zone.z.maxDrift : FREE_LAND.maxDrift)
    );
  }

  // phone-fix-waypoint-v1
  projectTarget(): { x: number; y: number; cx: number; cy: number; behind: boolean; dist: number } | null {
    if (this.screen !== "play" || this.phase !== "flight") return null;
    const target = this.targetPoint(new THREE.Vector3());
    const dist = this.pos().distanceTo(target);
    const cam = target.clone().applyMatrix4(this.camera.matrixWorldInverse);
    const ndc = target.clone().project(this.camera);
    return { x: ndc.x, y: ndc.y, cx: cam.x, cy: cam.y, behind: cam.z > 0, dist };
  }

  private targetPoint(out: THREE.Vector3): THREE.Vector3 {
    const dest = this.save.destination;
    if (dest === "station") return out.copy(this.station);
    if (dest === "orbit") return out.copy(PAD).multiplyScalar(BODIES.earth.radius + 8);
    if (dest === "earth") return out.copy(PAD).multiplyScalar(BODIES.earth.radius);
    const id = dest as BodyId;
    return out.copy(this.beacons.get(id) ?? this.bodyPos.get(id)!);
  }

  private stats() {
    return shipStats(this.save.selected, this.save.upgrades[this.save.selected]);
  }

  private glow(rig: ShipRig, throttle: number): void {
    for (const f of rig.flames) {
      if (f.userData.base == null) f.userData.base = f.scale.x || 1;
      const base = f.userData.base as number;
      f.visible = throttle > 0.04;
      f.scale.setScalar(base * (0.3 + throttle * 1.7));
    }
    rig.light.intensity = throttle * 8;
  }

  private burst(rig: ShipRig, n: number): void {
    this.exhaust(rig, this.v5);
    for (let i = 0; i < n; i++) this.emitPuff(this.v5, this.phase === "flight" ? 1 : 4);
  }

  private exhaust(rig: ShipRig, out: THREE.Vector3): THREE.Vector3 {
    this.forward(rig, out);
    out.multiplyScalar(-rig.half.z * rig.group.scale.x * 0.85);
    out.add(rig.group.position);
    return out;
  }

  private applyHull(): void {
    const inside =
      this.camMode === "cockpit" &&
      (this.phase === "cockpit" ||
        this.phase === "countdown" ||
        this.phase === "flight" ||
        this.phase === "surfaceCockpit" ||
        this.phase === "surfaceCountdown");
    const rig =
      this.phase === "flight"
        ? this.flightRig
        : this.phase.startsWith("surface")
          ? this.surfaceRig
          : this.padRig;
    if (!rig) return;
    const showInside = inside && !(rig === this.padRig && !!rig.group.userData.upright);
    for (const h of rig.hull) h.visible = !showInside;
    rig.interior.visible = showInside;
    this.astro.group.visible = this.phase === "pad" || this.phase === "surface";
  }

  private enterPad(): void {
    this.phase = "pad";
    this.camMode = "chase";
    this.throttle = 0;
    this.audio.setThrottle(0);
    this.mountPadShip();
    this.walker.x = 9;
    this.walker.z = 7;
    this.walker.y = 0;
    this.walker.vy = 0;
    this.walker.speed = 0;
    if (this.padRig) {
      const h = this.hatchWorld(this.padRig, this.v1);
      const dx = h.x - this.walker.x;
      const dz = h.z - this.walker.z;
      this.walker.yaw = Math.atan2(-dx, -dz);
    }
    this.ox = 100;
    this.lamp.intensity = 0;
    this.astro.group.visible = true;
    this.padScene.add(this.astro.group);
    this.screen = "play";
    this.useScene(this.padScene, "pad");
    this.attachPuffs(this.padScene);
    this.applyHull();
    this.life = Math.max(this.life, this.stats().life);
  }

  private enterSurface(body: BodyId, fresh: boolean): void {
    this.surfaceBody = body === "earth" ? "moon" : body;
    const kind = this.surfaceBody === "mars" ? "mars" : "moon";
    if (this.surfaceScene) {
      this.surfaceScene.remove(this.astro.group);
      this.disposeScene(this.surfaceScene);
    }
    this.surfaceScene = new THREE.Scene();
    this.surfaceScene.fog = new THREE.FogExp2(kind === "moon" ? 0x07080c : 0x8a5344, kind === "moon" ? 0.012 : 0.016);
    this.terrain = buildTerrain(kind, this.assets);
    this.surfaceScene.add(this.terrain.group);
    if (kind === "moon") {
      this.surfaceScene.add(buildStars(1200, 80, 160));
      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(14, 32, 24),
        new THREE.MeshStandardMaterial({ map: this.assets.earth, roughness: 0.7 }),
      );
      earth.position.set(-50, 28, -70);
      this.surfaceScene.add(earth);
      const sun = new THREE.DirectionalLight(0xfff4e8, 2.1);
      sun.position.set(20, 24, 10);
      sun.castShadow = this.save.settings.quality !== "low";
      this.surfaceScene.add(sun);
      this.surfaceScene.add(new THREE.HemisphereLight(0xb9c6d6, 0x22262c, 0.35));
    } else {
      const sun = new THREE.DirectionalLight(0xffd2b0, 2);
      sun.position.set(16, 22, 8);
      sun.castShadow = this.save.settings.quality !== "low";
      this.surfaceScene.add(sun);
      this.surfaceScene.add(new THREE.AmbientLight(0xffc8a8, 0.25));
    }
    this.surfaceRig = buildShip(this.save.selected, this.assets);
    this.seat(this.surfaceRig, 0, 0, this.terrain.heightAt(0, 0));
    this.surfaceScene.add(this.surfaceRig.group);
    this.surfaceScene.add(this.astro.group);
    const h = this.hatchWorld(this.surfaceRig, this.v1);
    this.walker.x = h.x + 1.4;
    this.walker.z = h.z + 0.4;
    this.walker.y = this.terrain.heightAt(this.walker.x, this.walker.z);
    this.walker.vy = 0;
    this.walker.speed = 0;
    this.walker.yaw = Math.atan2(-(h.x - this.walker.x), -(h.z - this.walker.z));
    if (fresh) this.ox = 100;
    this.phase = "surface";
    this.camMode = "chase";
    this.astro.group.visible = true;
    this.screen = "play";
    this.useScene(this.surfaceScene, "surface");
    this.applyHull();
  }

  private buildMenu(): void {
    const scene = this.menuScene;
    scene.add(new THREE.HemisphereLight(0x9ec9ff, 0x1a120c, 0.45));
    const sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
    sun.position.set(8, 4, 6);
    scene.add(sun);
    scene.add(buildStars(this.starCount(), 40, 90));
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(2.15, 48, 32),
      new THREE.MeshStandardMaterial({ map: this.assets.earth, roughness: 0.72, metalness: 0.05 }),
    );
    earth.name = "menuEarth";
    scene.add(earth);
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 48, 32),
      new THREE.MeshStandardMaterial({ map: this.assets.clouds, transparent: true, depthWrite: false, roughness: 1 }),
    );
    clouds.name = "menuClouds";
    scene.add(clouds);
    scene.add(buildAtmosphere(2.15, new THREE.Color("#8ec8ff")));
    this.mountMenuShip();
  }

  private buildGarage(): void {
    const scene = this.garageScene;
    scene.background = new THREE.Color(0x07090d);
    scene.add(new THREE.HemisphereLight(0x88a0b8, 0x120c0a, 0.5));
    const key = new THREE.SpotLight(0xfff4e5, 8, 40, 0.5, 0.4, 1);
    key.position.set(6, 10, 8);
    scene.add(key);
    const fill = new THREE.PointLight(0x8ecfff, 3, 20);
    fill.position.set(-6, 3, 4);
    scene.add(fill);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(8, 40),
      new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.4, metalness: 0.5 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    this.mountGarage();
  }

  private buildSolar(): void {
    const scene = this.solarScene;
    scene.add(buildStars(this.starCount(), 80, 160));
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sunL = new THREE.PointLight(0xfff2d2, 4, 200);
    scene.add(sunL);
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
    );
    scene.add(sun);
    const order: BodyId[] = ["earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"];
    order.forEach((id, i) => {
      const dist = i === 0 ? 0 : 8 + i * 4.4;
      const ang = i * 0.85;
      const radius = id === "earth" ? 1.15 : id === "jupiter" ? 1.7 : id === "saturn" ? 1.45 : 0.7;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 28, 18),
        new THREE.MeshStandardMaterial({ map: bodyTexture(this.assets, id), roughness: 0.7 }),
      );
      mesh.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
      mesh.userData.dest = id === "earth" ? "earth" : id;
      scene.add(mesh);
      this.solarMeshes.push(mesh);
      if (i > 0) {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 96; k++) {
          const a = (k / 96) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * dist, 0, Math.sin(a) * dist));
        }
        scene.add(
          new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0x3c4d60 }),
          ),
        );
      }
      if (id === "earth") {
        const clouds = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.03, 28, 18),
          new THREE.MeshStandardMaterial({ map: this.assets.clouds, transparent: true, depthWrite: false }),
        );
        clouds.position.copy(mesh.position);
        scene.add(clouds);
      }
      if (id === "saturn") {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(radius * 1.4, radius * 2.3, 48),
          new THREE.MeshBasicMaterial({ color: 0xd9c7a2, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
        );
        ring.rotation.x = Math.PI / 2.4;
        ring.position.copy(mesh.position);
        scene.add(ring);
      }
    });
    scene.add(this.focusRing);
  }

  private buildPad(): void {
    const scene = this.padScene;
    scene.add(buildSpaceport(this.assets));
    scene.add(new THREE.HemisphereLight(0xf0d2b4, 0x2a241c, 0.55));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.5);
    sun.position.set(18, 22, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 70;
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -24;
    scene.add(sun);
    const warm = new THREE.PointLight(0xe8893a, 4, 18);
    warm.position.set(2, 4, 3);
    scene.add(warm);
    scene.add(this.astro.group);
    this.mountPadShip();
  }

  private buildFlight(): void {
    const scene = this.flightScene;
    scene.add(buildStars(this.starCount(), 400, 1200));
    scene.add(new THREE.HemisphereLight(0xc5d7ee, 0x0c0e12, 0.22));
    const sun = new THREE.DirectionalLight(0xfff6ea, 2.3);
    sun.position.set(80, 30, 20);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x223044, 0.35));
    for (const id of BODY_IDS) {
      const def = BODIES[id];
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(def.radius, id === "earth" ? 64 : 40, id === "earth" ? 48 : 28),
        new THREE.MeshStandardMaterial({
          map: bodyTexture(this.assets, id),
          roughness: id === "earth" ? 0.68 : 0.86,
          metalness: 0.04,
          bumpMap: id === "moon" ? this.assets.moon : null,
          bumpScale: id === "moon" ? 0.18 : 0,
        }),
      );
      mesh.position.copy(this.bodyPos.get(id)!);
      scene.add(mesh);
      if (id === "earth") {
        const clouds = new THREE.Mesh(
          new THREE.SphereGeometry(def.radius * 1.02, 64, 48),
          new THREE.MeshStandardMaterial({
            map: this.assets.clouds,
            transparent: true,
            depthWrite: false,
            roughness: 1,
          }),
        );
        clouds.position.copy(mesh.position);
        clouds.name = "flightClouds";
        scene.add(clouds);
        scene.add(buildAtmosphere(def.radius, new THREE.Color("#8ecfff")));
        const atmo = scene.children[scene.children.length - 1]!;
        atmo.position.copy(mesh.position);
      } else if (def.atmo > 0 && !def.gas) {
        const at = buildAtmosphere(def.radius, new THREE.Color(def.color));
        at.position.copy(mesh.position);
        scene.add(at);
      } else if (def.gas) {
        const at = buildAtmosphere(def.radius, new THREE.Color(def.color));
        at.position.copy(mesh.position);
        scene.add(at);
      }
      if (id === "saturn") {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(def.radius * 1.35, def.radius * 2.15, 64),
          new THREE.MeshBasicMaterial({
            color: 0xe6d3a4,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
          }),
        );
        ring.rotation.x = Math.PI / 2.3;
        ring.position.copy(mesh.position);
        scene.add(ring);
      }
    }
    const st = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.18, 8, 28), this.assets.mats.metal);
    ring.rotation.x = Math.PI / 2;
    st.add(ring);
    st.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 10), this.assets.mats.white));
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.7), this.assets.mats.solar);
    panel.position.y = 0.4;
    st.add(panel);
    st.position.copy(this.station);
    scene.add(st);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x8ecfff,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const [key, pos] of this.beacons) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.assets.puff, color: key === "station" ? 0xe8893a : 0x8ecfff, depthTest: false }),
      );
      sprite.position.copy(pos);
      sprite.userData.beacon = true;
      scene.add(sprite);
      if (key === "earth" || key === "moon" || key === "mars") {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 30, 6, 1, true), beamMat);
        const n = key === "earth" ? PAD : this.zoneNormal(key, new THREE.Vector3());
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize());
        beam.position.copy(pos).addScaledVector(n, 15);
        scene.add(beam);
      }
    }
    scene.add(this.heat);
    this.buildZoneRings(scene);
    this.ensureFlightRig();
  }

  private cacheBodies(): void {
    for (const id of BODY_IDS) {
      const [x, y, z] = bodyOffset(id);
      this.bodyPos.set(id, new THREE.Vector3(x, y, z));
    }
    this.v1.crossVectors(PAD, new THREE.Vector3(0, 1, 0)).normalize();
    this.station.copy(this.v1).multiplyScalar(BODIES.earth.radius + 7.4);
    this.beacons.set("earth", PAD.clone().multiplyScalar(BODIES.earth.radius));
    this.beacons.set("station", this.station.clone());
    for (const id of BODY_IDS) {
      if (id === "earth") continue;
      const def = BODIES[id];
      if (def.gas) {
        const radial = this.bodyPos.get(id)!.clone().normalize();
        const tang = new THREE.Vector3().crossVectors(radial, new THREE.Vector3(0, 1, 0));
        if (tang.lengthSq() < 1e-4) tang.crossVectors(radial, new THREE.Vector3(1, 0, 0));
        tang.normalize();
        this.beacons.set(id, this.bodyPos.get(id)!.clone().addScaledVector(tang, def.radius + 9));
      } else {
        const n = this.bodyPos.get(id)!.clone().normalize().multiplyScalar(-1);
        this.beacons.set(id, this.bodyPos.get(id)!.clone().addScaledVector(n, def.radius + 0.2));
      }
    }
    this.buildZoneNormals();
  }

  private mountMenuShip(): void {
    if (this.menuRig) {
      this.menuScene.remove(this.menuRig.group);
      this.disposeObject(this.menuRig.group);
    }
    this.menuRig = buildShip(this.save.selected, this.assets);
    this.menuRig.group.scale.setScalar(0.35);
    this.menuScene.add(this.menuRig.group);
  }

  private mountGarage(): void {
    if (this.garageRig) {
      this.garageScene.remove(this.garageRig.group);
      this.disposeObject(this.garageRig.group);
    }
    this.garageRig = buildShip(this.inspect, this.assets);
    this.seat(this.garageRig, 0, 0, 0);
    this.garageScene.add(this.garageRig.group);
  }

  private mountPadShip(): void {
    if (this.padRig) {
      this.padScene.remove(this.padRig.group);
      this.disposeObject(this.padRig.group);
    }
    this.padRig = buildShip(this.save.selected, this.assets);
    this.seat(this.padRig, 0, 0, 1.05, this.save.selected !== "lunar");
    this.padScene.add(this.padRig.group);
    this.baseY.set(this.padRig, this.padRig.group.position.y);
  }

  private ensureFlightRig(): ShipRig {
    if (!this.flightRig || this.flightRig.group.userData.kind !== this.save.selected) {
      if (this.flightRig) {
        this.flightScene.remove(this.flightRig.group);
        this.disposeObject(this.flightRig.group);
      }
      this.flightRig = buildShip(this.save.selected, this.assets);
      this.flightRig.group.userData.kind = this.save.selected;
      this.flightRig.group.scale.setScalar(FLIGHT_SCALE);
      this.flightScene.add(this.flightRig.group);
    }
    return this.flightRig;
  }

  private seat(rig: ShipRig, x: number, z: number, ground: number, upright = false): void {
    // upright-launch-v1
    rig.group.scale.setScalar(1);
    rig.group.rotation.set(upright ? -Math.PI / 2 : 0, 0, 0);
    rig.group.position.set(x, 0, z);
    rig.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    if (upright) for (const h of rig.hull) box.expandByObject(h);
    else box.setFromObject(rig.group);
    rig.group.position.y += ground - box.min.y + 0.02;
    const size = new THREE.Vector3();
    box.getSize(size);
    rig.group.userData.hx = upright ? Math.max(size.x * 0.38, 1.1) : size.x * 0.38;
    rig.group.userData.hz = upright ? Math.max(size.z * 0.38, 1.1) : size.z * 0.38;
    rig.group.userData.upright = upright;
    rig.group.updateMatrixWorld(true);
  }

  private hatchWorld(rig: ShipRig, out: THREE.Vector3): THREE.Vector3 {
    rig.group.updateMatrixWorld(true);
    return out.copy(rig.hatch).applyMatrix4(rig.group.matrixWorld);
  }

  private animMenu(dt: number): void {
    const earth = this.menuScene.getObjectByName("menuEarth");
    const clouds = this.menuScene.getObjectByName("menuClouds");
    if (earth && !this.reduce) earth.rotation.y += dt * 0.05;
    if (clouds && !this.reduce) clouds.rotation.y += dt * 0.08;
    if (this.menuRig) {
      const a = this.menuT * 0.25;
      const px = Math.cos(a) * 4.4;
      const pz = Math.sin(a) * 4.4;
      this.menuRig.group.position.set(px, 0.85 + Math.sin(this.menuT * 0.6) * 0.15, pz);
      this.v1.set(-Math.sin(a), 0, Math.cos(a)).normalize();
      this.v2.set(0, 1, 0);
      this.v3.crossVectors(this.v2, this.v1).normalize();
      this.basis.makeBasis(this.v3, this.v2, this.v1);
      this.menuRig.group.quaternion.setFromRotationMatrix(this.basis);
    }
    const ang = this.menuT * (this.reduce ? 0 : 0.07);
    this.camera.position.set(Math.sin(ang) * 8.2, 1.8, Math.cos(ang) * 8.2);
    this.camera.lookAt(0, 0.6, 0);
  }

  private animGarage(dt: number, drag: { x: number; y: number }, wheel: number): void {
    this.garageDist = THREE.MathUtils.clamp(this.garageDist + wheel * 0.012, 7, 20);
    if (this.garageRig) {
      this.garageRig.group.rotation.y += drag.x * 0.012;
      if (!this.reduce && Math.abs(drag.x) < 0.2) this.garageRig.group.rotation.y += dt * 0.12;
    }
    this.camera.position.set(this.garageDist * 0.62, 2.2 + this.garageDist * 0.08, this.garageDist);
    this.camera.lookAt(0, 1.3, 0);
  }

  private animSolar(_dt: number, drag: { x: number; y: number }, wheel: number): void {
    this.solarYaw += drag.x * 0.005;
    this.solarPitch = THREE.MathUtils.clamp(this.solarPitch + drag.y * 0.003, -0.2, 1.05);
    this.solarDist = THREE.MathUtils.clamp(this.solarDist + wheel * 0.02, 16, 78);
    const cp = Math.cos(this.solarPitch);
    this.camera.position.set(
      Math.sin(this.solarYaw) * this.solarDist * cp,
      Math.sin(this.solarPitch) * this.solarDist,
      Math.cos(this.solarYaw) * this.solarDist * cp,
    );
    this.camera.lookAt(0, 0, 0);
    const focus = this.solarMeshes.find((m) => m.userData.dest === this.chartFocus);
    if (focus) {
      this.focusRing.position.copy(focus.position);
      this.focusRing.lookAt(this.camera.position);
    }
    if (!this.reduce) {
      for (const m of this.solarMeshes) m.rotation.y += 0.002;
    }
  }

  private pickSolar(click: { x: number; y: number }): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = (click.x / rect.width) * 2 - 1;
    this.ndc.y = -(click.y / rect.height) * 2 + 1;
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(this.solarMeshes, false);
    const hit = hits[0];
    const dest = hit?.object.userData.dest as DestId | undefined;
    if (dest && dest in DESTS) {
      this.chartFocus = dest;
      this.audio.ui();
      this.notifyNow = true;
    }
  }

  private tickSpin(dt: number): void {
    const spin = (rig: ShipRig | null) => {
      rig?.group.traverse((o) => {
        if (o.userData.spin) o.rotation.z += dt * 0.4;
      });
    };
    spin(this.flightRig);
    spin(this.garageRig);
    spin(this.menuRig);
    spin(this.padRig);
    const clouds = this.flightScene.getObjectByName("flightClouds");
    if (clouds && !this.reduce) clouds.rotation.y += dt * 0.01;
    this.updatePuffs(dt);
    this.updateBeaconScales();
  }

  private updateBeaconScales(): void {
    if (this.view !== "flight") return;
    this.flightScene.traverse((o) => {
      if (!o.userData.beacon) return;
      const d = this.camera.position.distanceTo(o.position);
      const s = THREE.MathUtils.clamp(d * 0.03, 1.2, 18);
      o.scale.setScalar(s);
    });
  }

  private paintInstruments(): void {
    const alt = this.phase === "flight" ? km(this.altitude()) : "PAD";
    const spd = this.phase === "flight" ? mps(this.velLen()) : "0 m/s";
    const fuel = `${Math.round((this.fuel / Math.max(1, this.stats().fuel)) * 100)}% FUEL`;
    this.assets.paintScreen([alt, spd, fuel, DESTS[this.save.destination].name]);
  }

  private initPuffs(): void {
    for (let i = 0; i < 42; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.assets.puff,
        color: 0xd5d8df,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const mesh = new THREE.Sprite(mat);
      mesh.visible = false;
      this.puffGroup.add(mesh);
      this.puffs.push({ mesh, life: 0, max: 1, v: new THREE.Vector3() });
    }
  }

  private attachPuffs(scene: THREE.Scene): void {
    this.puffGroup.removeFromParent();
    scene.add(this.puffGroup);
  }

  private emitPuff(origin: THREE.Vector3, upward: number): void {
    const p = this.puffs.find((item) => item.life <= 0);
    if (!p) return;
    p.life = p.max = 0.8 + Math.random() * 0.7;
    p.mesh.visible = true;
    p.mesh.position.copy(origin);
    p.mesh.position.x += (Math.random() - 0.5) * 1.4;
    p.mesh.position.z += (Math.random() - 0.5) * 1.4;
    p.v.set((Math.random() - 0.5) * 2.2, upward * (0.4 + Math.random()), (Math.random() - 0.5) * 2.2);
    p.mesh.scale.setScalar(1);
  }

  private updatePuffs(dt: number): void {
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.v.y += dt * 0.8;
      const k = Math.max(0, p.life / p.max);
      p.mesh.scale.setScalar(1.4 + (1 - k) * 7);
      (p.mesh.material as THREE.SpriteMaterial).opacity = k * 0.35;
      if (p.life <= 0) p.mesh.visible = false;
    }
  }

  private prompt(): string | null {
    if (this.screen !== "play" || this.modalQ.length) return null;
    if (this.phase === "countdown" || this.phase === "surfaceCountdown") return "E  Abort countdown";
    if (this.phase === "cockpit" || this.phase === "surfaceCockpit") return "E  Exit hatch";
    if (this.phase === "pad" && this.padRig) {
      if (this.walkerDist(this.hatchWorld(this.padRig, this.v1)) < 2.6) return "E  Board spacecraft";
      if (this.walkerDistXYZ(7.5, -5) < 2.8) return "E  Refuel";
    }
    if (this.phase === "surface" && this.surfaceRig && this.terrain) {
      for (const s of this.terrain.samples) {
        if (s.visible && this.walkerDist(s.position) < 2.1) return "E  Collect sample";
      }
      if (this.walkerDist(this.hatchWorld(this.surfaceRig, this.v1)) < 2.6) return "E  Enter spacecraft";
    }
    return null;
  }

  private detail(mission: MissionDef | null): string {
    if (!mission) return "Every beacon in the catalog has been logged.";
    if (mission.id === "reach-orbit") return `Hold the band  ${this.orbitHold.toFixed(1)} / 6 s`;
    if (mission.id === "moon-samples") return `Samples ${this.save.samples.moon ?? 0} / 3`;
    if (mission.id === "mars-samples") return `Samples ${this.save.samples.mars ?? 0} / 3`;
    if (this.phase === "flight") return `${mission.brief}  ·  ${Math.round(this.flightPos.distanceTo(this.targetPoint(this.v5)))} su out`;
    return mission.brief;
  }

  private walkerDist(p: THREE.Vector3): number {
    return Math.hypot(this.walker.x - p.x, this.walker.z - p.z);
  }

  private walkerDistXYZ(x: number, z: number): number {
    return Math.hypot(this.walker.x - x, this.walker.z - z);
  }

  private shipDistance(): number {
    const rig = this.surfaceRig;
    if (!rig || !this.phase.startsWith("surface")) return 0;
    return Math.hypot(this.walker.x - rig.group.position.x, this.walker.z - rig.group.position.z);
  }

  private syncRuntimeFromShip(full: boolean): void {
    const stats = this.stats();
    if (full) {
      this.fuel = stats.fuel;
      this.life = stats.life;
      this.save.fuel[this.save.selected] = this.fuel;
    } else {
      this.fuel = Math.min(stats.fuel, this.save.fuel[this.save.selected] ?? stats.fuel);
      this.life = stats.life;
    }
  }

  private parkFuel(): void {
    this.save.fuel[this.save.selected] = this.fuel;
  }

  private captureResume(): void {
    if (!this.save.started) {
      this.save.resume = null;
      return;
    }
    this.parkFuel();
    const rig = this.flightRig;
    this.save.resume = {
      view: this.phase === "flight" ? "flight" : this.phase.startsWith("surface") ? "surface" : "pad",
      body: this.phase.startsWith("surface") ? this.surfaceBody : "earth",
      dest: this.save.destination,
      fuel: this.fuel,
      life: this.life,
      ox: this.ox,
      pos: [this.flightPos.x, this.flightPos.y, this.flightPos.z],
      vel: [this.flightV.x, this.flightV.y, this.flightV.z],
      quat: rig ? [rig.group.quaternion.x, rig.group.quaternion.y, rig.group.quaternion.z, rig.group.quaternion.w] : [0, 0, 0, 1],
      yaw: this.walker.yaw,
      wx: this.walker.x,
      wz: this.walker.z,
      zi: this.landedZone,
    };
  }

  private persist(force: boolean): void {
    if (!force && !this.save.started) return;
    writeSave(this.save);
  }

  private toast(text: string): void {
    this.toastText = text;
    this.toastT = 3.4;
    this.notifyNow = true;
  }

  private useScene(scene: THREE.Scene, view: Spacebound["view"]): void {
    this.activeScene = scene;
    this.view = view;
    if (view === "flight") {
      this.camera.near = 0.05;
      this.camera.far = 9000;
    } else if (view === "solar") {
      this.camera.near = 0.1;
      this.camera.far = 400;
    } else {
      this.camera.near = 0.08;
      this.camera.far = 280;
    }
    this.camera.updateProjectionMatrix();
  }

  private starCount(): number {
    if (this.save.settings.quality === "low") return 800;
    if (this.save.settings.quality === "high") return 2200;
    return 1400;
  }

  private applyQuality(): void {
    const q: Quality = this.save.settings.quality;
    const dpr = q === "high" ? Math.min(window.devicePixelRatio || 1, 1.75) : q === "medium" ? Math.min(window.devicePixelRatio || 1, 1.35) : 1;
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = q !== "low";
    this.resize();
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  private disposeScene(scene: THREE.Scene): void {
    const keep = new Set<THREE.Material>(Object.values(this.assets.mats));
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const m of list) if (!keep.has(m)) m.dispose();
    });
  }

  private disposeObject(root: THREE.Object3D): void {
    const keep = new Set<THREE.Material>(Object.values(this.assets.mats));
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const m of list) if (!keep.has(m)) m.dispose();
    });
  }
}

