import { useEffect, useMemo, useState } from 'react'

/**
 * Mobile layer (≤ 860px) — same breakpoint and patterns as the MSIL Activity Dashboards:
 * slide-in nav drawer, filters in a bottom sheet, tables that scroll sideways with a frozen
 * first column, and pagination instead of very long tables. Desktop (> 860px) is untouched:
 * every helper here is a no-op above the breakpoint.
 */
export const MOBILE_QUERY = '(max-width: 860px)'

export function useIsMobile(): boolean {
  const get = () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  const [m, setM] = useState(get)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const on = () => setM(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

/* ── Pagination ─────────────────────────────────────────────────────────── */

interface PagerProps {
  page: number
  pages: number
  from: number
  to: number
  total: number
  onPage: (p: number) => void
  noun?: string
}

/** "Showing 1–10 of 46" + ‹ 1 2 3 › — the Activity Dashboard pager. */
export function Pager({ page, pages, from, to, total, onPage, noun = '' }: PagerProps) {
  if (pages <= 1) return null
  // compact page list: first, last, current ±1
  const nums: (number | '…')[] = []
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  const btn = 'flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-[13px] font-medium'
  return (
    <div className="m-pager mt-3 flex flex-wrap items-center justify-between gap-2" role="navigation" aria-label="Table pages">
      <span className="text-[12px] text-[var(--color-muted)]">
        Showing {from}–{to} of {total}{noun ? ` ${noun}` : ''}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className={`${btn} border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] disabled:opacity-40`}
          onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">‹</button>
        {nums.map((n, i) => n === '…'
          ? <span key={'e' + i} className="px-1 text-[12px] text-[var(--color-muted)]">…</span>
          : <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}
              className={`${btn} ${n === page ? 'border-[#bfdbfe] bg-[var(--color-secondary)] text-[var(--color-primary)]' : 'border-[var(--color-border)] bg-white text-[var(--color-ink-muted)]'}`}>{n}</button>)}
        <button type="button" className={`${btn} border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] disabled:opacity-40`}
          onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">›</button>
      </div>
    </div>
  )
}

/**
 * Mobile-only pagination. On desktop it returns every row and no pager (unchanged behaviour).
 * The page resets to 1 whenever the row set changes (search, filters, sorting), so pagination
 * always works on top of the existing table logic.
 */
export function useMobilePage<T>(rows: T[], pageSize = 10, noun = '') {
  const mobile = useIsMobile()
  const [page, setPage] = useState(1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const k = (r: any): string => String(r?.id ?? r?.row?.id ?? r?.part?.id ?? r?.partNumber ?? r?.key ?? '')
  const sig = rows.length + ':' + (rows.length ? k(rows[0]) + '|' + k(rows[rows.length - 1]) : '')
  useEffect(() => { setPage(1) }, [sig, mobile])
  return useMemo(() => {
    if (!mobile || rows.length <= pageSize) return { rows, pager: null as React.ReactNode, mobile }
    const pages = Math.ceil(rows.length / pageSize)
    const p = Math.min(page, pages)
    const start = (p - 1) * pageSize
    const pager = (
      <Pager page={p} pages={pages} from={start + 1} to={Math.min(start + pageSize, rows.length)} total={rows.length} noun={noun}
        onPage={(n) => setPage(Math.max(1, Math.min(pages, n)))} />
    )
    return { rows: rows.slice(start, start + pageSize), pager, mobile }
  }, [rows, page, pageSize, mobile, noun])
}

/* ── Bottom sheet ───────────────────────────────────────────────────────── */

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
}

/** Bottom sheet: handle, title, close, scrollable body, sticky footer (Activity Dashboard filter sheet). */
export function BottomSheet({ open, onClose, title, children, footer }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])
  return (
    <>
      <div className={`m-sheet-scrim ${open ? 'open' : ''}`} onClick={onClose} aria-hidden="true" />
      <div className={`m-sheet ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label={title} aria-hidden={!open}>
        <div className="m-sheet-handle" />
        <div className="m-sheet-head">
          <h3>{title}</h3>
          <button type="button" className="m-sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="m-sheet-body">{open ? children : null}</div>
        {footer && <div className="m-sheet-foot">{footer}</div>}
      </div>
    </>
  )
}

/* ── Filters → bottom sheet ─────────────────────────────────────────────── */

interface MobileFiltersProps {
  children: React.ReactNode
  /** Number of active (non-default) filters, shown as a badge on the button. */
  count?: number
  onClear?: () => void
  label?: string
  /** Extra controls that stay on the page next to the Filters button (e.g. search). */
  inline?: React.ReactNode
  className?: string
}

/**
 * Desktop: renders `inline` + `children` exactly as before (wrapped in a `contents` div, so layout is unchanged).
 * Mobile: `inline` stays on the page; the filter controls move into a bottom sheet behind a "Filters" button.
 */
export function MobileFilters({ children, count = 0, onClear, label = 'Filters', inline, className = '' }: MobileFiltersProps) {
  const mobile = useIsMobile()
  const [open, setOpen] = useState(false)
  if (!mobile) return <div className="contents">{inline}{children}</div>
  return (
    <>
      <div className={`m-filter-row flex w-full items-center gap-2 ${className}`}>
        {inline && <div className="min-w-0 flex-1">{inline}</div>}
        <button type="button" onClick={() => setOpen(true)}
          className="m-filter-btn ml-auto inline-flex h-10 flex-none items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-white px-3.5 text-[13px] font-semibold text-[var(--color-text)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
          {label}
          {count > 0 && <span className="rounded-full bg-[var(--color-primary)] px-1.5 text-[11px] leading-[18px] text-white">{count}</span>}
        </button>
      </div>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}
        footer={<>
          {onClear && <button type="button" className="m-sheet-btn" onClick={onClear}>Clear all</button>}
          <button type="button" className="m-sheet-btn primary" onClick={() => setOpen(false)}>Show results</button>
        </>}>
        <div className="m-filter-stack">{children}</div>
      </BottomSheet>
    </>
  )
}
