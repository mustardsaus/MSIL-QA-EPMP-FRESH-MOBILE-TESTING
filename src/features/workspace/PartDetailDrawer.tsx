import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ActivityDefinition, FieldDefinition, ActivityEntry, TemplateRow, PartRecord } from '../../domain'
import { makeEntryId } from '../../domain'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { fetchFromEnovia, fetchFromSap, fetchFromEdoc, fetchFromRegApp } from '../../mock'
import {
  evaluateConditionalRules,
  evaluateCalculatedFields,
  resolveInstanceDates,
  resolveTrackedDates,
  getMilestoneMrd,
  getPicOn,
  getReleaseState,
  latestReturn,
  actionRyg,
} from '../../engine'
import { fmtDate, DEMO_TODAY, canMarkNotApplicable, canReverseNotApplicable, canPersonaEdit, toRygStatus } from '../scope'
import { getFieldRenderer } from '../../components/FieldRenderer'
import { Button, SourceBadge, StatusPill, Modal, Tabs, ApplicabilityDialog, RygDot } from '../../components'
import type { TabItem } from '../../components/Tabs'
import { DeviationPopup } from './DeviationPopup'
import { HistoryTimeline } from './HistoryTimeline'

interface PartDetailDrawerProps {
  activity: ActivityDefinition
  /** The template row (activity under a milestone for a section) this entry belongs to. */
  row: TemplateRow
  partNo: string
  onClose: () => void
}

type FetchEntry = { loading: boolean; error?: string; lastFetched?: string }

function isFetchedSource(source: string): boolean {
  return ['enovia', 'sap', 'edoc', 'regapp'].includes(source)
}

