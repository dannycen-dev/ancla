import type { ExerciseMedia } from '../types'

type Props = {
  id: string
  name: string
  reps: string
  note?: string
  done: boolean
  expanded: boolean
  media: ExerciseMedia | null
  onToggleDone: () => void
  onToggleExpand: () => void
}

function CheckIcon({ on }: { on: boolean }) {
  return on ? (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 7.2 5.4 10l6-6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : null
}

export function ExerciseRow({
  name,
  reps,
  note,
  done,
  expanded,
  media,
  onToggleDone,
  onToggleExpand,
}: Props) {
  return (
    <div className={`ex-card ${done ? 'is-done' : ''} ${expanded ? 'is-open' : ''}`}>
      <div className="ex-main">
        <button type="button" className="ex-check" onClick={onToggleDone} aria-label="Marcar hecho">
          <span className="check-box">
            <CheckIcon on={done} />
          </span>
        </button>

        <button type="button" className="ex-body" onClick={onToggleExpand}>
          {media ? (
            <img className="ex-thumb" src={media.thumb} alt="" width={48} height={48} />
          ) : (
            <span className="ex-thumb placeholder" />
          )}
          <span className="ex-text">
            <p className="check-title">{name}</p>
            <p className="check-sub">
              {reps}
              {note ? ` · ${note}` : ''}
              {media?.approx ? ' · similar' : ''}
            </p>
          </span>
          <span className="ex-chevron" aria-hidden>
            {expanded ? 'v' : '>'}
          </span>
        </button>
      </div>

      {expanded && media && (
        <div className="ex-guide">
          <div className="ex-media">
            <img src={media.gif} alt={media.nameEn} width={180} height={180} />
          </div>
          <div className="ex-meta">
            <p className="eyebrow">
              {media.target} · {media.equipment}
            </p>
            <p className="check-sub" style={{ marginBottom: 8 }}>
              Dataset: {media.nameEn}
              {media.approx ? ' (aproximacion visual)' : ''}
            </p>
            {media.stepsEs?.length ? (
              <ol className="ex-steps">
                {media.stepsEs.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            ) : (
              <p className="check-sub">{media.instructionsEs}</p>
            )}
            <p className="ex-attr">{media.attribution}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={onToggleDone}>
            {done ? 'Desmarcar' : 'Ya lo hice'}
          </button>
        </div>
      )}

      {expanded && !media && (
        <div className="ex-guide">
          <p className="check-sub">Sin animacion mapeada. Sigue series y reps de tu plan.</p>
        </div>
      )}
    </div>
  )
}
