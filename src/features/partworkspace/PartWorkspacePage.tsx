import { useMemo, useState, useEffect, useRef } from 'react'
import { PageHeader, Card, Button, getFieldRenderer, SourceBadge, StatusPill } from '../../components'
import type { StatusValue } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import {
  evaluateConditionalRules,
  evaluateCalculatedFields,
  resolveTrackedDates
} from '../../engine'
import { makeEntryId } from '../../domain'
import type { PartRecord, TemplateRow, ActivityDefinition, ActivityEntry } from '../../domain'
import { partInScope, canPersonaEdit, fmtOffsetRange, DEMO_TODAY } from '../scope'
import type { SourceType } from '../../components'
import { Link } from 'react-router-dom'
import { vendorInsights, predictRisk } from '../lessons/insights'
import { getFilteredData } from '../../engine'
import { EMPTY_FILTERS } from '../dashboard/drill'

const inputCls =
  'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px] text-[#344054]'

/** One activity section for the selected part: its template row, definition and the primary part's entry. */
interface ActivitySection {
  row: TemplateRow
  activity: ActivityDefinition
  entry: ActivityEntry | undefined
}

function stateToStatus(state: string | undefined): StatusValue {
  switch (state) {
    case 'Approved': return 'Approved'
    case 'Submitted': return 'Submitted'
    case 'Sent back': return 'SentBack'
    case 'Draft': return 'Draft'
    default: return 'NotStarted'
  }
}

