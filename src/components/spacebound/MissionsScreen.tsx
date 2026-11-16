// missions-guide-v1: Missions screen. Ek taraf planet patti (3D menu piche), dusri taraf sari details:
// planet ki guide, campaign missions, contracts. Garage ke split jaisa layout.
import { useState } from "react";
import { Navigation, X } from "lucide-react";
import { DESTS, MISSIONS, activeMission, formatInt, missionState, shipStats, BODIES, type MissionDef } from "@/game/catalog";
import { PLACE_ORDER, PLACE_TAG, guideFor, placeName, placeOfMission, shipsUnlockedBy, type PlaceId } from "@/game/guide";
import type { Spacebound, Snap } from "@/game/engine";
import type { Difficulty } from "@/game/contracts/types";
import { Card } from "./Contracts";

type Act = (fn: (e: Spacebound) => void) => void;

const DIFF_RANK: Record<Difficulty, number> = { easy: 0, normal: 1, hard: 2 };

function StateChip({ state }: { state: "locked" | "active" | "done" }) {
  const cls = state === "done" ? "border-primary text-primary" : state === "active" ? "border-accent text-accent" : "border-line text-muted";
  return <span className={"inline-block border px-2 py-0.5 font-display text-xs uppercase leading-none tracking-widest " + cls}>{state}</span>;
}

function MissionRow({ m, snap, act }: { m: MissionDef; snap: Snap; act: Act }) {
  const state = missionState(snap.done, m.id);
  const next = activeMission(snap.done)?.id === m.id;
  const ships = shipsUnlockedBy(m.id);
  return (
    <article className={"border p-3 " + (next ? "border-accent" : "border-line")}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-display text-lg uppercase leading-tight">{m.name}</h4>
        <StateChip state={state} />
      </div>
      <p className="mt-1 text-sm text-muted">{m.brief}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-display text-lg text-primary">+{formatInt(m.reward)} CR</span>
        {next && <span className="font-display text-xs uppercase tracking-widest text-accent">Next on your route</span>}
        {ships.length > 0 && <span className="text-xs text-muted">Unlocks {ships.map((s) => s.name).join(", ")}</span>}
      </div>
      {m.dest && state !== "locked" && (
        <button
          type="button"
          className="mt-2 flex min-h-11 w-full items-center justify-between border border-line px-3 text-left font-display uppercase hover:border-primary"
          onClick={() => act((e) => e.setDest(m.dest!))}
        >
          <span>Plot {DESTS[m.dest].name}</span>
          <Navigation className="size-4" />
        </button>
      )}
    </article>
  );
}

export function MissionsScreen({ snap, act }: { snap: Snap; act: Act }) {
  const next = activeMission(snap.done);
  const [place, setPlace] = useState<PlaceId>(() => (next ? placeOfMission(next) : "earth"));
  const guide = guideFor(place);
  const missions = MISSIONS.filter((m) => placeOfMission(m) === place);
  const contracts = snap.contracts.all.filter((c) => c.planet === place).sort((a, b) => DIFF_RANK[a.difficulty] - DIFF_RANK[b.difficulty]);
  const route = place === "earth" || place === "deep" ? 0 : BODIES[place].route;
  const stats = shipStats(snap.selected, snap.upgrades[snap.selected]);
  const canReach = stats.range + 0.01 >= route;

  return (
    <div className="sb-ms">
      <aside className="sb-ms-side pointer-events-auto flex flex-col gap-3 overflow-y-auto bg-bg/90 p-4 backdrop-blur-md sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-xs uppercase tracking-widest text-primary">Missions</p>
            <h2 className="font-display text-4xl uppercase leading-none">{guide.name}</h2>
          </div>
          <button type="button" aria-label="Close" className="min-h-11 min-w-11 shrink-0 border border-line px-3" onClick={() => act((e) => e.back())}>
            <X className="size-5" />
          </button>
        </div>
        <p className="text-sm text-muted">{guide.summary}</p>
        {next && placeOfMission(next) !== place && (
          <button type="button" className="min-h-11 border border-accent px-3 text-left font-display uppercase text-accent" onClick={() => setPlace(placeOfMission(next))}>
            Next on your route: {next.name}
          </button>
        )}

        <div className="sb-ms-facts">
          {guide.facts.map((f) => (
            <div key={f.label} className="border border-line px-2 py-1">
              <span className="block text-[0.65rem] uppercase tracking-widest text-muted">{f.label}</span>
              <span className="font-display text-lg leading-tight">{f.value}</span>
            </div>
          ))}
        </div>
        {place !== "earth" && place !== "deep" && (
          <p className={"text-sm " + (canReach ? "text-primary" : "text-accent")}>
            {canReach ? "Your selected ship can fly this route." : "Your selected ship cannot reach this yet. See the Needs line above."}
          </p>
        )}

        <details open className="border border-line">
          <summary className="min-h-11 cursor-pointer px-3 py-2 font-display text-xl uppercase tracking-wide">Guide</summary>
          <div className="space-y-3 px-3 pb-3">
            {guide.sections.map((sec) => (
              <section key={sec.title}>
                <h3 className="font-display text-sm uppercase tracking-widest text-accent">{sec.title}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                  {sec.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </details>

        <section className="space-y-2">
          <h3 className="font-display text-2xl uppercase">Campaign</h3>
          {missions.length === 0 && <p className="text-sm text-muted">No campaign missions here.</p>}
          {missions.map((m) => (
            <MissionRow key={m.id} m={m} snap={snap} act={act} />
          ))}
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-2xl uppercase">Contracts</h3>
            <span className="text-xs text-muted">XP {snap.contracts.xp} · one active at a time</span>
          </div>
          {contracts.length === 0 && <p className="text-sm text-muted">No contracts for {guide.name} yet.</p>}
          {contracts.map((c) => (
            <Card key={c.id} c={c} act={act} />
          ))}
        </section>
      </aside>

      <div className="sb-ms-view">
        <div className="sb-ms-strip pointer-events-auto" role="tablist" aria-label="Planets">
          {PLACE_ORDER.map((id) => {
            const ms = MISSIONS.filter((m) => placeOfMission(m) === id);
            const done = ms.filter((m) => snap.done.includes(m.id)).length;
            const on = id === place;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                className={"shrink-0 border px-3 py-2 text-left " + (on ? "border-accent bg-bg/90" : "border-line bg-bg/70 hover:border-primary")}
                onClick={() => setPlace(id)}
              >
                <span className="block font-display text-lg uppercase leading-none">{placeName(id)}</span>
                <span className="block text-xs text-muted">{PLACE_TAG[id]}</span>
                <span className={"block font-display text-sm " + (done === ms.length && ms.length > 0 ? "text-primary" : "text-fg")}>
                  {done}/{ms.length} done
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