export function PartDetailDrawer({ activity, row, partNo, onClose }: PartDetailDrawerProps) {
  const { entries, models, picAssignments, parts, partReleases, partAcks, updateEntryValues, transitionEntryState, setNotApplicable, releasePart, setVendorTimeline, addAction, updateAction, deleteAction, addDeviation, advanceDeviation } = useQAStore()
  const { currentPersona } = usePersonaStore()

  const part = parts.find((p) => p.partNo === partNo)
  const entryId = makeEntryId(row.id, partNo)
  const entry = entries.find((e) => e.id === entryId)

  // Milestone MRD of this part's model, and the planned dates resolved from the row's offsets
  const model = part ? models.find((m) => m.name === part.model) : undefined
  const milestoneMrd = getMilestoneMrd(model, row.milestoneId)
  const templateDates = resolveInstanceDates(row, model)
  // Tracked dates follow a vendor timeline when one is set (and the activity allows it).
  const dates = resolveTrackedDates(row, model, entry)

  const [localValues, setLocalValues] = useState<Record<string, any>>(entry?.values ?? {})
  const [fetchState, setFetchState] = useState<Record<string, FetchEntry>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [picComment, setPicComment] = useState('')
  const [showSendBackModal, setShowSendBackModal] = useState(false)
  const [sendBackComment, setSendBackComment] = useState('')
  const [showDeviation, setShowDeviation] = useState(false)
  const [activeTab, setActiveTab] = useState('form')
  const [naDialog, setNaDialog] = useState<'mark' | 'reverse' | null>(null)
  const [releaseComment, setReleaseComment] = useState('')
  const [tlStart, setTlStart] = useState('')
  const [tlEnd, setTlEnd] = useState('')
  const [tlEditing, setTlEditing] = useState(false)
  const [newActionOpen, setNewActionOpen] = useState(false)
  const [naTitle, setNaTitle] = useState('')
  const [naDesc, setNaDesc] = useState('')
  const [naTarget, setNaTarget] = useState('')
  const [newDevOpen, setNewDevOpen] = useState(false)
  const [devTitle, setDevTitle] = useState('')
  const [devDesc, setDevDesc] = useState('')
  const [devEdoc, setDevEdoc] = useState('')
  const [devTarget, setDevTarget] = useState('')

  const conditionalState = useMemo(() => {
    return evaluateConditionalRules(activity.fields, localValues)
  }, [activity.fields, localValues])

  const calculatedValues = useMemo(() => {
    if (!part) return localValues
    return evaluateCalculatedFields(activity, localValues, part, milestoneMrd)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, localValues, part, milestoneMrd])

  useEffect(() => {
    const keys = activity.fields.filter((f) => f.source === 'calculated').map((f) => f.key)
    const patch: Record<string, any> = {}
    for (const k of keys) {
      if (calculatedValues[k] !== undefined) patch[k] = calculatedValues[k]
    }
    if (Object.keys(patch).length > 0) {
      setLocalValues((prev) => ({ ...prev, ...patch }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(calculatedValues)])

  const actualBeyondMrd = useMemo(() => {
    if (!part || !milestoneMrd) return false
    const actual = localValues['actual_otop_date'] || localValues['actual_finish_vendor']
    if (!actual) return false
    return actual > milestoneMrd
  }, [localValues, part, milestoneMrd])

  useEffect(() => {
    if (actualBeyondMrd && currentPersona === 'PIC' && !showDeviation) {
      setShowDeviation(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualBeyondMrd, currentPersona])

  const handleFieldChange = useCallback((key: string, value: any) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  async function handleFetchField(field: FieldDefinition) {
    setFetchState((prev) => ({ ...prev, [field.key]: { loading: true } }))

    let result: { success: boolean; data?: any; error?: string }
    switch (field.source) {
      case 'enovia':
        result = await fetchFromEnovia(partNo)
        break
      case 'sap':
        result = await fetchFromSap(partNo)
        break
      case 'edoc':
        result = await fetchFromEdoc(localValues['edoc_number'] || partNo)
        break
      case 'regapp':
        result = await fetchFromRegApp(partNo)
        break
      default:
        result = { success: false, error: 'Unknown source' }
    }

    const now = new Date().toISOString()
    if (result.success && result.data) {
      const dataKeys = Object.keys(result.data)
      const matched = dataKeys.find(
        (k) => k.toLowerCase() === field.key.toLowerCase() || field.key.includes(k.toLowerCase())
      )
      const fetchedValue = matched ? result.data[matched] : result.data[dataKeys[0]]
      setLocalValues((prev) => ({ ...prev, [field.key]: fetchedValue ?? prev[field.key] }))
      setFetchState((prev) => ({ ...prev, [field.key]: { loading: false, lastFetched: now } }))
    } else {
      setFetchState((prev) => ({
        ...prev,
        [field.key]: { loading: false, error: result.error ?? 'Not available', lastFetched: now }
      }))
    }
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {}
    for (const field of activity.fields) {
      const state = conditionalState[field.key]
      if (!state?.visible) continue
      const isMandatory = state.mandatory
      if (!isMandatory) continue
      if (!canPersonaEdit(field, currentPersona, entry)) continue
      const val = localValues[field.key]
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
        errors[field.key] = `${field.label} is required`
      }
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  function handleSave() {
    if (!validateForm()) return
    updateEntryValues(row.id, partNo, localValues, currentPersona)
  }

  function handleSubmit() {
    if (!validateForm()) return
    updateEntryValues(row.id, partNo, localValues, currentPersona)
    transitionEntryState(entryId, 'Submit', undefined, currentPersona)
  }

  function handleApprove() {
    transitionEntryState(entryId, 'Approve', picComment, currentPersona)
    setPicComment('')
  }

  function handleSendBack() {
    transitionEntryState(entryId, 'Send back', sendBackComment, currentPersona)
    setSendBackComment('')
    setShowSendBackModal(false)
  }

  function handlePicEdit() {
    updateEntryValues(row.id, partNo, localValues, currentPersona)
    transitionEntryState(entryId, 'Edit', picComment, currentPersona)
    setPicComment('')
  }

  const entryState = entry?.validationState ?? 'Draft'
  const isNa = !!entry?.notApplicable
  // A Not-applicable part is frozen: no entering, submitting or validating until it is reversed
  const isSubmitted = entryState === 'Submitted' && !isNa
  const isPic = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'
  const canSubmit = (entryState === 'Draft' || entryState === 'Sent back') && !isNa
  const canVendorEdit = currentPersona === 'Vendor' && canSubmit
  const canPicEnter = isPic && canSubmit
  const showMarkNa = !isNa && activity.allowNotApplicable === true && canMarkNotApplicable(currentPersona)
  const showReverseNa = isNa && canReverseNotApplicable(currentPersona)

  function handleNaConfirm(reason: string) {
    setNotApplicable(row.id, [partNo], naDialog === 'mark', currentPersona, reason)
    setNaDialog(null)
  }

  const actions = entry?.actions ?? []
  const tabs: TabItem[] = [
    { id: 'form', label: 'Form' },
    { id: 'actions', label: `Actions (${actions.length})` },
    { id: 'deviations', label: `Deviations (${(entry?.deviations ?? []).length})` },
    { id: 'history', label: `History (${entry?.history?.length ?? 0})` },
  ]

  const visibleFields = activity.fields.filter((f) => conditionalState[f.key]?.visible !== false)

  if (!part) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
        <div className="fixed top-0 right-0 z-50 h-full w-full max-w-2xl bg-white shadow-2xl flex items-center justify-center">
          <p className="text-[var(--color-muted)]">Part not found</p>
        </div>
      </>
    )
  }

  const currentPic = getPicOn(part, picAssignments, DEMO_TODAY)

  // Release-to-vendor gate. Only the PIC (and SIC/DPM who cover for the PIC) can release/recall.
  const rstate = getReleaseState(part.partNo, partReleases, partAcks)
  const released = rstate === 'Released' || rstate === 'Acknowledged'
  const returnInfo = rstate === 'Returned' ? latestReturn(part.partNo, partAcks) : undefined
  const canRelease = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'

  function handleRelease(next: boolean) {
    const actorName = currentPersona === 'PIC' ? currentPic.name || undefined : undefined
    releasePart({ partNo: part!.partNo, released: next, by: currentPersona, actorName, comment: releaseComment })
    setReleaseComment('')
  }

  // Vendor planned timeline. Shown only for activities the Admin opened for it.
  const vtAllowed = activity.allowVendorPlannedTimeline === true
  const vt = entry?.vendorTimeline
  const canEditTimeline =
    currentPersona === 'Vendor' || currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'Admin'

  function openTimelineEditor() {
    setTlStart(vt?.current.start ?? (templateDates.status === 'resolved' ? templateDates.start : ''))
    setTlEnd(vt?.current.end ?? (templateDates.status === 'resolved' ? templateDates.end : ''))
    setTlEditing(true)
  }

  function saveTimeline() {
    if (!tlStart || !tlEnd || tlStart > tlEnd) return
    const actorName = currentPersona === 'Vendor' ? part!.vendorName : undefined
    setVendorTimeline(row.id, part!.partNo, tlStart, tlEnd, currentPersona, actorName)
    setTlEditing(false)
  }

  // Actions / recommendations.
  const canManageActions = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'Admin'
  const picActorName = currentPersona === 'PIC' ? currentPic.name || undefined : undefined

  function createAction() {
    if (!naTitle.trim()) return
    addAction(
      row.id,
      part!.partNo,
      { title: naTitle, description: naDesc, assignedTo: 'Vendor', assignedToName: part!.vendorName, targetDate: naTarget || undefined },
      currentPersona,
      picActorName
    )
    setNaTitle('')
    setNaDesc('')
    setNaTarget('')
    setNewActionOpen(false)
  }

  function changeActionStatus(actionId: string, status: 'Open' | 'In progress' | 'Done') {
    const actorName = currentPersona === 'Vendor' ? part!.vendorName : picActorName
    updateAction(row.id, part!.partNo, actionId, { status }, currentPersona, actorName)
  }

  function changeActionTarget(actionId: string, targetDate: string) {
    updateAction(row.id, part!.partNo, actionId, { targetDate }, currentPersona, picActorName)
  }

  // Deviations.
  const deviations = entry?.deviations ?? []
  function createDeviation() {
    if (!devTitle.trim()) return
    addDeviation(row.id, part!.partNo, { title: devTitle, description: devDesc, edocNumber: devEdoc, targetDate: devTarget || undefined }, currentPersona, picActorName)
    setDevTitle(''); setDevDesc(''); setDevEdoc(''); setDevTarget(''); setNewDevOpen(false)
  }
  function decideDeviation(id: string, action: 'Approve' | 'Reject' | 'Send back') {
    advanceDeviation(row.id, part!.partNo, id, action, currentPersona, picActorName)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="border-b border-[var(--color-border)] px-5 py-4 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                {isNa && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[#cbd5e1] bg-[#f1f5f9] px-2 py-1 text-[10px] font-medium text-[#475569]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]" />
                    Not applicable
                  </span>
                )}
                {!isNa && <StatusPill
                  status={
                    entryState === 'Submitted' ? 'Submitted'
                    : entryState === 'Sent back' ? 'SentBack'
                    : entryState === 'Approved' ? 'Approved'
                    : 'Draft'
                  }
                  size="sm"
                />}
                <span className="text-xs text-[var(--color-muted)]">{part.type === 'NewPart' ? 'New Part' : 'ECN'}</span>
              </div>
              <h2 className="text-base font-semibold text-[var(--color-text)] truncate">{part.partName}</h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5 font-mono">{part.partNo}</p>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--color-muted)] hover:text-[var(--color-text)] p-1 rounded ml-4 flex-shrink-0"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-[var(--color-muted)]">
            <span>Model: <strong className="text-[var(--color-text)]">{part.model}</strong></span>
            <span>Vendor: <strong className="text-[var(--color-text)]">{part.vendorName}</strong></span>
            <span>Dept: <strong className="text-[var(--color-text)]">{part.department}</strong></span>
            <span>Section: <strong className="text-[var(--color-text)]">{part.section}</strong></span>
            <span>
              PIC:{' '}
              <strong className="text-[var(--color-text)]">{currentPic.name || 'Unassigned'}</strong>
              {currentPic.assignment && (
                <span className="ml-1 text-[10px]">
                  (assigned from {fmtDate(currentPic.assignment.effectiveFrom)})
                </span>
              )}
            </span>
            <span>
              {row.milestoneId} MRD:{' '}
              <strong className="text-[var(--color-text)]">{milestoneMrd ? fmtDate(milestoneMrd) : 'Awaiting MRD'}</strong>
            </span>
            <span>
              Planned:{' '}
              <strong className="text-[var(--color-text)]">
                {dates.status === 'resolved' ? `${fmtDate(dates.start)} → ${fmtDate(dates.end)}` : 'Awaiting MRD'}
              </strong>
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 flex-shrink-0 border-b border-[var(--color-border)]">
          <Tabs items={tabs} activeId={activeTab} onChange={setActiveTab} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Release-to-vendor gate */}
          {released ? (
            <div
              className={`mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                rstate === 'Acknowledged' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-blue-900'
              }`}
            >
              <span className="font-medium">
                {rstate === 'Acknowledged' ? 'Released to vendor · acknowledged' : 'Released to vendor · awaiting acknowledgement'}
              </span>
              <span className={`text-xs ${rstate === 'Acknowledged' ? 'text-emerald-700' : 'text-blue-700'}`}>
                {rstate === 'Acknowledged'
                  ? 'The vendor has accepted this part and can act on it.'
                  : 'The vendor must acknowledge or return this part before working on it.'}
              </span>
              {canRelease && (
                <div className="ml-auto flex items-center gap-2">
                  <input
                    value={releaseComment}
                    onChange={(e) => setReleaseComment(e.target.value)}
                    placeholder="Reason for recall (optional)"
                    className="h-8 rounded-lg border border-emerald-200 bg-white px-2 text-[11px] text-[#344054] placeholder-[var(--color-muted)]"
                  />
                  <Button variant="secondary" size="sm" onClick={() => handleRelease(false)}>
                    Recall
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div
              className={`mb-4 rounded-lg border px-3 py-2.5 text-sm ${
                rstate === 'Returned' ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{rstate === 'Returned' ? 'Returned by vendor' : 'Not yet released to vendor'}</span>
                <span className={`text-xs ${rstate === 'Returned' ? 'text-red-700' : 'text-amber-700'}`}>
                  {rstate === 'Returned'
                    ? `Reason: ${returnInfo?.reason ?? '—'}. Fix the details and release it again.`
                    : 'Review the details above. The vendor can’t see this part until you release it. You can still do your own updates.'}
                </span>
              </div>
              {canRelease && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={releaseComment}
                    onChange={(e) => setReleaseComment(e.target.value)}
                    placeholder="Note (optional) — e.g. vendor code verified"
                    className="h-8 flex-1 rounded-lg border border-amber-200 bg-white px-2 text-[11px] text-[#344054] placeholder-[var(--color-muted)]"
                  />
                  <Button variant="primary" size="sm" onClick={() => handleRelease(true)}>
                    {rstate === 'Returned' ? 'Release again' : 'Release to vendor'}
                  </Button>
                </div>
              )}
            </div>
          )}
          {/* Planned timeline (template vs vendor-set) */}
          {vtAllowed && (
            <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--color-text)]">Planned timeline</span>
                {canEditTimeline && !tlEditing && (
                  <Button variant="secondary" size="sm" onClick={openTimelineEditor}>
                    {vt ? 'Update timeline' : 'Set vendor timeline'}
                  </Button>
                )}
              </div>

              {/* Template baseline */}
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 flex-none text-[var(--color-muted)]">Template</span>
                <span className={vt ? 'text-[var(--color-muted)] line-through' : 'font-medium text-[var(--color-text)]'}>
                  {templateDates.status === 'resolved'
                    ? `${fmtDate(templateDates.start)} → ${fmtDate(templateDates.end)}`
                    : 'Awaiting MRD'}
                </span>
                {!vt && <span className="text-[10px] text-[var(--color-muted)]">· tracking uses this</span>}
              </div>

              {/* Vendor current + superseded versions (strikethrough) */}
              {vt && (
                <div className="mt-1.5 space-y-1 text-xs">
                  {vt.history.map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-16 flex-none text-[var(--color-muted)]">Vendor</span>
                      <span className="text-[var(--color-muted)] line-through">
                        {fmtDate(h.start)} → {fmtDate(h.end)}
                      </span>
                      <span className="text-[10px] text-[var(--color-muted)]">· {h.setBy}, {fmtDate(h.at.slice(0, 10))}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <span className="w-16 flex-none text-[var(--color-muted)]">Vendor</span>
                    <span className="font-medium text-[var(--color-text)]">
                      {fmtDate(vt.current.start)} → {fmtDate(vt.current.end)}
                    </span>
                    <span className="rounded-full bg-[#eff6ff] px-1.5 py-0.5 text-[10px] font-medium text-[#1d4ed8]">tracking uses this</span>
                  </div>
                </div>
              )}

              {/* Editor */}
              {tlEditing && (
                <div className="mt-2.5 flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-2.5">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium text-[var(--color-muted)]">Start</span>
                    <input type="date" value={tlStart} onChange={(e) => setTlStart(e.target.value)}
                      className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px]" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium text-[var(--color-muted)]">End</span>
                    <input type="date" value={tlEnd} onChange={(e) => setTlEnd(e.target.value)}
                      className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px]" />
                  </label>
                  <Button variant="primary" size="sm" onClick={saveTimeline} disabled={!tlStart || !tlEnd || tlStart > tlEnd}>
                    Save
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setTlEditing(false)}>Cancel</Button>
                  {tlStart && tlEnd && tlStart > tlEnd && (
                    <span className="w-full text-[10px] text-red-600">Start must not be after end.</span>
                  )}
                </div>
              )}
            </div>
          )}

          {isNa && entry?.notApplicable && (
            <div className="mb-4 rounded-lg border border-[#cbd5e1] bg-[#f1f5f9] px-3 py-2.5 text-sm text-[#334155]">
              <div className="font-medium">Not applicable for this part</div>
              <div className="mt-0.5 text-xs">
                Marked by <strong>{entry.notApplicable.by}</strong> on {fmtDate(entry.notApplicable.at.slice(0, 10))}
                {entry.notApplicable.reason ? <> — “{entry.notApplicable.reason}”</> : ' (no reason given)'}.
                The form is read-only and the part is excluded from completion %.
              </div>
            </div>
          )}
          {activeTab === 'form' && (
            <FormTab
              part={part}
              milestoneLabel={row.milestoneId}
              milestoneMrd={milestoneMrd}
              entry={entry}
              localValues={localValues}
              visibleFields={visibleFields}
              conditionalState={conditionalState}
              fetchState={fetchState}
              fieldErrors={fieldErrors}
              currentPersona={isNa ? '' : currentPersona}
              onFieldChange={handleFieldChange}
              onFetchField={handleFetchField}
            />
          )}
          {activeTab === 'history' && (
            <HistoryTimeline history={entry?.history ?? []} />
          )}
          {activeTab === 'actions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--color-muted)]">
                  Actions / recommendations raised on this activity, assigned to the vendor and tracked to a target date.
                </p>
                {canManageActions && !newActionOpen && (
                  <Button variant="primary" size="sm" onClick={() => setNewActionOpen(true)}>+ Add action</Button>
                )}
              </div>

              {/* New-action form */}
              {newActionOpen && (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
                  <input
                    value={naTitle}
                    onChange={(e) => setNaTitle(e.target.value)}
                    placeholder="Action title (e.g. Submit revised drawing)"
                    className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-white px-2 text-[12px]"
                  />
                  <textarea
                    value={naDesc}
                    onChange={(e) => setNaDesc(e.target.value)}
                    placeholder="Details (optional)"
                    rows={2}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-[12px] resize-y"
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-medium text-[var(--color-muted)]">Target date</span>
                      <input type="date" value={naTarget} onChange={(e) => setNaTarget(e.target.value)}
                        className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px]" />
                    </label>
                    <span className="text-[11px] text-[var(--color-muted)]">Assigned to <strong>Vendor</strong> ({part.vendorName})</span>
                    <div className="ml-auto flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setNewActionOpen(false); setNaTitle(''); setNaDesc(''); setNaTarget('') }}>Cancel</Button>
                      <Button variant="primary" size="sm" onClick={createAction} disabled={!naTitle.trim()}>Add</Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action list */}
              {actions.length === 0 && !newActionOpen ? (
                <div className="py-8 text-center text-sm text-[var(--color-muted)]">No actions raised yet.</div>
              ) : (
                <ul className="space-y-2">
                  {actions.map((a) => {
                    const ryg = toRygStatus(actionRyg(a, DEMO_TODAY))
                    const lastTarget = a.targetHistory && a.targetHistory.length > 0 ? a.targetHistory[a.targetHistory.length - 1].targetDate : undefined
                    const canAdvance = canManageActions || currentPersona === a.assignedTo
                    return (
                      <li key={a.id} className="rounded-lg border border-[var(--color-border)] bg-white p-3">
                        <div className="flex items-start gap-2">
                          <RygDot status={ryg} size={10} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium text-[var(--color-text)]">{a.title}</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                a.status === 'Done' ? 'bg-emerald-100 text-emerald-800'
                                : a.status === 'In progress' ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'}`}>{a.status}</span>
                            </div>
                            {a.description && <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{a.description}</p>}
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--color-muted)]">
                              <span>Assigned: <strong className="text-[var(--color-text)]">{a.assignedToName || a.assignedTo}</strong></span>
                              <span>
                                Target:{' '}
                                {lastTarget && <span className="text-[var(--color-muted)] line-through mr-1">{fmtDate(lastTarget)}</span>}
                                <strong className="text-[var(--color-text)]">{a.targetDate ? fmtDate(a.targetDate) : '—'}</strong>
                              </span>
                              {a.status === 'Done' && a.completedAt && <span>Done {fmtDate(a.completedAt.slice(0, 10))}</span>}
                            </div>

                            {/* Controls */}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {canAdvance && a.status !== 'In progress' && a.status !== 'Done' && (
                                <Button variant="secondary" size="sm" onClick={() => changeActionStatus(a.id, 'In progress')}>Start</Button>
                              )}
                              {canAdvance && a.status !== 'Done' && (
                                <Button variant="primary" size="sm" onClick={() => changeActionStatus(a.id, 'Done')}>Mark done</Button>
                              )}
                              {canAdvance && a.status === 'Done' && (
                                <Button variant="secondary" size="sm" onClick={() => changeActionStatus(a.id, 'Open')}>Reopen</Button>
                              )}
                              {canManageActions && (
                                <label className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                                  Reschedule
                                  <input type="date" value={a.targetDate ?? ''} onChange={(e) => changeActionTarget(a.id, e.target.value)}
                                    className="h-7 rounded border border-[var(--color-border)] bg-white px-1.5 text-[10px]" />
                                </label>
                              )}
                              {canManageActions && (
                                <button onClick={() => deleteAction(row.id, part.partNo, a.id, currentPersona)}
                                  className="ml-auto text-[10px] text-[var(--color-destructive)] hover:underline">Delete</button>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'deviations' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--color-muted)]">
                  Deviations move through this activity's approval chain ({(activity.deviationFlow && activity.deviationFlow.length ? activity.deviationFlow : ['PIC', 'SIC', 'DPM']).join(' → ')}).
                </p>
                {canManageActions && !newDevOpen && (
                  <Button variant="primary" size="sm" onClick={() => setNewDevOpen(true)}>+ Raise deviation</Button>
                )}
              </div>

              {newDevOpen && (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
                  <input value={devTitle} onChange={(e) => setDevTitle(e.target.value)} placeholder="Deviation title" className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-white px-2 text-[12px]" />
                  <textarea value={devDesc} onChange={(e) => setDevDesc(e.target.value)} placeholder="Details (optional)" rows={2} className="w-full rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-[12px] resize-y" />
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block"><span className="mb-1 block text-[10px] font-medium text-[var(--color-muted)]">E-Doc no.</span>
                      <input value={devEdoc} onChange={(e) => setDevEdoc(e.target.value)} className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px]" /></label>
                    <label className="block"><span className="mb-1 block text-[10px] font-medium text-[var(--color-muted)]">Target date</span>
                      <input type="date" value={devTarget} onChange={(e) => setDevTarget(e.target.value)} className="h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[11px]" /></label>
                    <div className="ml-auto flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setNewDevOpen(false); setDevTitle(''); setDevDesc(''); setDevEdoc(''); setDevTarget('') }}>Cancel</Button>
                      <Button variant="primary" size="sm" onClick={createDeviation} disabled={!devTitle.trim()}>Raise</Button>
                    </div>
                  </div>
                </div>
              )}

              {deviations.length === 0 && !newDevOpen ? (
                <div className="py-8 text-center text-sm text-[var(--color-muted)]">No deviations raised.</div>
              ) : (
                <ul className="space-y-2">
                  {deviations.map((d) => {
                    const open = d.status === 'In progress' || d.status === 'Sent back'
                    const stageRole = open ? d.flow[d.currentStep] : ''
                    const canAct = open && (currentPersona === 'Admin' || stageRole === currentPersona)
                    const statusTone = d.status === 'Approved' ? 'bg-emerald-100 text-emerald-800'
                      : d.status === 'Rejected' ? 'bg-red-100 text-red-700'
                      : d.status === 'Sent back' ? 'bg-slate-100 text-slate-600'
                      : 'bg-amber-100 text-amber-800'
                    return (
                      <li key={d.id} className="rounded-lg border border-[var(--color-border)] bg-white p-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium text-[var(--color-text)]">{d.title}</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusTone}`}>{d.status}</span>
                            </div>
                            {d.description && <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{d.description}</p>}
                            <div className="mt-1.5 flex items-center gap-1">
                              {d.flow.map((role, i) => {
                                const done = d.status === 'Approved' ? true : i < d.currentStep
                                const active = open && i === d.currentStep
                                return (
                                  <span key={role} className="flex items-center gap-1">
                                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${done ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' : 'bg-slate-100 text-slate-500'}`}>{role}</span>
                                    {i < d.flow.length - 1 && <span className="text-[9px] text-[var(--color-muted)]">→</span>}
                                  </span>
                                )
                              })}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-[var(--color-muted)]">
                              <span>raised by {d.raisedBy}</span>
                              {d.edocNumber && <span>E-Doc {d.edocNumber}</span>}
                              {d.targetDate && <span>target {fmtDate(d.targetDate)}</span>}
                            </div>
                            {canAct && (
                              <div className="mt-2 flex gap-1.5">
                                <Button variant="primary" size="sm" onClick={() => decideDeviation(d.id, 'Approve')}>Approve</Button>
                                <Button variant="secondary" size="sm" onClick={() => decideDeviation(d.id, 'Send back')}>Send back</Button>
                                <button onClick={() => decideDeviation(d.id, 'Reject')} className="text-[10px] text-[var(--color-destructive)] hover:underline">Reject</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-5 py-3 flex-shrink-0">
          {/* PIC validation actions */}
          {isPic && isSubmitted && (
            <div className="mb-3">
              <label className="text-xs font-medium text-[var(--color-muted)] block mb-1">
                Comment (optional)
              </label>
              <input
                type="text"
                value={picComment}
                onChange={(e) => setPicComment(e.target.value)}
                placeholder="Add a comment…"
                className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] mb-2"
              />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={handleApprove}>✓ Approve</Button>
                <Button variant="secondary" size="sm" onClick={handlePicEdit}>✎ Edit</Button>
                <Button variant="danger" size="sm" onClick={() => setShowSendBackModal(true)}>↩ Send back</Button>
              </div>
            </div>
          )}

          {/* Vendor / entering persona actions */}
          {(canVendorEdit || canPicEnter) && (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleSave}>Save draft</Button>
              <Button variant="primary" size="sm" onClick={handleSubmit}>Submit</Button>
            </div>
          )}

          {(showMarkNa || showReverseNa) && (
            <div className="flex items-center gap-2">
              {showMarkNa && (
                <Button variant="secondary" size="sm" onClick={() => setNaDialog('mark')}>
                  Mark Not applicable
                </Button>
              )}
              {showReverseNa && (
                <Button variant="secondary" size="sm" onClick={() => setNaDialog('reverse')}>
                  Mark applicable again
                </Button>
              )}
            </div>
          )}

          {entryState === 'Approved' && !isNa && (
            <p className="mt-2 text-sm text-[#047857] font-medium">✓ Entry approved</p>
          )}

          {!isPic && !canVendorEdit && !canPicEnter && entryState !== 'Approved' && !showReverseNa && (
            <p className="text-xs text-[var(--color-muted)]">
              Read-only — you are viewing as <strong>{currentPersona}</strong>.
            </p>
          )}
        </div>
      </div>

      <ApplicabilityDialog
        open={naDialog !== null}
        markNotApplicable={naDialog === 'mark'}
        subject={part.partName}
        onCancel={() => setNaDialog(null)}
        onConfirm={handleNaConfirm}
      />

      {/* Send-back modal */}
      <Modal
        open={showSendBackModal}
        onClose={() => setShowSendBackModal(false)}
        title="Send back to vendor"
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowSendBackModal(false)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleSendBack}>Send back</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-muted)] mb-3">
          Provide a reason so the vendor knows what to correct.
        </p>
        <textarea
          rows={4}
          value={sendBackComment}
          onChange={(e) => setSendBackComment(e.target.value)}
          placeholder="Describe what needs to be fixed…"
          className="w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-y"
        />
      </Modal>

      {/* Deviation popup */}
      {showDeviation && (
        <DeviationPopup
          partNo={partNo}
          mrd={milestoneMrd ?? ''}
          activityId={activity.id}
          initialEdocNumber={localValues['edoc_number'] ?? ''}
          onClose={() => setShowDeviation(false)}
          onEdocSave={(edocNo, deviationStatus) => {
            handleFieldChange('edoc_number', edocNo)
            handleFieldChange('deviation_status', deviationStatus)
            setShowDeviation(false)
          }}
        />
      )}
    </>
  )
}

