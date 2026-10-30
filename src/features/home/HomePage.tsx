import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import type { AppOutletContext } from '../AppLayout'
import { Card, PersonaChip, StatusPill, RygDot, Button } from '../../components'
import { usePersonaStore, PERSONAS } from '../../store/personaStore'
import type { PersonaId } from '../../store/personaStore'
import { useQAStore } from '../../store'
import { getFilteredData, completionPct } from '../../engine'
import type { FilteredInstance } from '../../engine'
import type { RygStatus } from '../../components/RygDot'
import type { StatusValue } from '../../components/StatusPill'
import { DEMO_TODAY, partInScope, toRygStatus } from '../scope'
import { hasMyWork } from '../mywork/workQueue'

interface InboxItem {
  /** Template row id: the Workspace route param. */
  rowId: string
  activityName: string
  partNo: string
  partName: string
  entryId: string
  action: string
  state: string
  ryg: RygStatus
  status: StatusValue
}

/** Short description for each persona's primary task in this system */
const PERSONA_DESCRIPTIONS: Record<PersonaId, { role: string; tasks: string; nav: string; navLabel: string }> = {
  Admin:          { role: 'Admin',         tasks: 'Create & publish activity definitions, set fields and approval flows',           nav: '/builder',    navLabel: 'Open Builder' },
  PIC:            { role: 'Person-In-Charge',    tasks: 'Enter PIC fields, validate vendor submissions, approve or send back entries',   nav: '/activities', navLabel: 'View Activities' },
  Vendor:         { role: 'Supplier / Vendor',   tasks: 'Fill in vendor fields for your assigned parts, submit for PIC validation',      nav: '/activities', navLabel: 'My Activities' },
  SIC:            { role: 'Section-In-Charge',   tasks: 'Review submitted entries, override fields, monitor section-level dashboards',   nav: '/dashboards', navLabel: 'Open Dashboards' },
  DPM:            { role: 'Dept. Planning Mgr',  tasks: 'Track activity completion across vendors, escalate overdue items',              nav: '/dashboards', navLabel: 'Open Dashboards' },
  ModelCoordinator: { role: 'Model Coordinator', tasks: 'Enter each model and its milestone MRD dates; every planned date is calculated from them', nav: '/models',   navLabel: 'Open Models & MRDs' },
  SectionAdmin:   { role: 'Department Co-ordinator (NP1)', tasks: 'Choose which activities apply to your section, set start/end as MRD offsets and add dummy part numbers', nav: '/template',   navLabel: 'Open Section Template' },
}

