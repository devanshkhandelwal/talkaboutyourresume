"use client";

export type StepInfo = { id: string; label: string };

/**
 * One block per question. Solid = answered, hatched = you are here, empty = still to
 * come. Answered blocks jump back. Under 560px the labels collapse into one line.
 */
export function Progress({ steps, index, done, onGoto }: { steps: StepInfo[]; index: number; done: Set<string>; onGoto: (i: number) => void }) {
  return (
    <nav className="su-progress" aria-label="Setup progress">
      <ol>
        {steps.map((s, i) => {
          const current = i === index;
          const answered = done.has(s.id) && !current;
          return (
            <li key={s.id}>
              <button
                type="button"
                className="su-seg"
                data-state={current ? "current" : answered ? "done" : "todo"}
                data-clickable={answered}
                disabled={!answered}
                aria-current={current ? "step" : undefined}
                aria-label={answered ? `${s.label}, answered. Go back` : s.label}
                onClick={() => onGoto(i)}
              >
                <span className="su-bar" />
                <span className="su-lbl">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="su-count" aria-live="polite">
        Step {index + 1} of {steps.length}: {steps[index]?.label}
      </p>
    </nav>
  );
}
