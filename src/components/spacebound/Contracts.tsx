// contracts-v1: HUD panel, contract board and result screen. Plain DOM/CSS, no canvas.
import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { BODIES, formatClock, formatInt } from "@/game/catalog";
import type { Spacebound, Snap } from "@/game/engine";
import type { BoardCard, Difficulty, FailReason, MeterView } from "@/game/contracts/types";

type Act = (fn: (e: Spacebound) => void) => void;

const DIFF_LABEL: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };
const DIFF_TONE: Record<Difficulty, string> = {
  easy: "border-primary text-primary",
  normal: "border-warn text-warn",
  hard: "border-danger text-danger",
};
const FAIL_TEXT: Record<FailReason, string> = {
  time: "Time ran out before the last objective was done.",
  oxygen: "Your suit ran out of oxygen.",
  crash: "The ship hit the ground too hard.",
};

function readCollapsed(): boolean {
  try {
    return localStorage.getItem("sb-contract-collapsed") === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean): void {
  try {
    localStorage.setItem("sb-contract-collapsed", v ? "1" : "0");
  } catch {
    /* private mode / blocked storage: the panel just forgets */
  }
}

function Meter({ label, m }: { label: string; m: MeterView }) {
  const pct = Math.max(0, Math.min(100, (m.left / Math.max(1, m.limit)) * 100));
  const tone = m.urgency.level === "danger" ? "bg-danger text-danger" : m.urgency.level === "warn" ? "bg-warn text-warn" : "bg-primary text-primary";
  return (
    <div className={m.urgency.pulse ? "sb-pulse" : ""}>
      <div className="flex items-center justify-between text-[0.7rem] leading-none text-muted">
        <span>{label}</span>
        <span className={"font-display text-sm leading-none " + tone.split(" ")[1]}>{formatClock(m.left)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-line">
        <div className={"h-full " + tone.split(" ")[0]} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Small, collapsible panel under the objective box. Collapsed = one line (title + the tightest timer). */
export function ContractHud({ snap }: { snap: Snap }) {
  const a = snap.contracts.active;
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  if (!a) return null;
  const tight = [a.time, a.oxygen].filter((m): m is MeterView => !!m).sort((x, y) => x.left - y.left)[0];
  const toggle = () => {
    setCollapsed(!collapsed);
    writeCollapsed(!collapsed);
  };
  return (
    <div className="pointer-events-auto min-w-[14rem] border border-line bg-bg/80 backdrop-blur-md sb-contract">
      <button type="button" onClick={toggle} className="flex min-h-9 w-full items-center justify-between gap-2 px-3 py-1 text-left" aria-expanded={!collapsed}>
        <span className="min-w-0">
          <span className="block font-display text-[0.65rem] leading-none tracking-widest text-accent">CONTRACT</span>
          <span className="block truncate font-display text-lg uppercase leading-tight">{a.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {collapsed && tight && (
            <span
              className={
                "font-display text-lg " +
                (tight.urgency.level === "danger" ? "text-danger" : tight.urgency.level === "warn" ? "text-warn" : "text-primary") +
                (tight.urgency.pulse ? " sb-pulse" : "")
              }
            >
              {formatClock(tight.left)}
            </span>
          )}
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-2 px-3 pb-2">
          {a.time && <Meter label="TIME" m={a.time} />}
          {a.oxygen && <Meter label="EVA OXYGEN" m={a.oxygen} />}
          <ul className="space-y-1">
            {a.objectives.map((o) => (
              <li key={o.id} className={"flex items-start gap-2 text-xs leading-snug " + (o.done ? "text-muted line-through" : o.current ? "text-fg" : "text-muted")}>
                <span className={"mt-0.5 flex size-3.5 shrink-0 items-center justify-center border " + (o.done ? "border-primary bg-primary text-bg" : o.current ? "border-accent" : "border-line")}>
                  {o.done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span>
                  {o.label}
                  {o.progress && <span className="ml-1 text-primary">{o.progress}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Chip({ children, cls }: { children: React.ReactNode; cls?: string }) {
  return <span className={"inline-block border px-2 py-0.5 font-display text-xs uppercase leading-none tracking-widest " + (cls ?? "border-line text-muted")}>{children}</span>;
}

function Card({ c, act }: { c: BoardCard; act: Act }) {
  const [confirm, setConfirm] = useState(false);
  const active = c.status === "active";
  return (
    <article className={"border p-3 " + (active ? "border-accent" : "border-line")}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-xl uppercase leading-tight">{c.title}</h3>
        <Chip cls={DIFF_TONE[c.difficulty]}>{DIFF_LABEL[c.difficulty]}</Chip>
      </div>
      <p className="mt-1 text-xs text-muted">
        {BODIES[c.planet].name}
        {c.target ? ` · ${c.target}` : ""}
      </p>
      <p className="mt-1 text-sm text-muted">{c.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-display text-lg text-primary">+{formatInt(c.reward.credits)} CR</span>
        {c.reward.xp > 0 && <span className="text-xs text-muted">+{c.reward.xp} XP</span>}
        {c.timeLimit !== null && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <Clock className="size-3.5" /> {formatClock(c.timeLimit)}
          </span>
        )}
        {c.oxygenLimit !== null && <span className="text-xs text-muted">EVA O₂ {formatClock(c.oxygenLimit)}</span>}
        {c.completed && <Chip cls="border-primary text-primary">Completed</Chip>}
      </div>
      <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-muted">
        {c.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {active ? (
        confirm ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="min-h-11 border border-danger px-3 font-display uppercase text-danger" onClick={() => act((e) => e.abandonContract())}>
              Yes, abandon
            </button>
            <button type="button" className="min-h-11 border border-line px-3 font-display uppercase" onClick={() => setConfirm(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="font-display uppercase tracking-widest text-accent">In progress</span>
            <button type="button" className="min-h-11 border border-line px-4 font-display uppercase hover:border-danger" onClick={() => setConfirm(true)}>
              Abandon
            </button>
          </div>
        )
      ) : c.status === "locked" ? (
        <p className="mt-3 border border-line px-3 py-2 text-xs text-accent">{c.lockedReason}</p>
      ) : (
        <button type="button" className="mt-3 min-h-11 w-full border border-accent bg-accent px-4 font-display text-lg uppercase tracking-wide text-bg" onClick={() => act((e) => e.acceptContract(c.id))}>
          Accept contract
        </button>
      )}
    </article>
  );
}

export function ContractBoard({ snap, act }: { snap: Snap; act: Act }) {
  const board = snap.contracts.board;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Three contracts at a time. One active at a time. New ones arrive when you finish a job. XP {snap.contracts.xp}.
      </p>
      <div className="sb-grid-2 grid gap-3">
        {board.map((c) => (
          <Card key={c.id} c={c} act={act} />
        ))}
      </div>
      {!snap.contracts.active && (
        <button type="button" className="min-h-11 w-full border border-line px-3 font-display text-lg uppercase tracking-wide hover:border-primary" onClick={() => act((e) => e.refreshContracts())}>
          Request new contracts
        </button>
      )}
    </div>
  );
}

/** Full-screen success / failure card. Shown after the landing report modal (if any) is dismissed. */
export function ContractResultView({ snap, act }: { snap: Snap; act: Act }) {
  const r = snap.contracts.result;
  if (!r || snap.modal) return null;
  const ok = r.kind === "success";
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-bg/75 p-4">
      <div className="w-full max-w-md border border-line bg-surface p-6 sb-modal">
        <p className={"font-display tracking-widest " + (ok ? "text-primary" : "text-danger")}>{ok ? "CONTRACT COMPLETE" : "CONTRACT FAILED"}</p>
        <h2 className="mt-2 font-display text-4xl uppercase">{r.title}</h2>
        {ok && r.reward ? (
          <>
            <p className="mt-3 font-display text-2xl text-primary">+{formatInt(r.reward.credits)} CR</p>
            {r.reward.xp > 0 && <p className="text-sm text-muted">+{r.reward.xp} XP</p>}
            <p className="mt-2 text-sm text-muted">Time on contract {formatClock(r.elapsed)}.</p>
            {r.unlocked.length > 0 && <p className="mt-2 text-sm text-accent">New contract unlocked: {r.unlocked.join(", ")}.</p>}
          </>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted">{r.reason ? FAIL_TEXT[r.reason] : "The contract ended."}</p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {ok ? (
            <>
              <button type="button" className="min-h-11 border border-accent bg-accent px-3 font-display text-lg uppercase text-bg" onClick={() => act((e) => e.contractResultAction("next"))}>
                Next mission
              </button>
              <button type="button" className="min-h-11 border border-line px-3 font-display text-lg uppercase" onClick={() => act((e) => e.contractResultAction("back"))}>
                Back to base
              </button>
            </>
          ) : (
            <>
              <button type="button" className="min-h-11 border border-accent bg-accent px-3 font-display text-lg uppercase text-bg" onClick={() => act((e) => e.contractResultAction("retry"))}>
                Retry
              </button>
              <button type="button" className="min-h-11 border border-line px-3 font-display text-lg uppercase" onClick={() => act((e) => e.contractResultAction("back"))}>
                Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
