import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { FlowStep } from "@snippo/shared";
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

export function Chat({ api, config, onClose, onSubmitted }: Props) {
  const steps = config.flow.steps;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("steps");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const bottom = useRef<HTMLDivElement>(null);

  // "message" steps need no answer: show them and move on.
  useEffect(() => {
    const step = steps[index];
    if (phase === "steps" && step?.type === "message") next(index);
  }, [index, phase]);

  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [index, phase, error]);

  function next(from: number) {
    if (from + 1 < steps.length) setIndex(from + 1);
    else setPhase("review");
  }

  function answer(step: FlowStep, value: string) {
    const problem = validateAnswer(step, value);
    if (problem) return setError(problem);
    setError(null);
    setAnswers((a) => ({ ...a, [step.key]: value.trim() }));
    next(index);
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
      setPhase("review");
      const fields = e instanceof ApiError ? Object.values(e.fieldErrors) : [];
      setError(fields[0] ?? (e instanceof Error ? e.message : "Invio non riuscito, riprova"));
    }
  }

  const shown = phase === "steps" ? steps.slice(0, index + 1) : steps;
  const current = phase === "steps" ? steps[index] : undefined;

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
            {answers[step.key] && <p class="me">{answers[step.key]}</p>}
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
      {current && current.type !== "message" && <StepInput key={current.key} step={current} onAnswer={(v) => answer(current, v)} />}
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
  const min = step.type === "date" ? new Date().toISOString().slice(0, 10) : step.type === "number" ? String(step.min) : undefined;
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