export function PartWorkspacePage() {
  const {
    parts: allParts,
    templateRows,
    activities,
    models: modelRecords,
    entries,
    updateEntryValues,
    transitionEntryState
  } = useQAStore()
  const { currentPersona } = usePersonaStore()

  const isPic = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'

  // Parts the persona may see (PIC locked to its section; drop superseded).
  const scopeParts = useMemo(
    () => allParts.filter((p) => partInScope(p, currentPersona) && !p.supersededBy),
    [allParts, currentPersona]
  )

  // ── Filters to pick the primary part ──────────────────────────────────────
  const [modelFilter, setModelFilter] = useState('All')
  const [vendorFilter, setVendorFilter] = useState('All')
  const [partNo, setPartNo] = useState<string>('')

  const models = useMemo(() => Array.from(new Set(scopeParts.map((p) => p.model).filter(Boolean))).sort(), [scopeParts])
  const vendors = useMemo(() => Array.from(new Set(scopeParts.map((p) => p.vendorName).filter(Boolean))).sort(), [scopeParts])

  const candidateParts = useMemo(
    () =>
      scopeParts.filter(
        (p) =>
          (modelFilter === 'All' || p.model === modelFilter) &&
          (vendorFilter === 'All' || p.vendorName === vendorFilter)
      ),
    [scopeParts, modelFilter, vendorFilter]
  )

  // Default the selected part to the first candidate when filters change and current selection falls out of range.
  useEffect(() => {
    if (!candidateParts.some((p) => p.partNo === partNo)) {
      setPartNo(candidateParts[0]?.partNo ?? '')
    }
  }, [candidateParts, partNo])

  const part = useMemo(() => scopeParts.find((p) => p.partNo === partNo), [scopeParts, partNo])

  // ── Same-vendor multi-select: fill once, apply to all selected parts ───────
  const [applyToIds, setApplyToIds] = useState<Set<string>>(new Set())
  // Other parts from the SAME vendor + model + section as the primary part (eligible for simultaneous fill).
  const sameVendorParts = useMemo(() => {
    if (!part) return []
    return scopeParts.filter(
      (p) =>
        p.partNo !== part.partNo &&
        p.vendorName === part.vendorName &&
        p.section === part.section &&
        p.type === part.type
    )
  }, [scopeParts, part])

  // Reset the multi-select when the primary part changes.
  useEffect(() => {
    setApplyToIds(new Set())
  }, [partNo])

  // Every part a fill should be written to: primary + any ticked same-vendor parts.
  const targetPartNos = useMemo(() => [partNo, ...sameVendorParts.filter((p) => applyToIds.has(p.partNo)).map((p) => p.partNo)].filter(Boolean), [partNo, sameVendorParts, applyToIds])

  // ── Resolve all activities applicable to the selected part ─────────────────
  const sections = useMemo<ActivitySection[]>(() => {
    if (!part) return []
    const out: ActivitySection[] = []
    for (const row of templateRows) {
      if (row.section !== part.section) continue
      const activity = activities.find((a) => a.id === row.activityId && a.published !== false)
      if (!activity) continue
      if (activity.scope === 'NewPart' && part.type !== 'NewPart') continue
      if (activity.scope === 'ECN' && part.type !== 'ECN') continue
      const entry = entries.find((e) => e.id === makeEntryId(row.id, part.partNo))
      out.push({ row, activity, entry })
    }
    // Order by milestone then activity id for a stable PP → MPP → Pilot flow.
    const order = ['PP', 'MPP', 'Pilot', 'SOP']
    return out.sort(
      (a, b) =>
        (order.indexOf(a.row.milestoneId) + 1 || 99) - (order.indexOf(b.row.milestoneId) + 1 || 99) ||
        a.activity.id.localeCompare(b.activity.id, undefined, { numeric: true })
    )
  }, [part, templateRows, activities, entries])

  const model = useMemo(() => modelRecords.find((m) => m.name === part?.model), [modelRecords, part])

  // Vendor track-record insights for the contextual callout (shares the Lessons Learnt engine).
  const vendorCallout = useMemo(
    () => (part ? vendorInsights({ entries, parts: allParts, activities, templateRows }, part.vendorName) : []),
    [part, entries, allParts, activities, templateRows]
  )

  // Rule-based forecast for THIS part's open activities (shown in the callout).
  const partPredictions = useMemo(() => {
    if (!part) return []
    const insts = getFilteredData(entries, activities, allParts, templateRows, modelRecords, { ...EMPTY_FILTERS }, 'overview', DEMO_TODAY)
    const rygList = insts.map((i) => ({ partNo: i.part.partNo, activityId: i.activity.id, templateRowId: i.row.id, ryg: String(i.ryg) }))
    return predictRisk({ entries, parts: allParts, activities, templateRows }, rygList).filter((p) => p.partNo === part.partNo)
  }, [part, entries, allParts, activities, templateRows, modelRecords])

  // ── Per-activity local draft values (keyed by template row id) ─────────────
  const [drafts, setDrafts] = useState<Record<string, Record<string, any>>>({})

  // Reset drafts whenever the primary part changes so we start from stored values.
  useEffect(() => {
    const next: Record<string, Record<string, any>> = {}
    for (const s of sections) next[s.row.id] = { ...(s.entry?.values ?? {}) }
    setDrafts(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partNo])

  const [toast, setToast] = useState<string | null>(null)

  // Compact same-vendor dropdown: open state + click-outside close.
  const [applyMenuOpen, setApplyMenuOpen] = useState(false)
  const applyMenuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!applyMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (applyMenuRef.current && !applyMenuRef.current.contains(e.target as Node)) setApplyMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [applyMenuOpen])
  // Close the menu when the primary part changes.
  useEffect(() => { setApplyMenuOpen(false) }, [partNo])

  // An activity tab turns green when it's complete: either already Approved, or every mandatory
  // PIC-editable visible field has a value in the current draft. Recomputes live as the PIC types.
  const completeByRow = useMemo<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {}
    for (const s of sections) {
      if (s.entry?.notApplicable) { out[s.row.id] = false; continue }
      if ((s.entry?.validationState ?? 'Draft') === 'Approved') { out[s.row.id] = true; continue }
      const values = drafts[s.row.id] ?? {}
      const cond = evaluateConditionalRules(s.activity.fields, values)
      const required = s.activity.fields.filter(
        (f) => cond[f.key]?.visible !== false && cond[f.key]?.mandatory && canPersonaEdit(f, currentPersona, s.entry)
      )
      // A PIC-fillable activity with no mandatory fields counts complete once it has been submitted.
      if (required.length === 0) {
        out[s.row.id] = (s.entry?.validationState ?? 'Draft') === 'Submitted'
        continue
      }
      out[s.row.id] = required.every((f) => {
        const v = values[f.key]
        return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
      })
    }
    return out
  }, [sections, drafts, currentPersona])

  const completedCount = useMemo(
    () => sections.reduce((n, s) => n + (completeByRow[s.row.id] ? 1 : 0), 0),
    [sections, completeByRow]
  )

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollBodyRef = useRef<HTMLDivElement | null>(null)
  const tabBarRef = useRef<HTMLDivElement | null>(null)
  const [activeRow, setActiveRow] = useState<string | null>(null)

  const jumpTo = (rowId: string) => {
    sectionRefs.current[rowId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveRow(rowId)
  }

  // Scroll-spy: highlight the activity tab for whichever section is currently at the top of the scroll area.
  useEffect(() => {
    const root = scrollBodyRef.current
    if (!root || sections.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        // Pick the top-most section intersecting the upper part of the viewport.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) {
          const id = (visible[0].target as HTMLElement).dataset.rowid
          if (id) setActiveRow(id)
        }
      },
      { root, rootMargin: '0px 0px -70% 0px', threshold: 0 }
    )
    for (const s of sections) {
      const el = sectionRefs.current[s.row.id]
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [sections, partNo])

  // Keep the active tab scrolled into view in the (horizontal) tab bar.
  useEffect(() => {
    if (!activeRow || !tabBarRef.current) return
    const btn = tabBarRef.current.querySelector<HTMLElement>(`[data-tab="${activeRow}"]`)
    btn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeRow])

  function setDraftValue(rowId: string, key: string, value: any) {
    setDrafts((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [key]: value } }))
  }

  function saveSection(s: ActivitySection, submit: boolean) {
    const values = drafts[s.row.id] ?? {}
    for (const pno of targetPartNos) {
      updateEntryValues(s.row.id, pno, values, currentPersona)
      if (submit) {
        transitionEntryState(makeEntryId(s.row.id, pno), 'Submit', undefined, currentPersona)
      }
    }
  }

  // Save every activity that the PIC can still enter (Draft / Sent back, not Not-applicable), across all target parts.
  function saveAll() {
    let saved = 0
    for (const s of sections) {
      const state = s.entry?.validationState ?? 'Draft'
      if (s.entry?.notApplicable) continue
      if (state !== 'Draft' && state !== 'Sent back') continue
      const values = drafts[s.row.id] ?? {}
      if (Object.keys(values).length === 0) continue
      for (const pno of targetPartNos) updateEntryValues(s.row.id, pno, values, currentPersona)
      saved += 1
    }
    const parts = targetPartNos.length
    setToast(
      saved === 0
        ? 'Nothing to save.'
        : `Saved ${saved} ${saved === 1 ? 'activity' : 'activities'}${parts > 1 ? ` across ${parts} parts` : ''}.`
    )
    setTimeout(() => setToast(null), 3000)
  }

  if (!isPic) {
    return (
      <div>
        <PageHeader title="Part Workspace" section="Workspace" description="Fill all activities of a part on one screen." />
        <Card>
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">
            This screen is for the PIC role. Switch to PIC to fill activity data.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Part Workspace"
        section="Workspace"
        description="Pick a part and fill every activity on one screen. Group parts from the same vendor to fill them all at once."
      />

      {/* ── Filter / part picker bar (fixed) ─────────────────────────────── */}
      <section className="epmp-card mb-4 flex-none px-4 py-3.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Model</span>
            <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} className={inputCls}>
              <option value="All">All models</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Vendor</span>
            <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className={inputCls}>
              <option value="All">All vendors</option>
              {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Part</span>
            <select value={partNo} onChange={(e) => setPartNo(e.target.value)} className={inputCls}>
              {candidateParts.length === 0 && <option value="">No parts match</option>}
              {candidateParts.map((p) => (
                <option key={p.partNo} value={p.partNo}>{p.partNo} — {p.partName}</option>
              ))}
            </select>
          </label>
        </div>

        {part && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--color-border)] pt-3 text-[12px] text-[#344054]">
            <span><span className="text-[var(--color-muted)]">Part:</span> <strong>{part.partNo}</strong> — {part.partName}</span>
            <span><span className="text-[var(--color-muted)]">Model:</span> {part.model}</span>
            <span><span className="text-[var(--color-muted)]">Vendor:</span> {part.vendorName} ({part.vendorCode})</span>
            <span><span className="text-[var(--color-muted)]">Section:</span> {part.section}</span>
            <span><span className="text-[var(--color-muted)]">Type:</span> {part.type}</span>
          </div>
        )}

        {/* Same-vendor multi-select, as a compact dropdown so it doesn't eat the screen. */}
        {part && sameVendorParts.length > 0 && (
          <div className="relative mt-3 inline-block" ref={applyMenuRef}>
            <button
              onClick={() => setApplyMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-[11px] font-medium text-[#344054] hover:border-[#bfdbfe]"
            >
              <span>
                Also fill other {part.vendorName} parts
                {applyToIds.size > 0 && <span className="ml-1 text-primary">· {applyToIds.size} selected</span>}
              </span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M2.5 3.8 5 6.2l2.5-2.4" strokeLinecap="round" />
              </svg>
            </button>
            {applyMenuOpen && (
              <div className="absolute left-0 z-20 mt-1 w-72 max-w-[90vw] rounded-lg border border-[var(--color-border)] bg-white p-2 shadow-lg">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    Fill the same data into
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => setApplyToIds(new Set(sameVendorParts.map((p) => p.partNo)))} className="text-[10px] font-medium text-[var(--color-accent)] hover:underline">All</button>
                    <button onClick={() => setApplyToIds(new Set())} className="text-[10px] font-medium text-[var(--color-muted)] hover:underline">Clear</button>
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {sameVendorParts.map((p) => {
                    const on = applyToIds.has(p.partNo)
                    return (
                      <label key={p.partNo} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1.5 hover:bg-[var(--color-surface)]">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setApplyToIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(p.partNo)) next.delete(p.partNo)
                              else next.add(p.partNo)
                              return next
                            })
                          }
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block text-[12px] font-medium text-[#101828]">{p.partNo}</span>
                          <span className="block truncate text-[11px] text-[var(--color-muted)]">{p.partName}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            {targetPartNos.length > 1 && (
              <span className="ml-3 text-[11px] text-[var(--color-accent)]">
                Saves write to {targetPartNos.length} parts at once.
              </span>
            )}
          </div>
        )}

        {/* Contextual "lessons learnt" callout + rule-based forecast for this part's vendor. */}
        {part && (vendorCallout.length > 0 || partPredictions.length > 0) && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="mb-1 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2"><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" /><path d="M9 21h6" /></svg>
              <span className="text-[11px] font-semibold text-[#92400e]">Lessons learnt · {part.vendorName}</span>
              <Link to="/lessons" className="ml-auto text-[10px] font-medium text-[var(--color-accent)] hover:underline">View all →</Link>
            </div>
            {partPredictions.length > 0 && (
              <ul className="mb-1 space-y-0.5">
                {partPredictions.slice(0, 3).map((p) => (
                  <li key={p.activityId} className="text-[11px] font-medium text-[#92400e]">
                    ⚠ Forecast · {p.activityName.split(' ').slice(0, 2).join(' ')}: {p.outcome} <span className="font-normal text-[var(--color-muted)]">({p.reasons[0]} · {p.confidence} confidence)</span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="space-y-0.5">
              {vendorCallout.slice(0, 2).map((ins) => (
                <li key={ins.id} className="text-[11px] text-[#344054]">• {ins.detail}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {!part ? (
        <Card>
          <p className="py-10 text-center text-sm text-[var(--color-muted)]">Select a part to begin.</p>
        </Card>
      ) : sections.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-[var(--color-muted)]">No activities apply to this part.</p>
        </Card>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* ── Activity jump tabs + progress scale + Save all (fixed) ─── */}
          <div className="epmp-card mb-4 flex-none px-4 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              {/* Completion scale: how many activities are complete out of the total */}
              <div className="flex min-w-0 items-center gap-3">
                <span className="whitespace-nowrap text-[12px] font-semibold text-[#101828]">
                  <span className="text-emerald-700">{completedCount}</span>
                  <span className="text-[var(--color-muted)]"> of {sections.length} activities complete</span>
                </span>
                <div className="h-2 w-40 max-w-[40vw] overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${sections.length ? Math.round((completedCount / sections.length) * 100) : 0}%` }}
                  />
                </div>
                <span className="whitespace-nowrap text-[11px] font-medium text-[var(--color-muted)]">
                  {sections.length ? Math.round((completedCount / sections.length) * 100) : 0}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                {toast && <span className="text-[11px] font-medium text-emerald-700">{toast}</span>}
                <Button variant="primary" size="sm" onClick={saveAll}>
                  Save all{targetPartNos.length > 1 ? ` (${targetPartNos.length} parts)` : ''}
                </Button>
              </div>
            </div>
            {/* Horizontal scroller. Tabs show the full activity name; they size to content with a
                min-width so roughly 4 are visible on a phone and the rest scroll into view. Wider
                screens simply fit more before scrolling. */}
            <div ref={tabBarRef} className="-mx-1 overflow-x-auto pb-1">
              <div className="flex gap-2 px-1">
                {sections.map((s) => {
                  const done = completeByRow[s.row.id]
                  const active = activeRow === s.row.id
                  return (
                    <button
                      key={s.row.id}
                      data-tab={s.row.id}
                      onClick={() => jumpTo(s.row.id)}
                      title={s.activity.name}
                      className={`flex-none min-w-[22vw] max-w-[60vw] sm:min-w-[160px] sm:max-w-none whitespace-nowrap
                        rounded-lg border px-3 py-2 text-left text-[11px] font-medium transition-colors ${
                          done
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'border-[var(--color-border)] bg-white text-[#344054] hover:border-[#bfdbfe] hover:text-primary'
                        } ${active ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                    >
                      <span className="mr-1.5">{done ? '✓' : '○'}</span>
                      {s.activity.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Stacked activity sections (ONLY this area scrolls) ─────── */}
          <div ref={scrollBodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
            {sections.map((s) => (
              <ActivityCard
                key={s.row.id}
                ref={(el) => { sectionRefs.current[s.row.id] = el }}
                rowId={s.row.id}
                section={s}
                part={part}
                model={model}
                draft={drafts[s.row.id] ?? {}}
                currentPersona={currentPersona}
                onFieldChange={(key, val) => setDraftValue(s.row.id, key, val)}
                onSave={() => saveSection(s, false)}
                onSubmit={() => saveSection(s, true)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── One activity section card ────────────────────────────────────────────────
import { forwardRef } from 'react'
import type { ModelRecord } from '../../domain'

interface ActivityCardProps {
  rowId: string
  section: ActivitySection
  part: PartRecord
  model: ModelRecord | undefined
  draft: Record<string, any>
  currentPersona: string
  onFieldChange: (key: string, val: any) => void
  onSave: () => void
  onSubmit: () => void
}

const ActivityCard = forwardRef<HTMLDivElement, ActivityCardProps>(function ActivityCard(
  { rowId, section, part, model, draft, currentPersona, onFieldChange, onSave, onSubmit },
  ref
) {
  const { activity, row, entry } = section
  const state = entry?.validationState ?? 'Draft'
  const isNa = !!entry?.notApplicable
  const canEnter = (state === 'Draft' || state === 'Sent back') && !isNa

  // Merge stored + draft so calculated/conditional rules see the latest typed values.
  const values = draft
  const milestoneMrd = model?.mrds[row.milestoneId]
  const conditional = evaluateConditionalRules(activity.fields, values)
  const calculated = evaluateCalculatedFields(activity, values, part, milestoneMrd)
  const merged = { ...values, ...calculated }
  const visibleFields = activity.fields.filter((f) => conditional[f.key]?.visible !== false)

  const dates = model ? resolveTrackedDates(row, model, entry) : undefined
  const dateLabel =
    dates && dates.status === 'resolved'
      ? `${dates.start} → ${dates.end}`
      : dates?.status === 'awaitingMrd'
      ? 'Awaiting MRD'
      : fmtOffsetRange(row)

  return (
    <div ref={ref} data-rowid={rowId} className="epmp-card scroll-mt-4 p-0">
      {/* Section header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3">
        <div>
          <h3 className="m-0 text-[15px] font-semibold text-[#101828]">{activity.name}</h3>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
            {row.milestoneId} · {dateLabel}
          </p>
        </div>
        <StatusPill status={stateToStatus(state)} />
      </div>

      {/* Fields */}
      <div className="px-5 py-4">
        {isNa ? (
          <p className="py-4 text-center text-[12px] text-[var(--color-muted)]">
            Marked Not applicable{entry?.notApplicable?.reason ? ` — ${entry.notApplicable.reason}` : ''}.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
            {visibleFields.map((field) => {
              const isEditable = canEnter && canPersonaEdit(field, currentPersona, entry)
              const renderer = getFieldRenderer(field.type)
              const value = merged[field.key]
              const mandatory = conditional[field.key]?.mandatory
              return (
                <div key={field.key} className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-[#344054]">
                      {field.label}
                      {mandatory && <span className="text-red-500"> *</span>}
                    </span>
                    {field.source && <SourceBadge source={field.source as SourceType} />}
                  </div>
                  {field.type === 'table'
                    ? renderer.editor({ field, value, onChange: (v) => onFieldChange(field.key, v), disabled: !isEditable, currentPersona })
                    : isEditable
                    ? renderer.editor({ field, value, onChange: (v) => onFieldChange(field.key, v), currentPersona })
                    : renderer.preview({ field, value, currentPersona })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Section actions */}
      {!isNa && canEnter && (
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <Button variant="secondary" size="sm" onClick={onSave}>Save draft</Button>
          <Button variant="primary" size="sm" onClick={onSubmit}>Save & submit</Button>
        </div>
      )}
    </div>
  )
})
