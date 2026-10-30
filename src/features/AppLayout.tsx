import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { PersonaSwitcher } from '../components/PersonaSwitcher'
import { usePersonaStore } from '../store/personaStore'
import type { PersonaId } from '../store/personaStore'
import { DemoTour } from './home/DemoTour'
import epmpLogo from '../assets/epmp-logo.png'
import epmpSub from '../assets/epmp-sub.png'

export interface AppOutletContext {
  startTour: () => void
}

const ico = (d: React.ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d6daf5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
)

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  group: string
  tour: string
  /** If set, only show this item when the current persona is in this list. */
  roles?: PersonaId[]
}

// Icons follow EPMP's 20px outline set (stroke #d6daf5 on the indigo sidebar).
const NAV_ITEMS: NavItem[] = [
  { to: '/',           label: 'Home',       group: 'Workspace', tour: 'nav-home',
    icon: ico(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>) },
  { to: '/mywork',     label: 'My Work',    group: 'Workspace', tour: 'nav-mywork',
    roles: ['Vendor', 'PIC', 'SIC', 'DPM'],
    icon: ico(<><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h9" /></>) },
  { to: '/activities', label: 'Activities', group: 'Workspace', tour: 'nav-activities',
    icon: ico(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>) },
  { to: '/part-workspace', label: 'Part Workspace', group: 'Workspace', tour: 'nav-part-workspace',
    roles: ['PIC', 'SIC', 'DPM'],
    icon: ico(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h10M7 12h7M7 16h4" /><path d="M16 14l2 2 3-3" /></>) },
  { to: '/bulk-entry', label: 'Bulk Entry Grid', group: 'Workspace', tour: 'nav-bulk-entry',
    roles: ['PIC', 'SIC', 'DPM'],
    icon: ico(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>) },
  { to: '/models',     label: 'Models & MRDs', group: 'Modules', tour: 'nav-models',
    roles: ['ModelCoordinator', 'Admin'],
    icon: ico(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h6M7 16h4" /></>) },
  { to: '/template',   label: 'Section Template', group: 'Modules', tour: 'nav-template',
    roles: ['SectionAdmin', 'Admin'],
    icon: ico(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 17h7M17 14v7" /></>) },
  { to: '/pics',       label: 'PIC Assignments', group: 'Modules', tour: 'nav-pics',
    roles: ['SIC', 'DPM', 'SectionAdmin', 'PIC', 'Admin'],
    icon: ico(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M17 8h4M19 6v4" /></>) },
  { to: '/applicability', label: 'Applicability', group: 'Modules', tour: 'nav-applicability',
    roles: ['PIC', 'SIC', 'Admin'],
    icon: ico(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /><path d="M12 13l3 3M15 13l-3 3" /></>) },
  { to: '/parts',      label: 'Parts & Audit', group: 'Modules', tour: 'nav-parts',
    roles: ['PIC', 'SIC', 'DPM', 'SectionAdmin', 'Admin'],
    icon: ico(<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>) },
  { to: '/manpower',   label: 'Manpower Planning', group: 'Modules', tour: 'nav-manpower',
    roles: ['PIC', 'SIC', 'DPM', 'Admin'],
    icon: ico(<><circle cx="9" cy="7" r="3" /><path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6" /><path d="M17 11l2 2 4-4" /></>) },
  { to: '/deviations', label: 'Deviation Tracker', group: 'Modules', tour: 'nav-deviations',
    roles: ['PIC', 'SIC', 'DPM', 'Admin'],
    icon: ico(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>) },
  { to: '/lessons', label: 'Lessons Learnt', group: 'Modules', tour: 'nav-lessons',
    roles: ['PIC', 'SIC', 'DPM', 'Admin'],
    icon: ico(<><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" /><path d="M9 21h6M10 17v4M14 17v4" /></>) },
  { to: '/wbs', label: 'WBS / Project', group: 'Project', tour: 'nav-wbs',
    roles: ['SIC', 'DPM', 'ModelCoordinator', 'Admin'],
    icon: ico(<><rect x="3" y="3" width="7" height="5" rx="1" /><path d="M6.5 8v4M6.5 12h11M12 12v4M17.5 12v4" /><rect x="3" y="16" width="7" height="5" rx="1" /><rect x="14" y="16" width="7" height="5" rx="1" /></>) },
  { to: '/dependencies', label: 'Activity Dependencies', group: 'Project', tour: 'nav-dependencies',
    roles: ['DPM', 'ModelCoordinator', 'Admin'],
    icon: ico(<><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M5 8v4a2 2 0 0 0 2 2h3M19 8v4a2 2 0 0 1-2 2h-3" /></>) },
  { to: '/builder',    label: 'Builder',    group: 'Modules',   tour: 'nav-builder',
    icon: ico(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>) },
  { to: '/dashboards', label: 'Dashboards', group: 'Modules',   tour: 'nav-dashboards',
    icon: ico(<path d="M4 21V9M12 21V3M20 21v-6" />) },
  { to: '/settings',   label: 'Settings',   group: 'Admin',     tour: 'nav-settings',
    roles: ['Admin'],
    icon: ico(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></>) },
]

export function AppLayout() {
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // The tour lives here (not in HomePage) so it survives the route changes it triggers.
  const [tourOpen, setTourOpen] = useState(false)
  const currentPersona = usePersonaStore((s) => s.currentPersona)

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(currentPersona)
  )

  let lastGroup: string | null = null

  return (
    <div className="epmp-shell flex h-screen overflow-hidden">
      {/* Mobile scrim */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-[rgba(2,6,23,.3)] lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={`z-50 flex flex-none flex-col bg-[var(--color-nav-bg)] text-white shadow-[3px_0_4px_#e6ced2] transition-all duration-200
          fixed inset-y-0 left-0 w-[min(288px,85vw)] lg:w-[248px] ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:translate-x-0 ${navCollapsed ? 'lg:w-[76px]' : 'lg:w-[248px] xl:w-[272px]'}`}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-white/[.12] text-white lg:hidden"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <NavLink
          to="/"
          aria-label="EPMP home"
          onClick={() => setMobileOpen(false)}
          className="flex h-[137px] flex-none flex-col items-center justify-center border-b border-white/[.12] px-5 max-[860px]:h-[104px]"
        >
          {navCollapsed ? (
            <span className="text-xl font-bold tracking-wide">EP</span>
          ) : (
            <>
              <img src={epmpLogo} alt="EPMP" className="h-auto w-full max-w-[210px]" />
              <img src={epmpSub} alt="Powered by DE" className="mt-2 h-auto w-[150px] max-w-[85%]" />
            </>
          )}
        </NavLink>

        <nav className="min-h-0 flex-1 overflow-y-auto py-4" aria-label="Main navigation">
          {visibleItems.map((item) => {
            const showGroup = item.group !== lastGroup
            lastGroup = item.group
            return (
              <div key={item.to}>
                {showGroup && !navCollapsed && <p className="sb-group-label">{item.group}</p>}
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  data-tour={item.tour}
                  title={navCollapsed ? item.label : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `sb-item ${isActive ? 'active' : ''} ${navCollapsed ? 'justify-center !px-0' : ''}`}
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex h-[22px] w-[22px] flex-none items-center justify-center opacity-95">{item.icon}</span>
                      {!navCollapsed && <span className="flex-1 whitespace-nowrap">{item.label}</span>}
                      {!navCollapsed && isActive && (
                        <svg className="opacity-85" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      )}
                    </>
                  )}
                </NavLink>
              </div>
            )
          })}
        </nav>

        <div className="flex flex-none flex-col gap-3 border-t border-white/[.12] px-5 py-[18px]">
          <button
            type="button"
            onClick={() => setNavCollapsed((v) => !v)}
            aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="hidden items-center gap-3 text-[11px] text-[#dadcfb] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 lg:flex"
          >
            <svg width="16" height="12" viewBox="0 0 42 32" fill="#f0f7fd" aria-hidden="true">
              <path d="M9.52 18.92a1.5 1.5 0 01-1.06-.44L.55 10.76a1.5 1.5 0 010-2.1L8.17.46a1.5 1.5 0 112.17 2.08L4.6 9.4l6.26 6.26a1.5 1.5 0 01-1.34 2.26z" />
              <path d="M20.9 11.3H1.9a1.9 1.9 0 010-3.8h19a1.9 1.9 0 010 3.8z" />
              <rect x="11.4" y="18.9" width="30.5" height="3.8" rx="1.9" />
              <rect x="11.4" y="28.4" width="30.5" height="3.8" rx="1.9" />
            </svg>
            {!navCollapsed && <span>Collapse navigation</span>}
          </button>
          {!navCollapsed && (
            <p className="m-0 text-[9px] leading-[14px] text-[#aeb2e8]">
              QA Activity Tracker<br />Configurable activities · one source of record
            </p>
          )}
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="mx-4 flex min-h-[98px] flex-none flex-wrap items-center gap-3.5 py-3.5 lg:mx-7 max-[860px]:mx-0 max-[860px]:min-h-[60px] max-[860px]:flex-nowrap max-[860px]:gap-2.5 max-[860px]:border-b max-[860px]:border-[var(--color-border)] max-[860px]:bg-white/80 max-[860px]:px-4 max-[860px]:py-2.5">
          <button
            type="button"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-[var(--color-border)] bg-white lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[10px] text-[var(--color-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            <span>Prototype · mock data · no backend</span>
          </div>

          <div className="ml-auto flex flex-none items-center gap-3 sm:gap-5" data-tour="persona-switcher">
            <PersonaSwitcher />
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-y-auto px-4 pb-7 pt-1 lg:px-7 max-[860px]:pt-3.5">
          <Outlet context={{ startTour: () => setTourOpen(true) } satisfies AppOutletContext} />
          <p className="m-only mt-6 text-center text-[11px] leading-5 text-[var(--color-muted)]">
            QA Activity Tracker · EPMP design language<br />Prototype data · Light mode
          </p>
        </main>

        <footer className="m-hide flex flex-none flex-wrap items-center justify-between gap-2 px-4 pb-4 pt-1 text-[10px] text-[var(--color-muted)] lg:px-7">
          <span>QA Activity Tracker · EPMP design language</span>
          <span>Prototype data · Light mode</span>
        </footer>
      </div>

      {tourOpen && <DemoTour onClose={() => setTourOpen(false)} />}
    </div>
  )
}
