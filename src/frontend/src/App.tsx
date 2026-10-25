import { useEffect, useRef, useState } from 'react'
import { listApplications, type LoanDraft } from './api/applications'
import { Header, Sidebar, type Role, type Scenario, type Screen } from './components/Shell'
import { Dashboard } from './screens/Dashboard'
import { Tracker } from './screens/Tracker'
import { Underwriter } from './screens/Underwriter'
import { Wizard } from './screens/Wizard'

const titles: Record<Screen, string> = {
  dashboard: 'Личный кабинет предпринимателя',
  wizard: 'Подача заявки',
  tracker: 'Статус заявки и решение банка',
  underwriter: 'Конвейер банка и скоринг',
}

const frames: { screen: Screen; role: Role; n: number }[] = [
  { screen: 'dashboard', role: 'client', n: 1 },
  { screen: 'wizard', role: 'client', n: 2 },
  { screen: 'tracker', role: 'client', n: 3 },
  { screen: 'underwriter', role: 'bank', n: 4 },
]

const starter: LoanDraft = {
  purpose: 'Пополнение оборотных средств',
  amount: 12_000_000,
  termMonths: 24,
}

function AppFrame({
  role,
  screen,
  scenario,
  draft,
  applicationNumber,
  bankQueue,
  clientCount,
  focusNumber,
  focusTick,
  onBankQueue,
  onClientCount,
  onApply,
  onOpenApp,
  onSubmitted,
  onRole,
  onScenario,
  go,
  overview,
  onOverview,
  onOpenNotice,
  fill,
}: {
  role: Role
  screen: Screen
  scenario: Scenario
  draft: LoanDraft
  applicationNumber: number | null
  bankQueue: number | null
  clientCount: number | null
  focusNumber: number | null
  focusTick: number
  onBankQueue: (count: number) => void
  onClientCount: (count: number) => void
  onApply: (draft: LoanDraft) => void
  onOpenApp: (number: number) => void
  onSubmitted: (number: number) => void
  onRole: (r: Role) => void
  onScenario: (s: Scenario) => void
  go: (s: Screen) => void
  overview?: boolean
  onOverview?: () => void
  onOpenNotice: (number: number) => void
  fill?: boolean
}) {
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [screen])

  return (
    <div className={fill ? 'flex h-screen' : 'flex min-h-[960px]'}>
      <Sidebar role={role} screen={screen} queueCount={bankQueue} applicationCount={clientCount} onNavigate={go} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          role={role}
          onRole={onRole}
          scenario={scenario}
          onScenario={onScenario}
          title={titles[screen]}
          overview={overview}
          onOverview={onOverview}
          onOpenNotice={onOpenNotice}
        />
        <main ref={mainRef} className={fill ? 'flex-1 overflow-y-auto' : 'flex-1'}>
          {screen === 'dashboard' && (
            <div className="mx-auto max-w-[1280px] px-8 py-8">
              <Dashboard onApply={onApply} onOpenApp={onOpenApp} onCount={onClientCount} />
            </div>
          )}
          {screen === 'wizard' && (
            <div className="mx-auto max-w-[1280px] px-8 py-8">
              <Wizard key={`${draft.purpose}:${draft.amount}:${draft.termMonths}`} initial={draft} onSubmit={onSubmitted} />
            </div>
          )}
          {screen === 'tracker' && (
            <div className="mx-auto max-w-[1280px] px-8 py-8">
              <Tracker scenario={scenario} applicationNumber={applicationNumber} />
            </div>
          )}
          {screen === 'underwriter' && (
            <div className="mx-auto max-w-[1280px] px-8 py-8">
              <Underwriter key={`${focusNumber ?? 'queue'}:${focusTick}`} onCount={onBankQueue} focusNumber={focusNumber} />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function Overview({
  scenario,
  onClose,
  onOpen,
}: {
  scenario: Scenario
  onClose: () => void
  onOpen: (screen: Screen, role: Role) => void
}) {
  const noop = () => {}

  return (
    <div className="flex h-screen flex-col bg-[#E9EBEE]">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-white px-8">
        <div className="text-[15px] font-semibold text-ink">Умный кредитный кабинет · 4 экрана · 1440px</div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-ink hover:bg-canvas"
        >
          Вернуться в приложение
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="flex w-max items-start gap-10 p-10">
          {frames.map((frame) => (
            <div key={frame.screen} className="shrink-0">
              <button
                type="button"
                onClick={() => onOpen(frame.screen, frame.role)}
                className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-muted hover:text-ink"
              >
                <span className="tnum grid size-6 place-items-center rounded-full bg-ink text-xs font-semibold text-white">
                  {frame.n}
                </span>
                <span className="font-semibold text-ink">{titles[frame.screen]}</span>
              </button>
              <div className="overflow-hidden rounded-xl border border-line bg-canvas shadow-[0_8px_24px_-12px_rgb(11_31_53/0.2)]">
                <div style={{ width: 1440, zoom: 0.5 }}>
                  <AppFrame
                    role={frame.role}
                    screen={frame.screen}
                    scenario={scenario}
                    draft={starter}
                    applicationNumber={null}
                    bankQueue={null}
                    clientCount={null}
                    focusNumber={null}
                    focusTick={0}
                    onBankQueue={noop}
                    onClientCount={noop}
                    onApply={noop}
                    onOpenApp={noop}
                    onSubmitted={noop}
                    onRole={noop}
                    onScenario={noop}
                    go={noop}
                    onOpenNotice={noop}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [role, setRole] = useState<Role>('client')
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [scenario, setScenario] = useState<Scenario>('counter')
  const [overview, setOverview] = useState(false)
  const [draft, setDraft] = useState<LoanDraft>(starter)
  const [applicationNumber, setApplicationNumber] = useState<number | null>(null)
  const [bankQueue, setBankQueue] = useState<number | null>(null)
  const [clientCount, setClientCount] = useState<number | null>(null)
  const [focusNumber, setFocusNumber] = useState<number | null>(null)
  const [focusTick, setFocusTick] = useState(0)

  useEffect(() => {
    if (applicationNumber == null) return
    let cancel = false
    listApplications()
      .then((rows) => {
        if (!cancel) setClientCount(rows.length)
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [applicationNumber])

  const switchRole = (next: Role) => {
    setRole(next)
    setScreen(next === 'bank' ? 'underwriter' : 'dashboard')
  }

  if (overview) {
    return (
      <Overview
        scenario={scenario}
        onClose={() => setOverview(false)}
        onOpen={(nextScreen, nextRole) => {
          setRole(nextRole)
          setScreen(nextScreen)
          setOverview(false)
        }}
      />
    )
  }

  return (
    <AppFrame
      fill
      role={role}
      screen={screen}
      scenario={scenario}
      draft={draft}
      applicationNumber={applicationNumber}
      bankQueue={bankQueue}
      clientCount={clientCount}
      focusNumber={focusNumber}
      focusTick={focusTick}
      onBankQueue={setBankQueue}
      onClientCount={setClientCount}
      onApply={(next) => {
        setDraft(next)
        setScreen('wizard')
      }}
      onOpenApp={(number) => {
        setApplicationNumber(number)
        setScreen('tracker')
      }}
      onSubmitted={(number) => {
        setApplicationNumber(number)
        setScreen('tracker')
      }}
      onRole={switchRole}
      onScenario={(next) => {
        setScenario(next)
        setApplicationNumber(null)
        if (role === 'client') setScreen('tracker')
      }}
      go={setScreen}
      overview={overview}
      onOverview={() => setOverview(true)}
      onOpenNotice={(number) => {
        if (role === 'bank') {
          setFocusNumber(number)
          setFocusTick((tick) => tick + 1)
          setScreen('underwriter')
        } else {
          setApplicationNumber(number)
          setScreen('tracker')
        }
      }}
    />
  )
}
