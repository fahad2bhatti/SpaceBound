// store-v1: Store screen. Teen tabs: Nova packs (asli paise), Deals (asli paise), Ships (Nova se).
// Ship ke liye pehli tap "Confirm" dikhati hai, doosri tap par Nova kharch hota hai (ghalti se kharch na ho).
import { useState } from "react";
import { Gem, RotateCcw, ShoppingBag, X } from "lucide-react";
import { SHIP_LIST, SHIPS, formatInt, isShipUnlocked, km, type ShipId } from "@/game/catalog";
import { PRODUCTS, novaPrice, type Product } from "@/game/store";
import type { Spacebound, Snap } from "@/game/engine";

type Act = (fn: (e: Spacebound) => void) => void;
export type StoreTab = "nova" | "deals" | "ships";

/** Garage se Store kholte waqt kaunsa tab pehle dikhe. */
let startTab: StoreTab = "deals";
export function storeStartTab(t: StoreTab): void {
  startTab = t;
}

function Nova({ n, cls = "" }: { n: number; cls?: string }) {
  return (
    <span className={"inline-flex items-center gap-1 " + cls}>
      <Gem className="size-4 shrink-0" />
      {formatInt(n)}
    </span>
  );
}

function PriceBtn({ label, busy, done, onClick }: { label: string; busy?: boolean; done?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={busy || done}
      onClick={onClick}
      className={
        "sb-store-price min-h-11 shrink-0 border px-3 font-display text-lg uppercase tracking-wide " +
        (done ? "border-line text-muted" : "border-accent bg-accent text-bg disabled:opacity-60")
      }
    >
      {done ? "Owned" : busy ? "..." : label}
    </button>
  );
}

function ProductCard({ p, snap, act }: { p: Product; snap: Snap; act: Act }) {
  const owned = !p.consumable && snap.store.ent.includes(p.id);
  const price = snap.store.prices[p.id] ?? "$" + p.usd.toFixed(2);
  return (
    <div className="sb-store-card flex flex-col gap-2 border border-line bg-surface/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <p className="font-display text-xl uppercase leading-tight text-fg">
          {p.kind === "nova" ? <Nova n={p.nova ?? 0} cls="text-primary" /> : p.name}
        </p>
        {p.tag && <span className="shrink-0 border border-primary px-1.5 font-display text-xs uppercase tracking-widest text-primary">{p.tag}</span>}
      </div>
      <p className="flex-1 text-xs leading-snug text-muted">{p.blurb}</p>
      <PriceBtn label={price} busy={snap.store.busy === p.id} done={owned} onClick={() => act((e) => void e.storeBuy(p.id))} />
    </div>
  );
}

function ShipCard({ id, snap, act, confirm, setConfirm, toNova }: {
  id: ShipId;
  snap: Snap;
  act: Act;
  confirm: ShipId | null;
  setConfirm: (id: ShipId | null) => void;
  toNova: () => void;
}) {
  const s = SHIPS[id];
  const price = novaPrice(id) ?? 0;
  const owned = snap.owned.includes(id);
  const short = snap.store.nova < price;
  const asking = confirm === id;
  return (
    <div className={"sb-store-card flex flex-col gap-1 border bg-surface/80 p-3 " + (s.premium ? "border-accent" : "border-line")}>
      <p className="font-display text-xs uppercase tracking-widest text-primary">{s.premium ? "Exclusive" : "Unlock now"} · {s.category}</p>
      <p className="font-display text-xl uppercase leading-tight text-fg">{s.name}</p>
      <p className="flex-1 text-xs leading-snug text-muted">
        Range {km(s.range)} · Crew {s.crew}
        {!s.premium && " · Skips its mission"}
      </p>
      {owned ? (
        <PriceBtn label="" done onClick={() => undefined} />
      ) : short ? (
        <button type="button" onClick={toNova} className="sb-store-price min-h-11 border border-line px-3 font-display text-lg uppercase text-fg">
          <Nova n={price} /> · Get Nova
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (asking) {
              setConfirm(null);
              act((e) => e.buyShipNova(id));
            } else setConfirm(id);
          }}
          className={
            "sb-store-price min-h-11 border px-3 font-display text-lg uppercase " +
            (asking ? "border-primary bg-primary text-bg" : "border-accent bg-accent text-bg")
          }
        >
          {asking ? (
            <>
              Confirm <Nova n={price} />
            </>
          ) : (
            <Nova n={price} />
          )}
        </button>
      )}
    </div>
  );
}

