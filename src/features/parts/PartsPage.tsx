import { useMemo, useState } from 'react'
import { PageHeader, Card, Button, Modal, Tabs, useMobilePage } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { getPicOn, buildActivityLog, getReleaseState, latestReturn, vendorLocation } from '../../engine'
import type { PartRecord } from '../../domain'
import { DEMO_TODAY, fmtDate, partInScope } from '../scope'

const inputCls =
  'h-9 rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[11px] text-[#344054] placeholder-[var(--color-muted)]'
const thCls = 'text-left px-4 py-3 font-medium text-[var(--color-muted)]'

function fmtDateTime(ts: string): string {
  return `${fmtDate(ts.slice(0, 10))} ${ts.slice(11, 16)}`
}

/** CSV cell escaping. */
function csvCell(v: string | number | undefined): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function PartsPage() {
  const {
    parts: allParts,
    partEvents,
    partReleases,
    partAcks,
    entries,
    templateRows,
    activities,
    sections,
    picAssignments,
    vendorInfo,
    addManualPart,
    transferPart,
    releasePart
  } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const canManage = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'Admin'
  /** Dummy part numbers are raised by the Department Co-ordinator (Admin can too). */
  const canAddDummy = currentPersona === 'SectionAdmin' || currentPersona === 'Admin'
  const canRelease = currentPersona === 'PIC' || currentPersona === 'SIC' || currentPersona === 'DPM'

  const doRelease = (part: PartRecord, next: boolean) => {
    const actorName = currentPersona === 'PIC' ? getPicOn(part, picAssignments, DEMO_TODAY).name || undefined : undefined
    releasePart({ partNo: part.partNo, released: next, by: currentPersona, actorName })
  }

  const [tab, setTab] = useState<'manage' | 'audit'>('manage')

  // Parts the persona may see (hide superseded by default)
  const [showSuperseded, setShowSuperseded] = useState(false)
  const visibleParts = useMemo(
    () => allParts.filter((p) => partInScope(p, currentPersona) && (showSuperseded || !p.supersededBy)),
    [allParts, currentPersona, showSuperseded]
  )
  const scopeParts = useMemo(() => allParts.filter((p) => partInScope(p, currentPersona)), [allParts, currentPersona])

  // ── Add dummy part dialog ────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false)
  const [np, setNp] = useState('')
  const [pname, setPname] = useState('')
  const [pmodel, setPmodel] = useState('')
  const [pvendor, setPvendor] = useState('')
  const [pvendorCode, setPvendorCode] = useState('')
  const [pdept, setPdept] = useState('')
  const [psection, setPsection] = useState('')
  const [ptype, setPtype] = useState<'NewPart' | 'ECN'>('NewPart')
  const [ppic, setPpic] = useState('')

  const models = useMemo(() => Array.from(new Set(allParts.map((p) => p.model).filter(Boolean))).sort(), [allParts])
  const vendors = useMemo(() => Array.from(new Set(allParts.map((p) => p.vendorName).filter(Boolean))).sort(), [allParts])
  const knownPics = useMemo(
    () => Array.from(new Set([...allParts.map((p) => p.pic), ...picAssignments.map((a) => a.pic)].filter(Boolean))).sort(),
    [allParts, picAssignments]
  )

  const dupPart = allParts.some((p) => p.partNo === np.trim())
  const addValid = np.trim() && pname.trim() && pmodel.trim() && pvendor.trim() && psection && !dupPart

  const openAdd = () => {
    setNp('')
    setPname('')
    setPmodel('')
    setPvendor('')
    setPvendorCode('')
    setPdept('')
    setPsection(sections[0]?.id ?? '')
    setPtype('NewPart')
    setPpic('')
    setAddOpen(true)
  }

  const submitAdd = () => {
    if (!addValid) return
    const picName = ppic.trim() || undefined
    addManualPart(
      {
        partNo: np.trim(),
        partName: pname.trim(),
        model: pmodel.trim(),
        vendorName: pvendor.trim(),
        vendorCode: pvendorCode.trim() || '—',
        department: pdept.trim() || 'Other',
        section: psection,
        pic: ppic.trim(),
        type: ptype
      },
      currentPersona,
      picName
    )
    setAddOpen(false)
  }

  // ── ECN transfer dialog ──────────────────────────────────────────────────
  const [xfer, setXfer] = useState<PartRecord | null>(null)
  const [toNo, setToNo] = useState('')
  const [toName, setToName] = useState('')
  const [xreason, setXreason] = useState('')

  const openXfer = (part: PartRecord) => {
    setXfer(part)
    setToNo('')
    setToName('')
    setXreason('')
  }

  const xferEntryCount = xfer ? entries.filter((e) => e.partNo === xfer.partNo).length : 0
  const toTarget = allParts.find((p) => p.partNo === toNo.trim())
  const toExists = !!toTarget
  // ECN transfer must stay within the same vendor: an existing target part must belong to the source's vendor.
  const vendorMismatch = !!(xfer && toTarget && toTarget.vendorName !== xfer.vendorName)
  const xferValid = !!(xfer && toNo.trim() && toNo.trim() !== xfer.partNo && !vendorMismatch)

  const submitXfer = () => {
    if (!xfer || !xferValid) return
    const actorName =
      currentPersona === 'PIC' ? getPicOn(xfer, picAssignments, DEMO_TODAY).name || undefined : undefined
    transferPart({
      fromPartNo: xfer.partNo,
      toPartNo: toNo.trim(),
      newPartName: toName.trim() || undefined,
      by: currentPersona,
      actorName,
      reason: xreason.trim() || undefined
    })
    setXfer(null)
  }

  // ── Audit report ─────────────────────────────────────────────────────────
  const [completedOnly, setCompletedOnly] = useState(true)
  const [personFilter, setPersonFilter] = useState('All')
  const [vendorFilter, setVendorFilter] = useState('All')
  const [partFilter, setPartFilter] = useState('')

  const log = useMemo(() => {
    const inScope = new Set(scopeParts.map((p) => p.partNo))
    return buildActivityLog(entries, allParts, templateRows, activities, picAssignments).filter((l) =>
      inScope.has(l.partNo)
    )
  }, [entries, allParts, templateRows, activities, picAssignments, scopeParts])

  const people = useMemo(() => Array.from(new Set(log.map((l) => l.person))).sort(), [log])

  const filteredLog = useMemo(
    () =>
      log.filter(
        (l) =>
          (!completedOnly || l.action === 'Approved') &&
          (personFilter === 'All' || l.person === personFilter) &&
          (vendorFilter === 'All' || l.vendorName === vendorFilter) &&
          (!partFilter || `${l.partNo} ${l.partName}`.toLowerCase().includes(partFilter.toLowerCase()))
      ),
    [log, completedOnly, personFilter, vendorFilter, partFilter]
  )

  const logVendors = useMemo(() => Array.from(new Set(log.map((l) => l.vendorName).filter(Boolean))).sort(), [log])

  // Per-PIC completion summary: how many activities each person has completed (Approved)
  const summary = useMemo(() => {
    const map = new Map<string, { completed: number; parts: Set<string> }>()
    for (const l of log) {
      if (l.action !== 'Approved') continue
      const e = map.get(l.person) ?? { completed: 0, parts: new Set<string>() }
      e.completed += 1
      e.parts.add(l.partNo)
      map.set(l.person, e)
    }
    return Array.from(map.entries())
      .map(([person, v]) => ({ person, completed: v.completed, parts: v.parts.size }))
      .sort((a, b) => b.completed - a.completed)
  }, [log])

  const exportCsv = () => {
    const header = ['When', 'PIC / Person', 'Role', 'Part No', 'Part Name', 'Section', 'Vendor', 'Vendor Code', 'Activity', 'Milestone', 'Action', 'Comment']
    const body = filteredLog.map((l) =>
      [
        fmtDateTime(l.timestamp),
        l.person,
        l.role,
        l.partNo,
        l.partName,
        l.section,
        l.vendorName,
        l.vendorCode,
        l.activityName,
        l.milestoneId,
        l.action,
        l.comment ?? ''
      ]
        .map(csvCell)
        .join(',')
    )
    const csv = [header.map(csvCell).join(','), ...body].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `qa-audit-report-${DEMO_TODAY}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const supersededCount = scopeParts.filter((p) => p.supersededBy).length

  const pgParts = useMobilePage(visibleParts, 10, 'parts')
  const pgLog = useMobilePage(filteredLog, 10, 'entries')
  return (
    <div>
      <PageHeader
        title="Parts & Audit"
        section="Modules"
        description="Add a placeholder part when SAP has no number yet, transfer a part's history to its ECN-revised number, and audit which PIC completed what."
      />

      <Tabs
        className="mb-4"
        activeId={tab}
        onChange={(id) => setTab(id as 'manage' | 'audit')}
        items={[
          { id: 'manage', label: 'Part numbers', badge: visibleParts.length },
          { id: 'audit', label: 'Audit report', badge: summary.reduce((n, s) => n + s.completed, 0) }
        ]}
      />

      {tab === 'manage' && (
        <>
          <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3.5">
            {canAddDummy ? (
              <Button variant="primary" size="md" onClick={openAdd}>
                + Add dummy part
              </Button>
            ) : (
              <span className="text-[11px] text-[var(--color-muted)]">
                Dummy part numbers are added by the Department Co-ordinator. PIC, SIC or Admin can transfer ECN history.
              </span>
            )}
            <label className="flex items-center gap-2 text-[11px] text-[#344054]">
              <input type="checkbox" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.target.checked)} />
              Show superseded ({supersededCount})
            </label>
          </section>

          <Card flush>
            <div className="overflow-x-auto m-tbl-wrap">
              <table className="w-full text-sm m-tbl">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <th className={thCls}>Part</th>
                    <th className={thCls}>Model</th>
                    <th className={thCls}>Section</th>
                    <th className={thCls}>Type</th>
                    <th className={thCls}>Origin</th>
                    <th className={thCls}>Status</th>
                    <th className={thCls}>Release</th>
                    <th className={thCls}>Vendor</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {pgParts.rows.map((p) => {
                    const superseded = !!p.supersededBy
                    const rstate = getReleaseState(p.partNo, partReleases, partAcks)
                    const withVendor = rstate === 'Released' || rstate === 'Acknowledged'
                    const returnedInfo = rstate === 'Returned' ? latestReturn(p.partNo, partAcks) : undefined
                    return (
                      <tr key={p.partNo} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="px-4 py-3">
                          <div className={`font-medium ${superseded ? 'text-[var(--color-muted)] line-through' : 'text-[#101828]'}`}>
                            {p.partNo}
                          </div>
                          <div className="text-[11px] text-[var(--color-muted)]">{p.partName}</div>
                          {p.supersedes && (
                            <div className="text-[10px] text-[var(--color-muted)]">inherited from {p.supersedes}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[12px]">{p.model}</td>
                        <td className="px-4 py-3 text-[12px]">{p.section}</td>
                        <td className="px-4 py-3 text-[12px]">{p.type}</td>
                        <td className="px-4 py-3 text-[12px]">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              p.origin === 'Manual' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {p.origin === 'Manual' ? 'Dummy' : 'SAP'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px]">
                          {superseded ? (
                            <span className="text-[11px] text-[var(--color-muted)]">→ {p.supersededBy}</span>
                          ) : (
                            <span className="text-emerald-700">Active</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[12px]">
                          {superseded ? (
                            <span className="text-[var(--color-muted)]">—</span>
                          ) : (
                            <div>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  rstate === 'Acknowledged'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : rstate === 'Released'
                                      ? 'bg-blue-100 text-blue-800'
                                      : rstate === 'Returned'
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {rstate === 'Acknowledged'
                                  ? 'Acknowledged'
                                  : rstate === 'Released'
                                    ? 'Released · awaiting ack'
                                    : rstate === 'Returned'
                                      ? 'Returned by vendor'
                                      : 'Not released'}
                              </span>
                              {returnedInfo?.reason && (
                                <div className="mt-1 max-w-[220px] text-[10px] text-[var(--color-muted)]">“{returnedInfo.reason}”</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[12px]">
                          <div className="text-[#101828]">{p.vendorName}</div>
                          <div className="text-[11px] text-[var(--color-muted)]">
                            {p.vendorCode}
                            {vendorLocation(p.vendorName, vendorInfo) !== 'Unknown' && ` · ${vendorLocation(p.vendorName, vendorInfo)}`}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canRelease && !superseded && (
                              <Button variant="secondary" size="sm" onClick={() => doRelease(p, !withVendor)}>
                                {withVendor ? 'Recall' : rstate === 'Returned' ? 'Release again' : 'Release'}
                              </Button>
                            )}
                            {canManage && !superseded && (
                              <Button variant="secondary" size="sm" onClick={() => openXfer(p)}>
                                ECN transfer
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {visibleParts.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-[var(--color-muted)]">
                        No parts.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {pgParts.pager && <div className="px-4 pb-3">{pgParts.pager}</div>}
          </Card>
        </>
      )}

      {tab === 'audit' && (
        <>
          <Card flush className="mb-4">
            <div className="overflow-x-auto m-tbl-wrap">
              <table className="w-full text-sm m-tbl">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <th className={thCls}>PIC / Person</th>
                    <th className={thCls}>Activities completed</th>
                    <th className={thCls}>Distinct parts</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.person} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-4 py-3 font-medium text-[#101828]">{s.person}</td>
                      <td className="px-4 py-3">{s.completed}</td>
                      <td className="px-4 py-3">{s.parts}</td>
                    </tr>
                  ))}
                  {summary.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-[var(--color-muted)]">
                        No completed activities yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <section className="epmp-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3.5">
            <label className="flex items-center gap-2 text-[11px] text-[#344054]">
              <input type="checkbox" checked={completedOnly} onChange={(e) => setCompletedOnly(e.target.checked)} />
              Completed (Approved) only
            </label>
            <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className={inputCls}>
              <option value="All">All people</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className={inputCls}>
              <option value="All">All vendors</option>
              {logVendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Filter by part…"
              aria-label="Filter by part"
              value={partFilter}
              onChange={(e) => setPartFilter(e.target.value)}
              className={`${inputCls} w-56 max-w-full`}
            />
            <div className="ml-auto">
              <Button variant="secondary" size="md" onClick={exportCsv} disabled={filteredLog.length === 0}>
                Export CSV
              </Button>
            </div>
          </section>

          <Card flush>
            <div className="overflow-x-auto m-tbl-wrap">
              <table className="w-full text-sm m-tbl">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <th className={thCls}>When</th>
                    <th className={thCls}>PIC / Person</th>
                    <th className={thCls}>Part</th>
                    <th className={thCls}>Vendor</th>
                    <th className={thCls}>Activity</th>
                    <th className={thCls}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pgLog.rows.map((l, i) => (
                    <tr key={`${l.templateRowId}-${l.timestamp}-${i}`} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap text-[12px] text-[var(--color-muted)]">{fmtDateTime(l.timestamp)}</td>
                      <td className="px-4 py-3 font-medium text-[#101828]">{l.person}</td>
                      <td className="px-4 py-3 text-[12px]">
                        <div>{l.partNo}</div>
                        <div className="text-[11px] text-[var(--color-muted)]">{l.partName}</div>
                      </td>
                      <td className="px-4 py-3 text-[12px]">
                        <div>{l.vendorName}</div>
                        <div className="text-[11px] text-[var(--color-muted)]">{l.vendorCode}</div>
                      </td>
                      <td className="px-4 py-3 text-[12px]">
                        {l.activityName} <span className="text-[var(--color-muted)]">({l.milestoneId})</span>
                      </td>
                      <td className="px-4 py-3 text-[12px]">
                        <span className={l.action === 'Approved' ? 'font-medium text-emerald-700' : ''}>{l.action}</span>
                        {l.comment && <div className="text-[11px] text-[var(--color-muted)]">{l.comment}</div>}
                      </td>
                    </tr>
                  ))}
                  {filteredLog.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-[var(--color-muted)]">
                        No activity matches the filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {pgLog.pager && <div className="px-4 pb-3">{pgLog.pager}</div>}
          </Card>

          {partEvents.length > 0 && (
            <Card className="mt-4" title="Part-number events">
              <ul className="space-y-1.5 text-[12px]">
                {[...partEvents]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((e) => (
                    <li key={e.id} className="flex flex-wrap gap-x-2 text-[#344054]">
                      <span className="text-[var(--color-muted)]">{fmtDateTime(e.at)}</span>
                      {e.kind === 'Created' ? (
                        <span>
                          <strong>{e.by}</strong> created dummy part <strong>{e.partNo}</strong>
                        </span>
                      ) : (
                        <span>
                          <strong>{e.by}</strong> transferred <strong>{e.fromPartNo}</strong> → <strong>{e.partNo}</strong>{' '}
                          ({e.entriesMoved} activities){e.reason ? ` — ${e.reason}` : ''}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* Add dummy part modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add dummy part"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={submitAdd} disabled={!addValid}>
              Add part
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-xs text-[var(--color-muted)]">
            Use this when SAP has no part number yet. The part is flagged as a dummy and has no PIC until one is assigned.
          </p>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Part number</span>
            <input value={np} onChange={(e) => setNp(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. DUMMY-NP1-001" />
            {dupPart && <span className="mt-1 block text-[11px] text-red-600">A part with this number already exists.</span>}
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Part name</span>
            <input value={pname} onChange={(e) => setPname(e.target.value)} className={`${inputCls} w-full`} />
          </label>
          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Model</span>
              <input list="parts-models" value={pmodel} onChange={(e) => setPmodel(e.target.value)} className={`${inputCls} w-full`} />
              <datalist id="parts-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Section</span>
              <select value={psection} onChange={(e) => setPsection(e.target.value)} className={`${inputCls} w-full`}>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Vendor</span>
              <input list="parts-vendors" value={pvendor} onChange={(e) => setPvendor(e.target.value)} className={`${inputCls} w-full`} />
              <datalist id="parts-vendors">
                {vendors.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Vendor code</span>
              <input value={pvendorCode} onChange={(e) => setPvendorCode(e.target.value)} className={`${inputCls} w-full`} />
            </label>
          </div>
          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Department</span>
              <input value={pdept} onChange={(e) => setPdept(e.target.value)} className={`${inputCls} w-full`} />
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Type</span>
              <select value={ptype} onChange={(e) => setPtype(e.target.value as 'NewPart' | 'ECN')} className={`${inputCls} w-full`}>
                <option value="NewPart">New Part</option>
                <option value="ECN">ECN</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">PIC (optional)</span>
            <input
              list="parts-pics"
              value={ppic}
              onChange={(e) => setPpic(e.target.value)}
              className={`${inputCls} w-full`}
              placeholder="Assign a person-in-charge for this dummy part"
            />
            <datalist id="parts-pics">
              {knownPics.map((p) => <option key={p} value={p} />)}
            </datalist>
            <span className="mt-1 block text-[11px] text-[var(--color-muted)]">
              Dummy parts are flagged with a "Dummy" badge. Add the PIC now, or assign later from PIC Assignments.
            </span>
          </label>
        </div>
      </Modal>

      {/* ECN transfer modal */}
      <Modal
        open={xfer !== null}
        onClose={() => setXfer(null)}
        title={xfer ? `ECN transfer — ${xfer.partNo}` : undefined}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setXfer(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={submitXfer} disabled={!xferValid}>
              Transfer history
            </Button>
          </>
        }
      >
        {xfer && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-[var(--color-muted)]">
              Moves this part's history and in-progress activities ({xferEntryCount}) to the revised part number. The old
              part is then retired and only the new number is tracked.
            </p>
            <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] text-[#344054]">
              ECN transfer stays within the same vendor: <strong>{xfer.vendorName}</strong>. The revised part must belong to this vendor.
            </p>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">New (revised) part number</span>
              <input value={toNo} onChange={(e) => setToNo(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. 31100-M74LD9" />
              {toNo.trim() === xfer.partNo && (
                <span className="mt-1 block text-[11px] text-red-600">The new number must differ from the old one.</span>
              )}
              {vendorMismatch && (
                <span className="mt-1 block text-[11px] text-red-600">
                  {toTarget!.partNo} belongs to {toTarget!.vendorName}, not {xfer.vendorName}. ECN transfer is only allowed within the same vendor.
                </span>
              )}
              {toExists && !vendorMismatch && toNo.trim() !== xfer.partNo && (
                <span className="mt-1 block text-[11px] text-amber-700">
                  This part already exists (same vendor) — history will be merged onto it (existing entries are kept).
                </span>
              )}
              {!toExists && toNo.trim() && (
                <span className="mt-1 block text-[11px] text-[var(--color-muted)]">
                  New part will be created under {xfer.vendorName}.
                </span>
              )}
            </label>
            {!toExists && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">New part name (optional)</span>
                <input
                  value={toName}
                  onChange={(e) => setToName(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder={xfer.partName}
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Reason / ECN reference (optional)</span>
              <input value={xreason} onChange={(e) => setXreason(e.target.value)} className={`${inputCls} w-full`} />
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
