import type { BuilderDraft, TechnicalCategory, MrdSubType, TimelineTemplateEntry, TimelineOffset } from '../../../domain'
import {
  TECHNICAL_CATEGORIES,
  SUBTYPE_LABEL,
  TIMELINE_MILESTONES,
  subTypesFor
} from '../../../domain/timelineCatalog'

interface Props {
  draft: BuilderDraft
  onChange: (updates: Partial<BuilderDraft>) => void
}

export function TimelineStep({ draft, onChange }: Props) {
  const template = draft.timelineTemplate ?? []
  const selected = new Set(template.map((t) => t.category))

  function toggleCategory(cat: TechnicalCategory) {
    if (selected.has(cat)) {
      onChange({ timelineTemplate: template.filter((t) => t.category !== cat) })
    } else {
      onChange({ timelineTemplate: [...template, { category: cat, offsets: [] }] })
    }
  }

  function getOffset(cat: TechnicalCategory, milestoneId: string, subType: MrdSubType): number | undefined {
    const entry = template.find((t) => t.category === cat)
    return entry?.offsets.find((o) => o.milestoneId === milestoneId && o.subType === subType)?.minusDays
  }

  function setOffset(cat: TechnicalCategory, milestoneId: string, subType: MrdSubType, minus: number | undefined) {
    onChange({
      timelineTemplate: template.map((t) => {
        if (t.category !== cat) return t
        const others = t.offsets.filter((o) => !(o.milestoneId === milestoneId && o.subType === subType))
        const next: TimelineOffset[] =
          minus === undefined || Number.isNaN(minus) ? others : [...others, { milestoneId, subType, minusDays: minus }]
        return { ...t, offsets: next } as TimelineTemplateEntry
      })
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="m-0 text-lg font-semibold text-[var(--color-text)]">Timeline template</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Choose the technical categories this activity applies to, then set the applicable “MRD − X” day offsets
          for each milestone sub-type. Kani and Jig apply only to the Weld category. Display/config only for now.
        </p>
      </div>

      {/* Technical category picker */}
      <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Technical categories
        </span>
        <div className="flex flex-wrap gap-2">
          {TECHNICAL_CATEGORIES.map((c) => {
            const on = selected.has(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCategory(c.id)}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  on
                    ? 'border-[#bfdbfe] bg-secondary text-primary'
                    : 'border-[var(--color-border)] bg-white text-[#344054] hover:border-[#bfdbfe]'
                }`}
              >
                {on ? '✓ ' : ''}{c.label}
              </button>
            )
          })}
        </div>
      </div>

      {selected.size === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-center text-xs text-[var(--color-muted)]">
          Select one or more technical categories to set their MRD − X offsets.
        </p>
      ) : (
        template.map((entry) => (
          <div key={entry.category} className="rounded-lg border border-[var(--color-border)] bg-white p-4">
            <h3 className="m-0 mb-3 text-[13px] font-semibold text-[#101828]">
              {TECHNICAL_CATEGORIES.find((c) => c.id === entry.category)?.label} — MRD − X offsets
            </h3>
            <div className="space-y-4">
              {TIMELINE_MILESTONES.map((ms) => {
                const subs = subTypesFor(ms, entry.category)
                if (subs.length === 0) return null
                return (
                  <div key={ms}>
                    <div className="mb-1.5 text-[11px] font-semibold text-primary">{ms}</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {subs.map((st) => {
                        const val = getOffset(entry.category, ms, st)
                        return (
                          <label key={st} className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5">
                            <span className="truncate text-[11px] text-[#344054]" title={SUBTYPE_LABEL[st]}>{SUBTYPE_LABEL[st]}</span>
                            <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-[var(--color-muted)]">
                              MRD −
                              <input
                                type="number"
                                min={0}
                                value={val ?? ''}
                                onChange={(e) =>
                                  setOffset(
                                    entry.category,
                                    ms,
                                    st,
                                    e.target.value === '' ? undefined : Math.max(0, Math.round(e.target.valueAsNumber))
                                  )
                                }
                                placeholder="—"
                                className="h-7 w-14 rounded border border-[var(--color-border)] bg-white px-1.5 text-right text-[11px] text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
                              />
                              d
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
