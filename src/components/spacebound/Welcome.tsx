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

  const stepNo = step === "hello" ? 1 : step === "age" ? 2 : 3;
  const dots = (
    <div className="flex justify-center gap-2" aria-hidden>
      {[1, 2, 3].map((n) => (
        <span key={n} className={"h-1 w-8 " + (n <= stepNo ? "bg-accent" : "bg-line")} />
      ))}
    </div>
  );

  return (
    <div className="pointer-events-auto flex h-full items-center justify-center bg-bg/55 p-3 sm:p-6">
      <section
        className={
          "sb-fade sb-welcome flex max-h-full w-full flex-col gap-3 border border-line bg-bg/92 p-4 backdrop-blur-md sm:gap-4 sm:p-6 " +
          (step === "terms" ? "max-w-2xl" : "max-w-md text-center")
        }
      >
        {step !== "terms" && (
          <div>
            <p className="font-display text-sm tracking-widest text-primary">NORTHLINE RANGE</p>
            <h1 className="font-display text-5xl uppercase leading-none text-fg sm:text-6xl">Spacebound</h1>
            <p className="font-display text-lg tracking-widest text-accent">Beyond Earth</p>
          </div>
        )}

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
            {dots}
          </>
        )}

        {step === "age" && (
          <>
            <h2 className="font-display text-3xl uppercase">When were you born?</h2>
            <p className="text-sm leading-relaxed text-muted">
              This helps us set things up the right way for you. Only your age group is kept on this device, never your
              birth date.
            </p>
            <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2 text-left">
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
            {dots}
          </>
        )}

        {step === "terms" && (
          <>
            <div className="flex shrink-0 items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl uppercase sm:text-3xl">Terms &amp; Privacy</h2>
              <p className="font-display text-xs tracking-widest text-primary">SPACEBOUND</p>
            </div>
            {child && (
              <p className="shrink-0 text-sm leading-snug text-primary">
                Please ask a parent or guardian to read this with you and agree.
              </p>
            )}
            {/* sirf yehi box scroll hota hai: checkbox aur buttons hamesha screen par rehte hain */}
            <div className="min-h-0 flex-1 overflow-y-auto border border-line bg-surface/60 p-3 text-left text-sm leading-relaxed text-muted">
              {TERMS_SECTIONS.map((sec, i) => (
                <div key={sec.title} className="mb-3 last:mb-0">
                  <p className="font-display text-base uppercase tracking-wide text-fg">
                    {i + 1}. {sec.title}
                  </p>
                  <p>{sec.body}</p>
                </div>
              ))}
              {CONTACT_EMAIL && (
                <p className="mt-3">
                  Questions? <span className="text-fg">{CONTACT_EMAIL}</span>
                </p>
              )}
            </div>
            <label className="flex min-h-10 shrink-0 cursor-pointer items-center gap-3 text-left text-sm text-fg">
              <input type="checkbox" className="sr-only" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span
                aria-hidden
                className={
                  "flex size-6 shrink-0 items-center justify-center border " +
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
            <div className="grid shrink-0 grid-cols-2 gap-2">
              <Btn onClick={exitApp}>Decline</Btn>
              <Btn accent disabled={!agree} onClick={() => act((e) => e.acceptTerms())}>
                Accept <ArrowRight className="size-5" />
              </Btn>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
