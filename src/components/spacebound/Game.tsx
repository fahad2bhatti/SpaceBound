import { useEffect, useRef, useState } from "react";
import {
  Award,
  Compass,
  Gauge,
  Info,
  Map as MapIcon,
  Navigation,
  Pause as PauseIcon,
  Play,
  Rocket,
  RotateCcw,
  Settings,
  Timer,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  DESTS,
  DEST_LIST,
  MISSIONS,
  SHIP_LIST,
  SHIPS,
  activeMission,
  formatClock,
  formatInt,
  gateShip,
  isShipUnlocked,
  km,
  missionState,
  mps,
  shipStats,
  upgradeCost,
  type DestId,
  type ShipId,
  type Upgrade,
} from "@/game/catalog";
import { Spacebound, type Snap } from "@/game/engine";
import { haptic } from "@/game/haptics";
import { pickHint } from "@/game/hints";
import { placeWaypoint } from "@/game/waypoint";
// phone-fix-map-v1
import { App as CapApp } from "@capacitor/app";
// phone-fix-menu-v1

function Cmd({
  children,
  onClick,
  tone = "ghost",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "ghost" | "accent";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        tone === "accent"
          ? "flex min-h-11 w-full items-center justify-between gap-3 border border-accent bg-accent px-4 py-2 text-left font-display text-xl uppercase tracking-wide text-bg"
          : "flex min-h-11 w-full items-center justify-between gap-3 border border-line bg-surface px-4 py-2 text-left font-display text-xl uppercase tracking-wide text-fg hover:border-primary"
      }
    >
      {children}
    </button>
  );
}

// menu-compact-v1
// screens-compact-v1
function Panel({ children, compact, cls }: { children: React.ReactNode; compact?: boolean; cls?: string }) {
  return (
    <aside
      className={"pointer-events-auto flex max-h-full w-full flex-col gap-4 overflow-y-auto bg-bg/90 p-5 backdrop-blur-md sm:max-w-md sm:border-r sm:border-line sm:p-8" + (compact ? " sb-panel-menu" : " sb-panel" + (cls ? " " + cls : ""))}
    >
      {children}
    </aside>
  );
}

