import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { FlowStep } from "@snippo/shared";
import { formatBooking } from "@snippo/shared/format";
import { validateAnswer } from "@snippo/shared/rules";
import type { WidgetConfig } from "@snippo/shared/widget-api";
import { ApiError, type Api } from "./api";

interface Props {
  api: Api;
  config: WidgetConfig;
  onClose: () => void;
  onSubmitted: (id: string) => void;
}

type Phase = "steps" | "review" | "sending" | "done";

/** Bookable times per day for a party size; "error" = not available, fall back to the plain inputs. */
type Availability = { partySize: number; days: Record<string, string[]> } | "error" | null;

function localDate(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(date: string): string {
  if (date === localDate()) return "Oggi";
  if (date === localDate(1)) return "Domani";
  return formatBooking(date);
}

export function Chat({ api, config, onClose, onSubmitted }: Props) {
  const steps = config.flow.steps;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("steps");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const bottom = useRef<HTMLDivElement>(null);

  const dateStep = steps.find((s) => s.type === "date");
  const timeStep = steps.find((s) => s.type === "time");
  const partySize = Number(answers.party_size) || 1;
  const current = phase === "steps" ? steps[index] : undefined;

  // "message" steps need no answer: show them and move on.
  useEffect(() => {
    if (phase === "steps" && current?.type === "message") next(index, answers);
  }, [index, phase]);

  // Availability is loaded when the date is asked, for the party size given so far.
  useEffect(() => {
    if (!dateStep || !timeStep || current?.type !== "date") return;
    if (availability === "error" || availability?.partySize === partySize) return;
    api.getAvailability(partySize).then(
      (res) => setAvailability({ partySize, days: res.days }),
      () => setAvailability("error"),
    );
  }, [current, partySize, availability]);

  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [index, phase, error, availability]);

  /** Moves to the next step still without an answer, or to the review. */
  function next(from: number, given: Record<string, string>) {
    const following = steps.findIndex((s, i) => i > from && s.type !== "message" && !(s.key in given));
    if (following === -1) setPhase("review");
    else setIndex(following);
  }

  /** Goes back to a step, forgetting its answer (and the time, when the date changes). */
  function reopen(step: FlowStep) {
    const remaining = { ...answers };
    delete remaining[step.key];
    if (step === dateStep && timeStep) delete remaining[timeStep.key];
    setAnswers(remaining);
    setIndex(steps.indexOf(step));
    setPhase("steps");
  }

  function answer(step: FlowStep, value: string) {
    const problem = validateAnswer(step, value);
    if (problem) return setError(problem);
    setError(null);
    const given = { ...answers, [step.key]: value.trim() };
    setAnswers(given);
    next(index, given);
  }

  async function send() {
    setPhase("sending");
    setError(null);
    try {
      const { id } = await api.submit(
        { flowVersionId: config.flowVersionId, answers, consent: true, sourceUrl: location.href, locale: navigator.language },
        idempotencyKey.current,
      );
      setPhase("done");
      onSubmitted(id);
    } catch (e) {
      const fieldErrors = e instanceof ApiError ? e.fieldErrors : {};
      const [key, message] = Object.entries(fieldErrors)[0] ?? [];
      const failed = steps.find((s) => s.key === key);
      setError(message ?? (e instanceof Error ? e.message : "Invio non riuscito, riprova"));
      if (failed) {
        // e.g. the time was taken in the meantime: refresh availability and ask that step again.
        if (failed === timeStep) setAvailability(null);
        reopen(failed === timeStep && dateStep ? dateStep : failed);
      } else {
        setPhase("review");
      }
    }
  }

  const shown = phase === "steps" ? steps.slice(0, index + 1) : steps;
  const days = availability && availability !== "error" ? availability.days : null;

  return (
    <div class="panel" role="dialog" aria-label={config.theme.title}>
      <header>
        <span>{config.theme.title}</span>
        <button class="close" aria-label="Chiudi" onClick={onClose}>×</button>
      </header>
      <div class="messages" aria-live="polite">
        {shown.map((step) => (
          <Fragment key={step.key}>
            <p class="bot">{step.prompt}</p>
            {answers[step.key] && <p class="me">{step.type === "date" ? dayLabel(answers[step.key]!) : answers[step.key]}</p>}
          </Fragment>
        ))}
        {phase === "review" || phase === "sending" ? (
          <div class="review">
            <label>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.currentTarget.checked)} />
              Acconsento al trattamento dei dati per gestire la richiesta.
            </label>
            <button class="primary" disabled={!consent || phase === "sending"} onClick={send}>
              {phase === "sending" ? "Invio…" : "Invia richiesta"}
            </button>
          </div>
        ) : null}
        {phase === "done" && <p class="bot">{config.flow.successMessage}</p>}
        {error && <p class="error" role="alert">{error}</p>}
        <div ref={bottom} />
      </div>
      {current?.type === "date" && days ? (
        <DayPicker key={current.key} days={days} onPick={(d) => answer(current, d)} />
      ) : current?.type === "date" && availability === null && timeStep ? (
        <p class="hint">Cerco le date disponibili…</p>
      ) : current?.type === "time" && days && dateStep ? (
        <TimePicker
          key={current.key}
          times={days[answers[dateStep.key]!] ?? []}
          onPick={(t) => answer(current, t)}
          onChangeDay={() => reopen(dateStep)}
        />
      ) : (
        current && current.type !== "message" && <StepInput key={current.key} step={current} onAnswer={(v) => answer(current, v)} />
      )}
    </div>
  );
}