export function Store({ snap, act }: { snap: Snap; act: Act }) {
  const [tab, setTab] = useState<StoreTab>(startTab);
  const [confirm, setConfirm] = useState<ShipId | null>(null);
  // Ships tab: pehle exclusive, phir woh locked / unowned ships jinka "Unlock now" ho sakta hai
  const ships = SHIP_LIST.filter((s) => s.premium || (novaPrice(s.id) !== null && !snap.owned.includes(s.id) && !isShipUnlocked(snap.done, s))).sort(
    (a, b) => Number(Boolean(b.premium)) - Number(Boolean(a.premium)),
  );
  const tabBtn = (t: StoreTab, label: string) => (
    <button
      key={t}
      type="button"
      onClick={() => {
        setTab(t);
        setConfirm(null);
      }}
      className={
        "min-h-10 flex-1 border font-display text-lg uppercase tracking-wide " +
        (tab === t ? "border-primary bg-primary/15 text-primary" : "border-line text-muted")
      }
    >
      {label}
    </button>
  );
  return (
    <div className="flex h-full justify-end">
      <aside className="sb-store pointer-events-auto flex max-h-full w-full flex-col gap-3 overflow-y-auto border-l border-line bg-bg/92 p-4 backdrop-blur-md sm:p-6">
        <div className="sb-head flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShoppingBag className="size-6 text-accent" />
            <h2 className="font-display text-4xl uppercase">Store</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-display text-xl text-primary">
              <Nova n={snap.store.nova} />
            </span>
            <button type="button" aria-label="Close" className="min-h-11 min-w-11 border border-line px-3" onClick={() => act((e) => e.back())}>
              <X className="size-5" />
            </button>
          </div>
        </div>
        {snap.store.mode === "test" && (
          <p className="border border-accent px-3 py-1.5 text-xs text-accent">TEST MODE: purchases are free and nothing is charged. Testing only.</p>
        )}
        {snap.store.mode === "play" && Object.keys(snap.store.prices).length === 0 && (
          <p className="border border-line px-3 py-1.5 text-xs text-muted">Connecting to Google Play... If prices do not load, check your connection and that the game was installed from Google Play.</p>
        )}
        <div className="flex gap-2">
          {tabBtn("deals", "Deals")}
          {tabBtn("nova", "Nova")}
          {tabBtn("ships", "Ships")}
        </div>
        <div className="sb-store-grid grid gap-2">
          {tab === "nova" && PRODUCTS.filter((p) => p.kind === "nova").map((p) => <ProductCard key={p.id} p={p} snap={snap} act={act} />)}
          {tab === "deals" && PRODUCTS.filter((p) => p.kind === "deal").map((p) => <ProductCard key={p.id} p={p} snap={snap} act={act} />)}
          {tab === "ships" &&
            ships.map((s) => (
              <ShipCard key={s.id} id={s.id} snap={snap} act={act} confirm={confirm} setConfirm={setConfirm} toNova={() => setTab("nova")} />
            ))}
        </div>
        {tab === "ships" && <p className="text-xs text-muted">Ships from the Store stay yours after New Game or Reset progress, and can't be sold.</p>}
        {tab !== "ships" && (
          <p className="text-xs leading-snug text-muted">
            Payments go through Google Play. Nova is saved on this device; one-time deals come back with Restore purchases.
          </p>
        )}
        <button
          type="button"
          disabled={snap.store.busy === "restore"}
          onClick={() => act((e) => void e.restorePurchases())}
          className="flex min-h-10 items-center justify-center gap-2 border border-line text-sm text-muted"
        >
          <RotateCcw className="size-4" /> {snap.store.busy === "restore" ? "Checking..." : "Restore purchases"}
        </button>
      </aside>
    </div>
  );
}