function Mark() {
  return (
    <div>
      <p className="font-display text-sm tracking-widest text-primary">NORTHLINE RANGE</p>
      <h1 className="font-display text-5xl uppercase leading-none text-fg sm:text-6xl">Spacebound</h1>
      <p className="font-display text-lg tracking-widest text-accent">Beyond Earth</p>
    </div>
  );
}

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Spacebound | null>(null);
  const [rev, setRev] = useState(0);
  const [live, setLive] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const [touchUi, setTouchUi] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coarse = window.matchMedia("(pointer: coarse), (max-width: 800px)");
    const sync = () => setTouchUi(coarse.matches);
    sync();
    coarse.addEventListener("change", sync);
    try {
      const engine = new Spacebound(canvas, () => setRev((n) => n + 1));
      engineRef.current = engine;
      setLive(true);
    } catch (err) {
      setFault(err instanceof Error ? err.message : "The simulator failed to start.");
    }
    return () => {
      coarse.removeEventListener("change", sync);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    let handle: { remove: () => void } | undefined;
    let cancelled = false;
    CapApp.addListener("backButton", () => {
      const e = engineRef.current;
      if (!e) return;
      const s = e.getSnap();
      if (s.screen === "menu" && !s.modal && !s.confirmNew) {
        CapApp.exitApp().catch(() => {});
      } else {
        e.escape();
      }
    })
      .then((h) => {
        if (cancelled) h.remove();
        else handle = h;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);

  const engine = engineRef.current;
  const snap = live && engine ? engine.getSnap() : null;
  void rev;

  const act = (fn: (e: Spacebound) => void) => {
    const e = engineRef.current;
    if (!e) return;
    e.audio.unlock();
    fn(e);
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg text-fg">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      <div className="pointer-events-none absolute inset-0">
        {!live && !fault && (
          <div className="flex h-full flex-col justify-end p-6 sm:max-w-md sm:p-10">
            <Mark />
            <p className="mt-4 text-sm text-muted">Bringing the pad online…</p>
          </div>
        )}
        {fault && (
          <div className="pointer-events-auto flex h-full items-center p-6">
            <p className="max-w-md text-fg">{fault}</p>
          </div>
        )}
        {snap?.fault && (
          <div className="pointer-events-auto p-6">
            <p className="max-w-md border border-line bg-surface p-4 text-sm">{snap.fault}</p>
          </div>
        )}
        {snap && snap.screen === "menu" && <Menu snap={snap} act={act} />}
        {snap && snap.screen === "garage" && <Garage snap={snap} act={act} />}
        {snap && snap.screen === "missions" && <Missions snap={snap} act={act} />}
        {snap && snap.screen === "solar" && <Solar snap={snap} act={act} />}
        {snap && snap.screen === "settings" && <SettingsPanel snap={snap} act={act} />}
        {snap && snap.screen === "credits" && <Credits act={act} />}
        {snap && snap.screen === "pause" && <Pause snap={snap} act={act} />}
        {snap && (snap.screen === "play" || snap.screen === "pause") && snap.screen === "play" && (
          <Hud snap={snap} act={act} />
        )}
        {snap && snap.screen === "play" && !snap.modal && <Tips snap={snap} act={act} touch={touchUi} />}
        {snap?.toast && (
          <p className="absolute left-1/2 top-[4.5rem] max-w-md -translate-x-1/2 border border-line bg-bg/90 px-4 py-2 text-center text-sm text-fg sb-toast">
            {snap.toast}
          </p>
        )}
        {snap && snap.modal && (
          <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-bg/70 p-4">
            <div className="w-full max-w-md border border-line bg-surface p-6 sb-modal">
              <p className="font-display tracking-widest text-accent">{snap.modal.kicker ?? "MISSION COMPLETE"}</p>
              <h2 className="mt-2 font-display text-4xl uppercase">{snap.modal.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">{snap.modal.text}</p>
              <p className="mt-4 font-display text-2xl text-primary">+{formatInt(snap.modal.reward)} CR</p>
              <div className="mt-5">
                <Cmd tone="accent" onClick={() => act((e) => e.ackModal())}>
                  Continue <CheckMark />
                </Cmd>
              </div>
            </div>
          </div>
        )}
        {snap && snap.flash > 0.04 && (
          <div className="absolute inset-0 bg-fg" style={{ opacity: Math.min(0.65, snap.flash) }} />
        )}
        {snap && touchUi && snap.screen === "play" && !snap.modal && <Touch snap={snap} act={act} />}
        {snap && touchUi && snap.screen === "play" && !snap.modal && (
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 gap-3 sb-topbtns">
            <button
              type="button"
              aria-label="Pause menu"
              className="pointer-events-auto flex min-h-14 min-w-14 touch-none select-none items-center justify-center rounded-xl border border-line bg-bg/80 px-4 active:bg-primary/30"
              onClick={() =>
                act((e) => {
                  haptic.tap();
                  e.escape();
                })
              }
            >
              <PauseIcon className="size-6" />
            </button>
            <button
              type="button"
              aria-label="Map"
              className="pointer-events-auto flex min-h-14 min-w-14 touch-none select-none items-center justify-center rounded-xl border border-line bg-bg/80 px-4 active:bg-primary/30"
              onClick={() =>
                act((e) => {
                  haptic.tap();
                  e.pause();
                  e.open("solar");
                })
              }
            >
              <MapIcon className="size-6" />
            </button>
            {snap.phase === "flight" && (
              <button
                type="button"
                aria-label="Landing assist"
                aria-pressed={snap.settings.assist}
                className={
                  snap.settings.assist
                    ? "pointer-events-auto flex min-h-14 min-w-14 touch-none select-none items-center justify-center rounded-xl border border-primary bg-primary/30 px-3 font-display text-sm tracking-wide text-primary"
                    : "pointer-events-auto flex min-h-14 min-w-14 touch-none select-none items-center justify-center rounded-xl border border-line bg-bg/80 px-3 font-display text-sm tracking-wide"
                }
                onClick={() =>
                  act((e) => {
                    haptic.tap();
                    e.setSettings({ assist: !snap.settings.assist });
                  })
                }
              >
                ASSIST
              </button>
            )}
          </div>
        )}
        {snap && snap.screen === "play" && snap.phase === "flight" && !snap.modal && (
          <Waypoint engineRef={engineRef} name={DESTS[snap.destination].name} />
        )}
      </div>
    </main>
  );
}

function CheckMark() {
  return <span className="text-bg">→</span>;
}

function Menu({ snap, act }: { snap: Snap; act: (fn: (e: Spacebound) => void) => void }) {
  return (
    <div className="flex h-full items-stretch">
      <Panel compact>
        <Mark />
        <p className="sb-hide-short text-sm leading-relaxed text-muted">
          Walk the gantry, earn the range, and bring the ship home. Distances are compressed so a transfer
          takes minutes, not months.
        </p>
        <p className="font-display text-lg text-primary">{formatInt(snap.credits)} CR</p>
        {snap.confirmNew ? (
          <>
            <p className="text-sm text-fg">Starting fresh replaces the saved mission.</p>
            <Cmd tone="accent" onClick={() => act((e) => e.newGame())}>
              Start fresh <Play className="size-5" />
            </Cmd>
            <Cmd onClick={() => act((e) => e.cancelNew())}>Keep save</Cmd>
          </>
        ) : (
          <>
            <Cmd tone="accent" onClick={() => act((e) => e.requestNew())}>
              New Game <Play className="size-5" />
            </Cmd>
            {snap.started && (
              <Cmd onClick={() => act((e) => e.continueGame())}>
                Continue <Rocket className="size-5" />
              </Cmd>
            )}
          </>
        )}
        <div className="sb-menu-grid flex flex-col gap-4">
          <Cmd onClick={() => act((e) => e.open("garage"))}>
            Spacecraft Garage <Gauge className="size-5" />
          </Cmd>
          <Cmd onClick={() => act((e) => e.open("missions"))}>
            Missions <Award className="size-5" />
          </Cmd>
          <Cmd onClick={() => act((e) => e.open("solar"))}>
            Solar Chart <Compass className="size-5" />
          </Cmd>
          <Cmd onClick={() => act((e) => e.open("settings"))}>
            Settings <Settings className="size-5" />
          </Cmd>
          <Cmd onClick={() => act((e) => e.open("credits"))}>
            Credits <Info className="size-5" />
          </Cmd>
        </div>
        <p className="sb-hide-short text-xs leading-relaxed text-muted">
          Pad: WASD move, A/D turn, Shift run, Space jump, mouse look, E board. Flight: W/S throttle, A/D yaw,
          arrows pitch, Space/Shift RCS, V level, C camera.
        </p>
      </Panel>
    </div>
  );
}

function Garage({ snap, act }: { snap: Snap; act: (fn: (e: Spacebound) => void) => void }) {
  const ship = SHIPS[snap.inspect];
  const up = snap.upgrades[snap.inspect];
  const stats = shipStats(snap.inspect, up);
  const unlocked = isShipUnlocked(snap.done, ship);
  const owned = snap.owned.includes(ship.id);
  return (
    <div className="flex h-full flex-col sm:flex-row-reverse">
      <aside className="pointer-events-auto flex max-h-[58%] w-full flex-col gap-3 overflow-y-auto bg-bg/90 p-4 backdrop-blur-md sm:max-h-full sm:max-w-md sm:border-l sm:border-line sm:p-6 sb-side">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-sm tracking-widest text-primary">{ship.category}</p>
            <h2 className="font-display text-4xl uppercase">{ship.name}</h2>
          </div>
          <button type="button" className="min-h-11 min-w-11 border border-line px-3" onClick={() => act((e) => e.back())}>
            <X className="size-5" />
          </button>
        </div>
        <p className="text-sm text-muted">{ship.blurb}</p>
        <p className="font-display text-lg text-primary">{formatInt(snap.credits)} CR</p>
        <div className="sb-stats grid gap-3">
<Stat label="Range" value={km(stats.range)} />
        <Stat label="Max speed" value={mps(stats.speed)} />
        <Stat label="Fuel" value={`${Math.round(stats.fuel)} units`} />
        <Stat label="Thrust" value={stats.accel.toFixed(1)} />
        <Stat label="Crew" value={String(ship.crew)} icon={<Users className="size-4" />} />
        <Stat label="Cargo" value={String(ship.cargo)} />
        <Stat label="Life support" value={formatClock(stats.life)} icon={<Timer className="size-4" />} />
</div>
        <p className="sb-hide-short text-xs text-muted">Drag to rotate. Scroll to zoom. Nav upgrades add 5% range per level and cannot skip a planet tier.</p>
        {owned ? (
          <Cmd tone="accent" onClick={() => act((e) => e.selectShip(ship.id))}>
            {snap.selected === ship.id ? "On the pad" : "Select ship"} <Rocket className="size-5" />
          </Cmd>
        ) : unlocked ? (
          <Cmd tone="accent" onClick={() => act((e) => e.buy(ship.id))}>
            Buy {formatInt(ship.price)} CR
          </Cmd>
        ) : (
          <Cmd onClick={() => act((e) => e.buy(ship.id))}>
            Locked · {MISSIONS.find((m) => m.id === ship.unlock)?.name ?? "Mission"}
          </Cmd>
        )}
        {owned && snap.selected !== ship.id && (
          <Cmd onClick={() => act((e) => e.sell(ship.id))}>Sell for {formatInt(Math.round(ship.price * 0.5))} CR</Cmd>
        )}
        {owned && (
          <div className="grid gap-2">
            <UpgradeRow slot="engine" label="Engine" level={up.engine} ship={ship.id} credits={snap.credits} act={act} />
            <UpgradeRow slot="tank" label="Fuel tank" level={up.tank} ship={ship.id} credits={snap.credits} act={act} />
            <UpgradeRow slot="nav" label="Navigation" level={up.nav} ship={ship.id} credits={snap.credits} act={act} />
          </div>
        )}
        <div className="sb-grid-2 grid gap-2">
          {SHIP_LIST.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => act((e) => e.setInspect(s.id))}
              className={
                s.id === snap.inspect
                  ? "min-h-11 border border-primary px-3 py-2 text-left"
                  : "min-h-11 border border-line px-3 py-2 text-left"
              }
            >
              <span className="block font-display text-lg uppercase">{s.name}</span>
              <span className="text-xs text-muted">
                {s.category} · {isShipUnlocked(snap.done, s) ? (snap.owned.includes(s.id) ? "Owned" : `${formatInt(s.price)} CR`) : "Locked"} · {km(s.range)}
              </span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function UpgradeRow({
  slot,
  label,
  level,
  ship,
  credits,
  act,
}: {
  slot: keyof Upgrade;
  label: string;
  level: number;
  ship: ShipId;
  credits: number;
  act: (fn: (e: Spacebound) => void) => void;
}) {
  const cost = level >= 3 ? 0 : upgradeCost(ship, level);
  return (
    <button
      type="button"
      onClick={() => act((e) => e.upgrade(slot))}
      className="flex min-h-11 items-center justify-between border border-line px-3 text-left text-sm"
    >
      <span>
        {label} {level}/3
      </span>
      <span className={cost > credits ? "text-accent" : "text-primary"}>{level >= 3 ? "Max" : `${formatInt(cost)} CR`}</span>
    </button>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-1 text-sm">
      <span className="flex items-center gap-2 text-muted">
        {icon}
        {label}
      </span>
      <span className="font-display text-lg text-fg">{value}</span>
    </div>
  );
}

function Missions({ snap, act }: { snap: Snap; act: (fn: (e: Spacebound) => void) => void }) {
  return (
    <div className="flex h-full">
      <Panel cls="sb-panel-wide">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-4xl uppercase">Missions</h2>
          <button type="button" className="min-h-11 min-w-11 border border-line px-3" onClick={() => act((e) => e.back())}>
            <X className="size-5" />
          </button>
        </div>
        <p className="text-sm text-muted">Active route: {activeMission(snap.done)?.name ?? "Catalog complete"}.</p>
        <div className="sb-grid-2 grid gap-3">
          {MISSIONS.map((m) => {
            const state = missionState(snap.done, m.id);
            return (
              <article key={m.id} className="border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-xl uppercase">{m.name}</h3>
                  <span className={state === "done" ? "text-primary" : state === "active" ? "text-accent" : "text-muted"}>
                    {state}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{m.brief}</p>
                <p className="mt-2 text-sm text-fg">+{formatInt(m.reward)} CR</p>
                {m.dest && state !== "locked" && (
                  <button
                    type="button"
                    className="mt-2 min-h-11 w-full border border-line px-3 text-left font-display uppercase"
                    onClick={() => act((e) => e.setDest(m.dest!))}
                  >
                    Plot {DESTS[m.dest].name}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function Solar({ snap, act }: { snap: Snap; act: (fn: (e: Spacebound) => void) => void }) {
  const focus = DESTS[snap.chartFocus];
  const stats = shipStats(snap.selected, snap.upgrades[snap.selected]);
  const reach = stats.range + 0.01 >= focus.route;
  const gate = gateShip(focus.route);
  return (
    <div className="flex h-full flex-col sm:flex-row-reverse">
      <aside className="pointer-events-auto max-h-[62%] w-full overflow-y-auto bg-bg/90 p-4 backdrop-blur-md sm:max-h-full sm:max-w-md sm:border-l sm:border-line sm:p-6 sb-side">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-4xl uppercase">Solar chart</h2>
          <button type="button" className="min-h-11 min-w-11 border border-line px-3" onClick={() => act((e) => e.back())}>
            <X className="size-5" />
          </button>
        </div>
        <p className="sb-hide-short mt-2 text-sm text-muted">Drag to orbit the chart. Click a planet. The orrery is not to scale. Route ratings are.</p>
        <p className="mt-3 font-display text-sm tracking-widest text-primary">{SHIPS[snap.selected].name}</p>
        <p className="text-sm text-fg">Certified range {km(stats.range)}</p>
        <div className="mt-3 border border-line p-3">
          <h3 className="font-display text-3xl uppercase">{focus.name}</h3>
          <p className="mt-2 text-sm text-muted">{focus.blurb}</p>
          <p className="mt-2 text-sm">Route rating {km(focus.route)}</p>
          {reach ? (
            <p className="mt-2 text-sm text-primary">Selected ship can fly this route.</p>
          ) : (
            <p className="mt-2 text-sm text-accent">
              {SHIPS[snap.selected].name} cannot reach this. Requires {gate.name} ({gate.category}) or a ship with {km(focus.route)} of range.
            </p>
          )}
          <div className="mt-3">
            <Cmd tone={reach ? "accent" : "ghost"} onClick={() => act((e) => e.setDest(focus.id))}>
              {reach ? "Set destination" : "Check requirement"} <Navigation className="size-5" />
            </Cmd>
          </div>
        </div>
        <div className="sb-grid-2 mt-3 grid gap-2">
          {DEST_LIST.map((id) => (
            <DestRow key={id} id={id} snap={snap} act={act} />
          ))}
        </div>
      </aside>
    </div>
  );
}

function DestRow({
  id,
  snap,
  act,
}: {
  id: DestId;
  snap: Snap;
  act: (fn: (e: Spacebound) => void) => void;
}) {
  const dest = DESTS[id];
  const stats = shipStats(snap.selected, snap.upgrades[snap.selected]);
  const open = stats.range + 0.01 >= dest.route;
  return (
    <button
      type="button"
      onClick={() => act((e) => e.focusChart(id))}
      className={
        id === snap.chartFocus
          ? "min-h-11 border border-primary px-3 py-2 text-left"
          : "min-h-11 border border-line px-3 py-2 text-left"
      }
    >
      <span className="font-display text-lg uppercase">{dest.name}</span>
      <span className="block text-xs text-muted">
        {open ? "Open" : "Locked"} · {km(dest.route)}
        {snap.destination === id ? " · targeted" : ""}
      </span>
    </button>
  );
}

function SettingsPanel({ snap, act }: { snap: Snap; act: (fn: (e: Spacebound) => void) => void }) {
  const s = snap.settings;
  return (
    <div className="flex h-full">
      <Panel cls="sb-panel-wide sb-settings">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-4xl uppercase">Settings</h2>
          <button type="button" className="min-h-11 min-w-11 border border-line px-3" onClick={() => act((e) => e.back())}>
            <X className="size-5" />
          </button>
        </div>
        <label className="grid gap-2 text-sm text-muted">
          Master volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={s.volume}
            onChange={(e) => act((en) => en.setSettings({ volume: Number(e.target.value) }))}
          />
        </label>
        <button
          type="button"
          className="flex min-h-11 items-center justify-between border border-line px-3"
          onClick={() => act((e) => e.setSettings({ muted: !s.muted }))}
        >
          {s.muted ? "Muted" : "Sound on"}
          {s.muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
        <button
          type="button"
          className="min-h-11 border border-line px-3 text-left"
          onClick={() => act((e) => e.setSettings({ ambient: !s.ambient }))}
        >
          Ambient drone {s.ambient ? "on" : "off"}
        </button>
        <button
          type="button"
          className="min-h-11 border border-line px-3 text-left"
          onClick={() => act((e) => e.setSettings({ assist: !s.assist }))}
        >
          Landing assist {s.assist ? "on" : "off"}
        </button>
        <button
          type="button"
          className="min-h-11 border border-line px-3 text-left"
          onClick={() => act((e) => e.setSettings({ leftHanded: !s.leftHanded }))}
        >
          Left-handed controls {s.leftHanded ? "on" : "off"}
        </button>
        <button
          type="button"
          className="min-h-11 border border-line px-3 text-left"
          onClick={() => act((e) => e.setSettings({ haptics: !s.haptics }))}
        >
          Haptics {s.haptics ? "on" : "off"}
        </button>
        <label className="grid gap-2 text-sm text-muted">
          Touch button size {Math.round(s.touchScale * 100)}%
          <input
            type="range"
            min={0.8}
            max={1.4}
            step={0.1}
            value={s.touchScale}
            onChange={(e) => act((en) => en.setSettings({ touchScale: Number(e.target.value) }))}
          />
        </label>
        <button type="button" className="min-h-11 border border-line px-3 text-left" onClick={() => act((e) => e.replayHints())}>
          Replay first-time tips
        </button>
        <label className="grid gap-2 text-sm text-muted">
          Look sensitivity
          <input
            type="range"
            min={0.0008}
            max={0.006}
            step={0.0001}
            value={s.sens}
            onChange={(e) => act((en) => en.setSettings({ sens: Number(e.target.value) }))}
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["low", "medium", "high"] as const).map((q) => (
            <button
              key={q}
              type="button"
              className={
                s.quality === q
                  ? "min-h-11 border border-primary font-display uppercase"
                  : "min-h-11 border border-line font-display uppercase"
              }
              onClick={() => act((e) => e.setSettings({ quality: q }))}
            >
              {q}
            </button>
          ))}
        </div>
        {snap.confirmReset ? (
          <>
            <p className="text-sm text-accent">This wipes credits, ships, and missions on this browser.</p>
            <Cmd tone="accent" onClick={() => act((e) => e.resetProgress())}>
              Confirm reset <RotateCcw className="size-5" />
            </Cmd>
            <Cmd onClick={() => act((e) => e.cancelReset())}>Cancel</Cmd>
          </>
        ) : (
          <Cmd onClick={() => act((e) => e.requestReset())}>
            Reset progress <RotateCcw className="size-5" />
          </Cmd>
        )}
      </Panel>
    </div>
  );
}

function Credits({ act }: { act: (fn: (e: Spacebound) => void) => void }) {
  return (
    <div className="flex h-full">
      <Panel cls="sb-panel-wide">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-4xl uppercase">Credits</h2>
          <button type="button" className="min-h-11 min-w-11 border border-line px-3" onClick={() => act((e) => e.back())}>
            <X className="size-5" />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          SPACEBOUND: BEYOND EARTH is an original flight sim. Northline Launch Complex and the Vesper fleet are
          fictional. The scale of the solar system is compressed on purpose so you can fly, land, and walk the
          surface in one sitting. Nothing here is a physical ephemeris.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          Ships unlock as you finish missions. Credits buy hulls, fuel, and upgrades. A ship that is short on
          range cannot be pointed at a farther world, no matter how the chart is spun.
        </p>
        <Cmd onClick={() => act((e) => e.back())}>Return</Cmd>
      </Panel>
    </div>
  );
}

function Pause({ snap, act }: { snap: Snap; act: (fn: (e: Spacebound) => void) => void }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="pointer-events-auto w-full max-w-md border border-line bg-bg/95 p-6 sb-pause">
        <h2 className="font-display text-4xl uppercase">Hold</h2>
        <p className="mt-2 text-sm text-muted">{snap.objective}</p>
        <div className="sb-grid-2 mt-4 grid gap-2">
          <Cmd tone="accent" onClick={() => act((e) => e.resumePlay())}>
            Resume <Play className="size-5" />
          </Cmd>
          <Cmd onClick={() => act((e) => e.open("solar"))}>
            Solar chart <MapIcon className="size-5" />
          </Cmd>
          {snap.phase === "pad" && (
            <Cmd onClick={() => act((e) => e.open("garage"))}>
              Garage <Gauge className="size-5" />
            </Cmd>
          )}
          {(snap.phase === "flight" || snap.phase.startsWith("surface")) && (
            <Cmd onClick={() => act((e) => e.abortToOrbit())}>Abort to Earth orbit</Cmd>
          )}
          <Cmd onClick={() => act((e) => e.open("settings"))}>
            Settings <Settings className="size-5" />
          </Cmd>
          <Cmd onClick={() => act((e) => e.open("menu"))}>Main menu</Cmd>
        </div>
      </div>
    </div>
  );
}

function Hud({ snap, act }: { snap: Snap; act: (fn: (e: Spacebound) => void) => void }) {
  const fuelPct = Math.max(0, Math.min(100, (snap.fuel / Math.max(1, snap.fuelMax)) * 100));
  const flight = snap.phase === "flight" || snap.phase === "liftoff";
  const surface = snap.phase.startsWith("surface");
  const cockpit = snap.phase === "cockpit" || snap.phase === "surfaceCockpit";
  return (
    <>
      <div className="absolute left-4 top-4 max-w-xs border border-line bg-bg/80 p-3 backdrop-blur-md sm:left-6 sm:top-6 sb-obj">
        <p className="font-display text-xs tracking-widest text-accent">OBJECTIVE</p>
        <p className="font-display text-2xl uppercase leading-none">{snap.objective}</p>
        <p className="sb-obj-detail mt-2 text-xs leading-relaxed text-muted">{snap.detail}</p>
      </div>
      <div className="absolute right-4 top-4 border border-line bg-bg/80 p-3 text-right backdrop-blur-md sm:right-6 sm:top-6 sb-dest">
        <p className="font-display text-xs tracking-widest text-primary">{DESTS[snap.destination].name}</p>
        <p className="font-display text-xl">{formatClock(snap.life)} LIFE</p>
        {flight && <p className="text-xs text-muted">{Math.round(snap.destDist)} su to target</p>}
      </div>
      {snap.countdown !== null && (
        <p className="absolute left-1/2 top-24 -translate-x-1/2 font-display text-7xl text-accent sb-countdown">{snap.countdown}</p>
      )}
      {cockpit && (
        <div className="pointer-events-auto absolute bottom-24 left-1/2 w-full max-w-md -translate-x-1/2 border border-line bg-bg/90 p-4 sm:bottom-8 sb-preflight">
          <p className="font-display tracking-widest text-primary">PREFLIGHT</p>
          <div className="sb-grid-2 mt-3 grid gap-2">
            <CheckBtn on={snap.checks.fuel} label={`Tanks ${Math.round(fuelPct)}%`} onClick={() => act((e) => e.confirmCheck("fuel"))} />
            <CheckBtn on={snap.checks.eng} label="Arm engines" onClick={() => act((e) => e.confirmCheck("eng"))} />
            <CheckBtn
              on={snap.checks.nav}
              label={`Nav ${DESTS[snap.destination].name}`}
              onClick={() => act((e) => e.confirmCheck("nav"))}
            />
            <Cmd tone="accent" onClick={() => act((e) => e.requestLaunch())}>
              Ignite countdown <Rocket className="size-5" />
            </Cmd>
            {snap.docked && (
              <Cmd onClick={() => act((e) => e.refuel())}>
                Refuel {snap.refuelPrice > 0 ? `${formatInt(snap.refuelPrice)} CR` : "full"}
              </Cmd>
            )}
          </div>
          <p className="sb-hide-short mt-3 text-xs text-muted">W/S throttle · A/D yaw left/right · ↑/↓ pitch · Space/Shift RCS · V level wings · C camera · Esc hold</p>
        </div>
      )}
      {flight && (
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-4 border border-line bg-bg/80 px-4 py-3 backdrop-blur-md sb-readouts">
          <Readout label="ALT" value={km(snap.altitude)} />
          <Readout label="VEL" value={mps(snap.speed)} />
          <Readout label="CLIMB" value={mps(snap.climb)} />
          <div className="min-w-24">
            <p className="text-xs text-muted">FUEL</p>
            <div className="mt-1 h-1.5 w-full bg-line">
              <div className="h-full bg-accent" style={{ width: `${fuelPct}%` }} />
            </div>
            <p className="font-display text-lg">{Math.round(fuelPct)}%</p>
          </div>
          <Readout label="THR" value={`${Math.round(snap.throttle * 100)}%`} />
        </div>
      )}
      {flight && (
        <p
          className={
            snap.envelope
              ? "sb-status absolute bottom-28 left-1/2 -translate-x-1/2 font-display tracking-widest text-primary"
              : "sb-status absolute bottom-28 left-1/2 -translate-x-1/2 font-display tracking-widest text-muted"
          }
        >
          {snap.rangeLocked
            ? "RANGE LOCK"
            : snap.braking
              ? "ENTRY BRAKE"
              : snap.assistActive
                ? snap.envelope
                  ? "ASSIST · LANDING ENVELOPE"
                  : "LANDING ASSIST"
                : snap.envelope
                  ? "LANDING ENVELOPE"
                  : "FLY THE BEACON"}
        </p>
      )}
      {surface && snap.phase === "surface" && (
        <div className="absolute bottom-6 left-4 border border-line bg-bg/80 p-3 backdrop-blur-md sb-ox">
          <p className="text-xs text-muted">OXYGEN</p>
          <p className="font-display text-3xl">{Math.round(snap.ox)}%</p>
          <p className="text-xs text-muted">Suit {snap.ox > 35 ? "nominal" : snap.ox > 15 ? "caution" : "critical"}</p>
          <p className="mt-2 text-xs text-muted">Ship {Math.round(snap.shipDist)} m · Samples {Math.min(3, snap.sampleCount)}/3</p>
        </div>
      )}
      {snap.prompt && (
        <p className="absolute bottom-6 left-1/2 -translate-x-1/2 border border-accent bg-bg/90 px-4 py-2 font-display text-xl uppercase tracking-wide sb-prompt">
          {snap.prompt}
        </p>
      )}
      {(snap.phase === "pad" || snap.phase === "surface") && !snap.prompt && (
        <p className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-xs text-muted sm:block sb-hide-short">
          Click the scene to look · WASD · A turns left · E interact
        </p>
      )}
    </>
  );
}

function Tips({
  snap,
  act,
  touch,
}: {
  snap: Snap;
  act: (fn: (e: Spacebound) => void) => void;
  touch: boolean;
}) {
  const hint = pickHint({
    phase: snap.phase,
    prompt: snap.prompt,
    landing: snap.assistActive || (snap.envelope && snap.climb < -0.3),
    touch,
    seen: snap.hints,
  });
  const id = hint?.id ?? null;
  const actRef = useRef(act);
  actRef.current = act;
  const prev = useRef<string | null>(null);
  // A tip counts as seen once it was shown and the moment has passed (or after a few seconds).
  useEffect(() => {
    const last = prev.current;
    prev.current = id;
    if (last && last !== id) actRef.current((e) => e.markHint(last));
    if (!id) return;
    const t = window.setTimeout(() => actRef.current((e) => e.markHint(id)), 9000);
    return () => window.clearTimeout(t);
  }, [id]);
  if (!hint) return null;
  return (
    <button
      type="button"
      className="pointer-events-auto absolute left-1/2 top-[7.5rem] max-w-[18rem] -translate-x-1/2 border border-primary bg-bg/90 px-4 py-2 text-left text-sm text-fg sb-tip"
      onClick={() => act((e) => e.markHint(hint.id))}
    >
      <span className="block font-display text-xs tracking-widest text-primary">TIP</span>
      {hint.text}
      <span className="mt-1 block text-xs text-muted">Tap to dismiss</span>
    </button>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display text-2xl leading-none tabular-nums">{value}</p>
    </div>
  );
}

function CheckBtn({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-11 items-center justify-between border border-line px-3 text-left">
      <span>{label}</span>
      <span className={on ? "text-primary" : "text-muted"}>{on ? "SET" : "CHECK"}</span>
    </button>
  );
}

// phone-fix-dpad-v1
function Touch({ snap, act }: { snap: Snap; act: (fn: (e: Spacebound) => void) => void }) {
  const flight = snap.phase === "flight";
  const setStick = (x: number, y: number) => act((e) => e.input.setTouch({ x, y }));
  const scale = snap.settings.touchScale;
  return (
    <div
      className={
        snap.settings.leftHanded
          ? "pointer-events-none absolute inset-x-0 bottom-0 flex flex-row-reverse items-end justify-between p-4 pb-24 sb-touch"
          : "pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 pb-24 sb-touch"
      }
      style={{ "--ts": scale } as React.CSSProperties}
    >
      {flight ? (
        <div className="pointer-events-auto grid grid-cols-3 gap-2">
          <span />
          <TouchBtn label="▲" hold onHold={(v) => act((e) => e.input.setTouch({ pitchUp: v }))} />
          <span />
          <TouchBtn label="◀" hold onHold={(v) => act((e) => e.input.setTouch({ x: v ? -1 : 0 }))} />
          <TouchBtn label="▼" hold onHold={(v) => act((e) => e.input.setTouch({ pitchDown: v }))} />
          <TouchBtn label="▶" hold onHold={(v) => act((e) => e.input.setTouch({ x: v ? 1 : 0 }))} />
        </div>
      ) : (
        <Stick onChange={setStick} scale={scale} />
      )}
      <div className="pointer-events-auto grid grid-cols-2 gap-3">
        <TouchBtn label="E" onDown={() => act((e) => e.input.pulseInteract())} />
        <TouchBtn label="C" onDown={() => act((e) => e.input.pulseCam())} />
        {flight ? (
          <>
            <TouchBtn label="THR+" hold onHold={(v) => act((e) => e.input.setTouch({ y: v ? 1 : 0 }))} />
            <TouchBtn label="THR-" hold onHold={(v) => act((e) => e.input.setTouch({ y: v ? -1 : 0 }))} />
            <TouchBtn label="RCS+" hold onHold={(v) => act((e) => e.input.setTouch({ rcsUp: v }))} />
            <TouchBtn label="RCS-" hold onHold={(v) => act((e) => e.input.setTouch({ rcsDown: v }))} />
          </>
        ) : (
          <>
            <TouchBtn label="JUMP" hold onHold={(v) => act((e) => e.input.setTouch({ jump: v }))} />
            <TouchBtn label="RUN" hold onHold={(v) => act((e) => e.input.setTouch({ run: v }))} />
          </>
        )}
      </div>
    </div>
  );
}

// joystick-fix-v1
function Stick({ onChange, scale }: { onChange: (x: number, y: number) => void; scale: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const emit = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = (clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = -(clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    setKnob({ x: dx, y: dy });
    onChange(dx, dy);
  };
  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeId.current !== e.pointerId) return;
    activeId.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  return (
    <div
      ref={ref}
      className="pointer-events-auto relative touch-none select-none rounded-full border border-line bg-bg/70"
      style={{ width: `${9 * scale}rem`, height: `${9 * scale}rem` }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (activeId.current !== null) return;
        e.preventDefault();
        haptic.tap();
        activeId.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        emit(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activeId.current === e.pointerId) emit(e.clientX, e.clientY);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 rounded-full bg-primary"
        style={{
          width: `${3.5 * scale}rem`,
          height: `${3.5 * scale}rem`,
          transform:
            "translate(calc(-50% + " + knob.x * 36 * scale + "px), calc(-50% + " + -knob.y * 36 * scale + "px))",
        }}
      />
    </div>
  );
}

function TouchBtn({
  label,
  onDown,
  hold,
  onHold,
}: {
  label: string;
  onDown?: () => void;
  hold?: boolean;
  onHold?: (down: boolean) => void;
}) {
  const end = () => {
    if (hold) onHold?.(false);
  };
  return (
    <button
      type="button"
      className="touch-none select-none rounded-xl border border-line bg-bg/80 px-4 font-display text-lg uppercase active:bg-primary/30"
      style={{ minHeight: "calc(4rem * var(--ts, 1))", minWidth: "calc(4rem * var(--ts, 1))" }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault();
        haptic.tap();
        onDown?.();
        if (hold) onHold?.(true);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
    >
      {label}
    </button>
  );
}

function Waypoint({ engineRef, name }: { engineRef: React.RefObject<Spacebound | null>; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = box.current;
      const e = engineRef.current;
      if (!el || !e) return;
      const p = e.projectTarget();
      if (!p) {
        el.style.opacity = "0";
        return;
      }
      const pos = placeWaypoint(p, window.innerWidth, window.innerHeight);
      el.style.opacity = "1";
      el.style.transform = "translate(" + Math.round(pos.x) + "px, " + Math.round(pos.y) + "px)";
      if (arrow.current) {
        arrow.current.style.display = pos.off ? "block" : "none";
        arrow.current.style.transform = "rotate(" + Math.round(pos.angle) + "deg)";
      }
      if (ring.current) ring.current.style.display = pos.off ? "none" : "block";
      if (label.current) label.current.textContent = name.toUpperCase() + " · " + Math.round(p.dist) + " su";
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [engineRef, name]);
  return (
    <div ref={box} className="pointer-events-none absolute left-0 top-0 z-10 opacity-0">
      <div className="flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
        <span ref={arrow} className="block text-3xl leading-none text-accent">▲</span>
        <span ref={ring} className="block size-9 rotate-45 border-2 border-accent" />
        <span ref={label} className="whitespace-nowrap border border-line bg-bg/80 px-2 py-0.5 font-display text-sm tracking-widest text-accent" />
      </div>
    </div>
  );
}