function DayPicker({ days, onPick }: { days: Record<string, string[]>; onPick: (date: string) => void }) {
  const [all, setAll] = useState(false);
  const open = Object.keys(days).filter((d) => days[d]!.length > 0);
  if (open.length === 0) return <p class="hint">Nessuna data disponibile nel prossimo mese.</p>;
  const shown = all ? open : open.slice(0, 8);
  return (
    <div class="choices">
      {shown.map((d) => <button key={d} onClick={() => onPick(d)}>{dayLabel(d)}</button>)}
      {!all && open.length > shown.length && <button class="ghost" onClick={() => setAll(true)}>Altre date</button>}
    </div>
  );
}

function TimePicker({ times, onPick, onChangeDay }: { times: string[]; onPick: (time: string) => void; onChangeDay: () => void }) {
  return (
    <div class="choices">
      {times.length === 0 && <span class="hint">Nessun orario libero in questo giorno.</span>}
      {times.map((t) => <button key={t} onClick={() => onPick(t)}>{t}</button>)}
      <button class="ghost" onClick={onChangeDay}>Cambia giorno</button>
    </div>
  );
}

function StepInput({ step, onAnswer }: { step: FlowStep; onAnswer: (value: string) => void }) {
  const [value, setValue] = useState("");
  const skip = !step.required && <button class="ghost" onClick={() => onAnswer("")}>Salta</button>;

  if (step.type === "choice" || step.type === "time") {
    return (
      <div class="choices">
        {step.options.map((o) => <button key={o} onClick={() => onAnswer(o)}>{o}</button>)}
        {skip}
      </div>
    );
  }

  // Preact types <input> per variant and rejects a union of types; every value here is a valid input type.
  const inputType = { date: "date", number: "number", phone: "tel", email: "email", text: "text", message: "text" }[step.type] as "text";
  const min = step.type === "date" ? localDate() : step.type === "number" ? String(step.min) : undefined;
  const max = step.type === "number" ? String(step.max) : undefined;

  return (
    <form class="composer" onSubmit={(e) => { e.preventDefault(); onAnswer(value); }}>
      <input
        type={inputType}
        value={value}
        min={min}
        max={max}
        autoFocus
        aria-label={step.prompt}
        onInput={(e) => setValue(e.currentTarget.value)}
      />
      <button class="primary" type="submit">Invia</button>
      {skip}
    </form>
  );
}
