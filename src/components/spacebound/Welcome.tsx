import { useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { ArrowRight, Check } from "lucide-react";
import type { Snap, Spacebound } from "@/game/engine";
import { CONTACT_EMAIL, TERMS_SECTIONS, ageGroupFromBirth } from "@/game/terms";

// welcome-gate-v1: Welcome -> age (date of birth) -> terms. Menu sirf accept ke baad khulta hai.

type Act = (fn: (e: Spacebound) => void) => void;
type Step = "hello" | "age" | "terms";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Btn({
  children,
  onClick,
  accent,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "flex min-h-11 w-full items-center justify-between gap-3 border px-4 py-2 text-left font-display text-xl uppercase tracking-wide disabled:opacity-40 " +
        (accent ? "border-accent bg-accent text-bg" : "border-line bg-surface text-fg hover:border-primary")
      }
    >
      {children}
    </button>
  );
}

function exitApp() {
  CapApp.exitApp().catch(() => {
    window.close();
  });
}

export function Welcome({ snap, act }: { snap: Snap; act: Act }) {
  // age pehle bata di ho (jaise app beech mein band hui) to seedha terms; age wapas badli nahi ja sakti
  const [step, setStep] = useState<Step>(snap.ageGroup ? "terms" : "hello");
  const [d, setD] = useState("");
  const [m, setM] = useState("");
  const [y, setY] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);

  const nowYear = new Date().getFullYear();
  const years = Array.from({ length: 101 }, (_, i) => nowYear - i);
  const child = snap.ageGroup === "child";

  const submitAge = () => {
    const g = ageGroupFromBirth(Number(y), Number(m), Number(d));
    if (!g) {
      setErr("That date doesn't look right. Please check it.");
      return;
    }
    setErr(null);
    act((e) => e.setAgeGroup(g));
    setStep("terms");
  };

  return (
    <div className="flex h-full items-end sm:items-center">
      <aside className="pointer-events-auto sb-fade flex max-h-full w-full flex-col gap-4 overflow-y-auto bg-bg/90 p-5 backdrop-blur-md sm:max-w-md sm:border-r sm:border-line sm:p-8">
        <div>
          <p className="font-display text-sm tracking-widest text-primary">NORTHLINE RANGE</p>
          <h1 className="font-display text-5xl uppercase leading-none text-fg sm:text-6xl">Spacebound</h1>
          <p className="font-display text-lg tracking-widest text-accent">Beyond Earth</p>
        </div>

        {step === "hello" && (
          <>
            <h2 className="font-display text-3xl uppercase">Welcome aboard, Commander</h2>
            <p className="text-sm leading-relaxed text-muted">
              Your ship is fuelled and the pad is clear. Before launch, we need two quick things: your date of birth and
              your OK on the terms.
            </p>
            <Btn accent onClick={() => setStep("age")}>
              Continue <ArrowRight className="size-5" />
            </Btn>
          </>
        )}

        {step === "age" && (
          <>
            <h2 className="font-display text-3xl uppercase">When were you born?</h2>
            <p className="text-sm leading-relaxed text-muted">
              This helps us set things up the right way for you. Only your age group is kept on this device, never your
              birth date.
            </p>
            <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
              <select aria-label="Day" className="sb-select" value={d} onChange={(e) => setD(e.target.value)}>
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <select aria-label="Month" className="sb-select" value={m} onChange={(e) => setM(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select aria-label="Year" className="sb-select" value={y} onChange={(e) => setY(e.target.value)}>
                <option value="">Year</option>
                {years.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            {err && <p className="text-sm text-accent">{err}</p>}
            <Btn accent disabled={!d || !m || !y} onClick={submitAge}>
              Continue <ArrowRight className="size-5" />
            </Btn>
          </>
        )}

        {step === "terms" && (
          <>
            <h2 className="font-display text-3xl uppercase">Terms &amp; Privacy</h2>
            {child && (
              <p className="text-sm leading-relaxed text-primary">
                Please ask a parent or guardian to read this with you and agree.
              </p>
            )}
            <div className="max-h-[38vh] overflow-y-auto border border-line bg-surface/60 p-3 text-sm leading-relaxed text-muted">
              {TERMS_SECTIONS.map((s) => (
                <div key={s.title} className="mb-3 last:mb-0">
                  <p className="font-display text-base uppercase tracking-wide text-fg">{s.title}</p>
                  <p>{s.body}</p>
                </div>
              ))}
              {CONTACT_EMAIL && (
                <p className="mt-3">
                  Questions? <span className="text-fg">{CONTACT_EMAIL}</span>
                </p>
              )}
            </div>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-fg">
              <input
                type="checkbox"
                className="sr-only"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <span
                aria-hidden
                className={
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center border " +
                  (agree ? "border-accent bg-accent text-bg" : "border-line bg-surface")
                }
              >
                {agree && <Check className="size-4" />}
              </span>
              <span>
                {child
                  ? "A parent or guardian has read and agrees to the Terms & Privacy."
                  : "I have read and agree to the Terms & Privacy."}
              </span>
            </label>
            <Btn accent disabled={!agree} onClick={() => act((e) => e.acceptTerms())}>
              Accept &amp; play <ArrowRight className="size-5" />
            </Btn>
            <Btn onClick={exitApp}>Decline &amp; exit</Btn>
          </>
        )}
      </aside>
    </div>
  );
}