export function HomePage() {
  const { currentPersona, setPersona } = usePersonaStore()
  const { startTour } = useOutletContext<AppOutletContext>()
  const [resetConfirm, setResetConfirm] = useState(false)

  const { activities, entries, templateRows, models, parts, resetDemoData } = useQAStore()
  const today = DEMO_TODAY

  // Every part x template-row instance the current persona may see (PIC/Section Admin: NP1, Vendor: Minda).
  const instances = useMemo<FilteredInstance[]>(
    () =>
      getFilteredData(
        entries,
        activities,
        parts,
        templateRows,
        models,
        { milestone: 'All', section: 'All', model: 'All', vendor: 'All', type: 'All' },
        'overview',
        today
      ).filter((i) => partInScope(i.part, currentPersona)),
    [entries, activities, parts, templateRows, models, currentPersona, today]
  )

  // ── "Waiting for my action" inbox ───────────────────────────────────────
  const inboxItems = useMemo<InboxItem[]>(() => {
    const items: InboxItem[] = []

    for (const inst of instances) {
      const { entry, activity, part } = inst
      if (!entry || inst.notApplicable) continue // a Not-applicable part needs no one's action

      const state = entry.validationState
      const ryg = toRygStatus(inst.ryg)

      let actionLabel = ''
      let statusVal: StatusValue = 'Draft'

      if (state === 'Submitted') {
        if (currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM') {
          const validatorFields = activity.fields.filter((f) => f.validatedBy === currentPersona)
          if (validatorFields.length > 0 || activity.ownerPersona === currentPersona) {
            actionLabel = 'Awaiting your validation'
            statusVal = 'Submitted'
          }
        }
      } else if (state === 'Draft' || state === 'Sent back') {
        if (currentPersona === 'Vendor') {
          if (activity.fields.some((f) => f.enteredBy === 'Vendor')) {
            actionLabel = state === 'Sent back' ? 'Sent back — re-enter required' : 'Entry pending'
            statusVal = state === 'Sent back' ? 'SentBack' : 'Draft'
          }
        }
        if (currentPersona === 'PIC') {
          if (activity.fields.some((f) => f.enteredBy === 'PIC') && state === 'Draft') {
            actionLabel = 'Entry pending'
            statusVal = 'Draft'
          }
        }
      }

      if (actionLabel) {
        items.push({
          rowId: inst.row.id,
          activityName: `${activity.name} · ${inst.row.milestoneId}`,
          partNo: part.partNo,
          partName: part.partName,
          entryId: entry.id,
          action: actionLabel,
          state,
          ryg,
          status: statusVal,
        })
      }
    }

    const order: Record<RygStatus, number> = { red: 0, yellow: 1, green: 2, grey: 3, na: 4 }
    return items.sort((a, b) => order[a.ryg] - order[b.ryg]).slice(0, 10)
  }, [instances, currentPersona])

  // ── Recent activities (one per template row in scope) ────────────────────
  const recentActivities = useMemo(() => {
    const rowIds = Array.from(new Set(instances.map((i) => i.row.id))).slice(0, 4)
    return rowIds.map((rowId) => {
      const rowInstances = instances.filter((i) => i.row.id === rowId)
      const first = rowInstances[0]
      const active = rowInstances.filter((i) => !i.notApplicable)
      const approved = active.filter((i) => i.status === 'Approved').length
      const total = active.length
      const pct = completionPct(rowInstances)
      const ryg: RygStatus = rowInstances.some((i) => i.ryg === 'Red')
        ? 'red'
        : rowInstances.some((i) => i.ryg === 'Yellow')
          ? 'yellow'
          : rowInstances.some((i) => i.ryg === 'Green')
            ? 'green'
            : 'grey'
      return { rowId, name: first.activity.name, milestone: first.row.milestoneId, section: first.row.section, approved, total, pct, ryg }
    })
  }, [instances])

  // ── Milestone overview: RYG counts per milestone ─────────────────────────
  const milestoneOverview = useMemo(() => {
    const byMilestone = new Map<string, { red: number; yellow: number; green: number; grey: number; na: number; rows: Set<string> }>()
    for (const i of instances) {
      const m = byMilestone.get(i.row.milestoneId) ?? { red: 0, yellow: 0, green: 0, grey: 0, na: 0, rows: new Set<string>() }
      if (i.ryg === 'NA') m.na++
      else if (i.ryg === 'Red') m.red++
      else if (i.ryg === 'Yellow') m.yellow++
      else if (i.ryg === 'Green') m.green++
      else m.grey++
      m.rows.add(i.row.id)
      byMilestone.set(i.row.milestoneId, m)
    }
    return Array.from(byMilestone.entries()).map(([milestone, v]) => ({ milestone, ...v, total: v.red + v.yellow + v.green + v.grey + v.na }))
  }, [instances])

  // ── Stats summary ──────────────────────────────────────────────────────────
  const stats = useMemo(
    () => ({
      totalActivities: new Set(instances.map((i) => i.row.id)).size,
      overdue: instances.filter((i) => i.ryg === 'Red').length,
      pendingValidation: instances.filter((i) => i.status === 'Submitted' && !i.notApplicable).length,
      approved: instances.filter((i) => i.status === 'Approved' && !i.notApplicable).length,
    }),
    [instances]
  )

  const personaMeta = PERSONA_DESCRIPTIONS[currentPersona]

  function handleReset() {
    resetDemoData()
    setResetConfirm(false)
  }

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-5">

        {/* ── Hero banner ──────────────────────────────────────────── */}
        <div className="rounded-xl border border-[#93c5fd80] bg-[linear-gradient(120deg,#2266f5_0%,#204cdb_70%,#3c39cb_100%)] px-6 py-5 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="m-0 text-[23px] font-semibold leading-8 tracking-[-0.3px] mb-1">
              Welcome back
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[#dbeafe]">
              <span>Viewing as</span>
              <span className="rounded-full bg-white px-1 py-0.5"><PersonaChip personaId={currentPersona} size="sm" /></span>
              <span>·</span>
              <span className="text-white font-medium">{personaMeta.role}</span>
            </div>
            <p className="mt-1 text-xs text-[#dbeafe] max-w-md">
              {personaMeta.tasks}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={startTour}
              aria-label="Start guided demo tour"
              className="inline-flex items-center gap-1 rounded-[10px] bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-secondary transition-colors focus-visible:ring-2 focus-visible:ring-white focus:outline-none"
            >
              ▶ Demo tour
            </button>
            <Link
              to={personaMeta.nav}
              className="inline-flex items-center gap-1 rounded-[10px] border border-white/40 bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25 transition-colors focus-visible:ring-2 focus-visible:ring-white focus:outline-none"
            >
              {personaMeta.navLabel} →
            </Link>
          </div>
        </div>

        {/* ── Persona entry points ──────────────────────────────────── */}
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
            Switch Persona
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="Persona selector">
            {PERSONAS.map((p) => {
              const desc = PERSONA_DESCRIPTIONS[p.id]
              const isActive = currentPersona === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setPersona(p.id)}
                  aria-pressed={isActive}
                  className={`rounded-xl border text-left p-3 transition-all focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus:outline-none ${
                    isActive
                      ? 'border-[var(--color-accent)] bg-secondary shadow-sm'
                      : 'border-[var(--color-border)] bg-white hover:bg-[var(--color-surface)]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: p.hex }}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-semibold text-[var(--color-text)] truncate">
                      {p.label}
                    </span>
                    {isActive && (
                      <span className="ml-auto text-[var(--color-accent)] text-xs font-bold flex-shrink-0">✓</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)] leading-snug line-clamp-2">
                    {desc.role}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Stats tiles ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Activities', value: stats.totalActivities, color: 'text-[var(--color-accent)]' },
            { label: 'Overdue', value: stats.overdue, color: 'text-[var(--color-ryg-red)]' },
            { label: 'Awaiting Validation', value: stats.pendingValidation, color: 'text-[var(--color-ryg-yellow)]' },
            { label: 'Approved', value: stats.approved, color: 'text-[var(--color-ryg-green)]' },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="epmp-card flex min-h-[112px] flex-col px-5 py-4"
            >
              <p className="text-[11.5px] font-medium text-[var(--color-ink-muted)]">{label}</p>
              <p className={`mt-1.5 text-[30px] font-bold leading-[38px] ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Inbox + Recent ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Inbox */}
          <Card
            title="Waiting for My Action"
            className="lg:col-span-2"
            actions={
              inboxItems.length > 0 ? (
                <span className="text-xs text-[var(--color-muted)]">{inboxItems.length} item{inboxItems.length !== 1 ? 's' : ''}</span>
              ) : undefined
            }
          >
            <div data-tour="inbox-card">
              {inboxItems.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center gap-2">
                  <span className="text-3xl" aria-hidden="true">✓</span>
                  <p className="text-sm font-medium text-[var(--color-text)]">No pending actions</p>
                  <p className="text-xs text-[var(--color-muted)] max-w-xs">
                    There is nothing waiting for <strong>{currentPersona}</strong> right now.
                    Switch persona to see other inboxes.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {inboxItems.map((item) => (
                    <Link
                      key={item.entryId}
                      to={`/activities/${item.rowId}`}
                      className="flex items-center gap-3 py-2.5 hover:bg-[var(--color-surface)] -mx-1 px-1 rounded transition-colors group focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus:outline-none"
                      aria-label={`${item.partName} — ${item.action}`}
                    >
                      <RygDot status={item.ryg} size={10} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text)] truncate group-hover:text-[var(--color-accent)]">
                          {item.partName}
                        </p>
                        <p className="text-xs text-[var(--color-muted)] truncate">{item.activityName}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-[var(--color-muted)] hidden sm:block">{item.action}</span>
                        <StatusPill status={item.status} size="sm" />
                      </div>
                      <span className="text-xs text-[var(--color-accent)] flex-shrink-0" aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              )}
              {inboxItems.length > 0 && (
                <p className="text-xs text-[var(--color-muted)] mt-3">
                  Showing up to 10 items.{' '}
                  {hasMyWork(currentPersona) && (
                    <>
                      <Link to="/mywork" className="text-[var(--color-accent)] hover:underline">Open My Work</Link>
                      {' · '}
                    </>
                  )}
                  <Link to="/activities" className="text-[var(--color-accent)] hover:underline">View all activities →</Link>
                </p>
              )}
            </div>
          </Card>

          {/* Recent Activities */}
          <Card title="Recent Activities">
            {recentActivities.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center gap-2">
                <span className="text-3xl" aria-hidden="true">📋</span>
                <p className="text-sm text-[var(--color-muted)]">No activities assigned to you yet.</p>
                <Link to="/template" className="text-xs text-[var(--color-accent)] hover:underline mt-1">
                  Assign activities in the Section Template →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {recentActivities.map(({ rowId, name, milestone, section, pct, total, approved, ryg }) => (
                  <Link
                    key={rowId}
                    to={`/activities/${rowId}`}
                    className="flex items-center gap-3 py-2.5 hover:bg-[var(--color-surface)] -mx-1 px-1 rounded transition-colors group focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus:outline-none"
                    aria-label={`${name} — ${pct}% approved`}
                  >
                    <RygDot status={ryg} size={10} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate group-hover:text-[var(--color-accent)]">
                        {name}
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {section} · {milestone} · {approved}/{total} approved
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-sm font-semibold text-[var(--color-text)]">{pct}%</div>
                      <div className="w-16 bg-surface rounded-full h-1 mt-0.5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-1 rounded-full bg-ryg-green" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <p className="text-xs text-[var(--color-muted)] mt-3">
              <Link to="/activities" className="text-[var(--color-accent)] hover:underline">View all activities →</Link>
            </p>
          </Card>

          {/* Milestone Overview card */}
          <Card
            title="Milestone Overview"
            actions={
              <Link to="/dashboards" className="text-xs text-[var(--color-accent)] hover:underline">
                Open Dashboards →
              </Link>
            }
          >
            {milestoneOverview.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center gap-2">
                <span className="text-3xl" aria-hidden="true">📊</span>
                <p className="text-sm text-[var(--color-muted)]">No activities to display yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {milestoneOverview.map(({ milestone, red, yellow, green, grey, na, total, rows }) => (
                  <div key={milestone} className="flex items-center gap-3">
                    <span className="w-16 text-xs font-medium text-[var(--color-text)] flex-shrink-0">{milestone}</span>
                    <div className="flex-1 flex h-4 rounded overflow-hidden gap-px bg-surface">
                      {([
                        { n: red, bg: 'bg-[var(--color-ryg-red)]', text: 'text-white', title: 'overdue' },
                        { n: yellow, bg: 'bg-[var(--color-ryg-yellow)]', text: '', title: 'at risk' },
                        { n: green, bg: 'bg-[var(--color-ryg-green)]', text: 'text-white', title: 'on track / done' },
                        { n: grey, bg: 'bg-[var(--color-ryg-grey)]', text: '', title: 'awaiting MRD' },
                        { n: na, bg: 'bg-[#94a3b8]', text: 'text-white', title: 'not applicable' },
                      ] as const).map((seg) =>
                        seg.n > 0 ? (
                          <div
                            key={seg.title}
                            className={`${seg.bg} ${seg.text} flex items-center justify-center`}
                            style={{ width: `${(seg.n / total) * 100}%`, minWidth: '1rem' }}
                            title={`${seg.n} ${seg.title}`}
                          >
                            <span className="text-[9px] font-bold">{seg.n}</span>
                          </div>
                        ) : null
                      )}
                    </div>
                    <span className="w-10 text-right text-xs text-[var(--color-muted)] flex-shrink-0">
                      {rows.size} act.
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── Demo data controls ─────────────────────────────────── */}
        <div className="flex items-center justify-between rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div>
            <p className="text-xs font-medium text-[var(--color-text)]">Demo data controls</p>
            <p className="text-xs text-[var(--color-muted)]">
              All changes are stored in localStorage. Reset restores the original seed data.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!resetConfirm ? (
              <Button variant="secondary" size="sm" onClick={() => setResetConfirm(true)}>
                Reset demo data
              </Button>
            ) : (
              <>
                <span className="text-xs text-[var(--color-muted)]">Are you sure?</span>
                <Button variant="danger" size="sm" onClick={handleReset}>
                  Yes, reset
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setResetConfirm(false)}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>

      </div>
    </>
  )
}