// ── FormTab ────────────────────────────────────────────────────────────────────

interface FormTabProps {
  part: PartRecord | undefined
  milestoneLabel: string
  milestoneMrd: string | undefined
  entry: ActivityEntry | undefined
  localValues: Record<string, any>
  visibleFields: FieldDefinition[]
  conditionalState: Record<string, { visible: boolean; mandatory: boolean }>
  fetchState: Record<string, FetchEntry>
  fieldErrors: Record<string, string>
  currentPersona: string
  onFieldChange: (key: string, value: any) => void
  onFetchField: (field: FieldDefinition) => void
}

function FormTab({
  part,
  milestoneLabel,
  milestoneMrd,
  entry,
  localValues,
  visibleFields,
  conditionalState,
  fetchState,
  fieldErrors,
  currentPersona,
  onFieldChange,
  onFetchField,
}: FormTabProps) {
  const sentBackFields = useMemo(() => {
    if (!entry?.fieldMeta) return {} as Record<string, string>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(entry.fieldMeta)) {
      if (v.status === 'Send back' && v.comment) out[k] = v.comment
    }
    return out
  }, [entry])

  return (
    <div className="space-y-4">
      {/* Common part info */}
      <div className="bg-[var(--color-surface)] rounded-lg p-3 text-xs text-[var(--color-muted)] grid grid-cols-2 gap-x-4 gap-y-1">
        <div><span className="font-medium">Part No:</span> <span className="font-mono">{part?.partNo}</span></div>
        <div><span className="font-medium">Model:</span> {part?.model}</div>
        <div><span className="font-medium">Vendor:</span> {part?.vendorName}</div>
        <div><span className="font-medium">Department:</span> {part?.department}</div>
        <div><span className="font-medium">{milestoneLabel} MRD:</span> {milestoneMrd ? fmtDate(milestoneMrd) : 'Awaiting MRD'}</div>
        <div><span className="font-medium">Type:</span> {part?.type === 'NewPart' ? 'New Part' : 'ECN'}</div>
      </div>

      {visibleFields.map((field) => {
        const fieldState = conditionalState[field.key]
        const isMandatory = fieldState?.mandatory ?? field.mandatory
        const isEditable = canPersonaEdit(field, currentPersona, entry)
        const renderer = getFieldRenderer(field.type)
        const value = localValues[field.key]
        const fs = fetchState[field.key]
        const error = fieldErrors[field.key]
        const sentBackComment = sentBackFields[field.key]

        // A table field can have columns owned by different personas (e.g. Vendor rows + PIC "Reason for
        // acceptance"), so always render its editor and let it gate per column. It is fully disabled only
        // when the entry is locked for everyone (Not applicable), handled by canPersonaEdit on scalar fields.
        const isTable = field.type === 'table'
        const tableOwnsAColumn =
          isTable && (field.columns ?? []).some((c) => (c.enteredBy ?? field.enteredBy) === currentPersona)

        return (
          <div key={field.key}>
            {sentBackComment && (
              <div className="mb-1 px-2 py-1 bg-[#fffbeb] border border-[#fde68a] rounded text-xs text-[#b45309]">
                ⚠ Sent back: {sentBackComment}
              </div>
            )}

            <div className={error ? 'ring-1 ring-ryg-red rounded p-1' : ''}>
              {isTable
                ? renderer.editor({
                    field: { ...field, mandatory: isMandatory },
                    value,
                    onChange: (v) => onFieldChange(field.key, v),
                    disabled: !tableOwnsAColumn,
                    currentPersona
                  })
                : isEditable
                ? renderer.editor({
                    field: { ...field, mandatory: isMandatory },
                    value,
                    onChange: (v) => onFieldChange(field.key, v),
                    currentPersona
                  })
                : renderer.preview({ field, value })}
            </div>

            {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <SourceBadge source={field.source as any} size="sm" />
              {isMandatory && <span className="text-xs text-destructive" title="Required">*</span>}

              {isFetchedSource(field.source) && (
                <div className="flex items-center gap-1.5 ml-auto">
                  {fs?.lastFetched && !fs.loading && (
                    <span className="text-[10px] text-[var(--color-muted)]">
                      Fetched {new Date(fs.lastFetched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {fs?.error && (
                    <span className="text-[10px] text-[#b45309]">⚠ Not available</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onFetchField(field)}
                    disabled={fs?.loading}
                    className={`text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors ${fs?.loading ? 'opacity-50 cursor-wait' : ''}`}
                  >
                    {fs?.loading ? '⟳ Fetching…' : '↻ Refresh'}
                  </button>
                </div>
              )}
            </div>

            {isFetchedSource(field.source) && fs?.error && (
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5 italic">
                Not available in {field.source.toUpperCase()} — enter the target date manually if needed.
              </p>
            )}
          </div>
        )
      })}

      {visibleFields.length === 0 && (
        <p className="text-sm text-[var(--color-muted)] text-center py-8">No fields applicable for this entry.</p>
      )}
    </div>
  )
}
