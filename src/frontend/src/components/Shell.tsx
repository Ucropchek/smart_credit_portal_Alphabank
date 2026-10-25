import { useEffect, useRef, useState, type ReactNode } from 'react'
import { listApplications, listStatus, type ApplicationListItem } from '../api/applications'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type Role = 'client' | 'bank'
export type Screen = 'dashboard' | 'wizard' | 'tracker' | 'underwriter'
export type Scenario = 'counter' | 'approved' | 'clarify'

const scenarios: { id: Scenario; label: string; hint: string }[] = [
  { id: 'counter', label: 'Встречное предложение', hint: 'Банк одобрил на других условиях' },
  { id: 'clarify', label: 'Запрос уточнения', hint: 'Нужна выписка по счёту' },
  { id: 'approved', label: 'Полное одобрение', hint: 'Условия совпадают с запросом' },
]

const clientNav: { id: Screen; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Главная', icon: 'home' },
  { id: 'wizard', label: 'Новая заявка', icon: 'file' },
  { id: 'tracker', label: 'Мои заявки', icon: 'pulse' },
]

const bankNav: { id: Screen; label: string; icon: IconName }[] = [
  { id: 'underwriter', label: 'Конвейер заявок', icon: 'briefcase' },
]

function AlfaMark({ size = 32 }: { size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-[10px] bg-alfa text-white"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.5} height={size * 0.6} viewBox="0 0 20 24" fill="currentColor">
        <path d="M10 0c1.6 0 2.5 1 3 2.5L19 20h-3.9l-1.4-4.3H6.2L4.8 20H1L7 2.5C7.5 1 8.4 0 10 0zm0 4.3L7.3 12.6h5.4zM1 21.5h18V24H1z" />
      </svg>
    </div>
  )
}

export function Sidebar({
  role,
  screen,
  queueCount,
  applicationCount,
  onNavigate,
}: {
  role: Role
  screen: Screen
  queueCount?: number | null
  applicationCount?: number | null
  onNavigate: (s: Screen) => void
}) {
  const nav = role === 'client' ? clientNav : bankNav
  const secondary: { label: string; icon: IconName }[] =
    role === 'client'
      ? [
          { label: 'Счета и платежи', icon: 'wallet' },
          { label: 'Документы', icon: 'docs' },
          { label: 'Чат с банком', icon: 'chat' },
        ]
      : [
          { label: 'Портфель клиентов', icon: 'building' },
          { label: 'Отчёты по рискам', icon: 'trendUp' },
          { label: 'Политики скоринга', icon: 'shield' },
        ]

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-line bg-white">
      <div className="flex h-[72px] items-center gap-3 px-6">
        <AlfaMark />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-ink">Умный кабинет</div>
          <div className="text-xs text-muted">
            {role === 'client' ? 'для предпринимателя' : 'кредитного эксперта'}
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 pt-4">
        <div className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          Кредитование
        </div>
        {nav.map((item) => {
          const active = screen === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={cx(
                'relative mb-0.5 flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                active ? 'bg-canvas text-ink' : 'text-muted hover:bg-canvas/60 hover:text-ink',
              )}
            >
              {active && (
                <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-alfa" />
              )}
              <Icon name={item.icon} className={active ? 'text-alfa' : ''} />
              {item.label}
              {item.id === 'tracker' && applicationCount != null && (
                <span className="tnum ml-auto rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                  {applicationCount}
                </span>
              )}
              {item.id === 'underwriter' && queueCount != null && (
                <span className="tnum ml-auto rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                  {queueCount}
                </span>
              )}
            </button>
          )
        })}
        <div className="mt-6 px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          Сервисы
        </div>
        {secondary.map((item) => (
          <div
            key={item.label}
            className="mb-0.5 flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted"
          >
            <Icon name={item.icon} />
            {item.label}
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-2xl border border-line p-4">
        {role === 'client' ? (
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-sm font-semibold text-white">
              ДА
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-ink">ООО «Демо-альфа»</div>
              <div className="tnum mt-0.5 text-xs text-muted">ИНН 7701990013</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-sm font-semibold text-ink">
              АС
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-ink">Анна Соколова</div>
              <div className="mt-0.5 text-xs text-muted">Кредитный эксперт, МСБ</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function ScenarioSelect({
  value,
  onChange,
}: {
  value: Scenario
  onChange: (s: Scenario) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const current = scenarios.find((item) => item.id === value) ?? scenarios[0]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white pr-3 pl-3.5 text-[13px] hover:bg-canvas"
      >
        <Icon name="sparkle" size={16} className="text-muted" />
        <span className="text-muted">Сценарий:</span>
        <span className="font-semibold text-ink">{current.label}</span>
        <Icon name="chevronDown" size={16} className="text-muted" />
      </button>
      {open && (
        <div className="animate-fade-up absolute top-12 right-0 z-30 w-[300px] rounded-2xl border border-line bg-white p-1.5 shadow-[0_12px_32px_-12px_rgb(11_31_53/0.18)]">
          <div className="px-3 pt-2 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Тестовый сценарий
          </div>
          {scenarios.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChange(item.id)
                setOpen(false)
              }}
              className="flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-canvas"
            >
              <span
                className={cx(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
                  item.id === value ? 'border-alfa' : 'border-line',
                )}
              >
                {item.id === value && <span className="size-2 rounded-full bg-alfa" />}
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">{item.label}</span>
                <span className="block text-xs text-muted">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function notices(role: Role, rows: ApplicationListItem[]) {
  const items: { key: string; number: number; title: string; text: string }[] = []
  for (const row of rows) {
    const openCount = row.openRequestCount ?? 0
    if (role === 'client') {
      if (openCount > 0) {
        items.push({
          key: `${row.number}-question`,
          number: row.number,
          title: `Заявка #${row.number}`,
          text: openCount === 1 ? 'Банк ждёт ответ на вопрос' : `Банк ждёт ответы: ${openCount}`,
        })
      }
      if (row.employeeDecision) {
        const status = listStatus(row.employeeDecision, row.stepTitle)
        items.push({
          key: `${row.number}-decision`,
          number: row.number,
          title: `Заявка #${row.number}`,
          text: `Решение банка: ${status.label}`,
        })
      }
    } else if (!row.employeeDecision) {
      items.push({
        key: `${row.number}-open`,
        number: row.number,
        title: `Заявка #${row.number}`,
        text: `${row.businessName ?? 'Компания'} · ${row.stepTitle}`,
      })
    }
  }
  return items
}

export function Header({
  role,
  onRole,
  scenario,
  onScenario,
  title,
  overview,
  onOverview,
  onOpenNotice,
}: {
  role: Role
  onRole: (r: Role) => void
  scenario: Scenario
  onScenario: (s: Scenario) => void
  title: ReactNode
  overview?: boolean
  onOverview?: () => void
  onOpenNotice?: (number: number) => void
}) {
  const [rows, setRows] = useState<ApplicationListItem[] | null>(null)
  const [open, setOpen] = useState(false)
  const items = rows ? notices(role, rows) : []

  useEffect(() => {
    let cancel = false
    let seen = false
    const load = () => {
      listApplications()
        .then((list) => {
          if (cancel) return
          seen = true
          setRows(list)
        })
        .catch(() => {
          if (!cancel && !seen) setRows([])
        })
    }
    load()
    const timer = window.setInterval(load, 8000)
    return () => {
      cancel = true
      window.clearInterval(timer)
    }
  }, [role, open])
  return (
    <header className="flex h-[72px] shrink-0 items-center gap-6 border-b border-line bg-white px-8">
      <div className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{title}</div>

      <div className="flex rounded-xl bg-canvas p-1" role="tablist" aria-label="Режим демо">
        {(
          [
            ['client', 'Предприниматель', 'user'],
            ['bank', 'Кредитный эксперт (Банк)', 'building'],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={role === id}
            onClick={() => onRole(id)}
            className={cx(
              'flex h-9 cursor-pointer items-center gap-2 rounded-[10px] px-4 text-[13px] font-medium transition-all',
              role === id
                ? 'bg-white text-ink shadow-[0_1px_2px_rgb(11_31_53/0.08)] ring-1 ring-line'
                : 'text-muted hover:text-ink',
            )}
          >
            <Icon name={icon} size={16} className={role === id ? 'text-alfa' : ''} />
            <span className="text-muted">Режим:</span> {label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        <ScenarioSelect value={scenario} onChange={onScenario} />
        {onOverview && (
          <button
            type="button"
            onClick={onOverview}
            title="Все экраны рядом"
            className={cx(
              'flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[13px] font-medium',
              overview ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:bg-canvas',
            )}
          >
            <Icon name="grid" size={16} />
            Все экраны
          </button>
        )}
        <div className="relative">
          {open && (
            <button
              type="button"
              aria-label="Закрыть уведомления"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setOpen(false)}
            />
          )}
          <button
            type="button"
            aria-label="Уведомления"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="relative z-20 grid size-10 cursor-pointer place-items-center rounded-xl border border-line bg-white text-ink hover:bg-canvas"
          >
            <Icon name="bell" size={18} />
            {items.length > 0 && (
              <span className="tnum absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-alfa px-1 text-[11px] font-semibold text-white">
                {items.length}
              </span>
            )}
          </button>
          {open && (
            <div className="absolute top-12 right-0 z-20 w-80 rounded-2xl border border-line bg-white p-2 shadow-[0_12px_32px_-16px_rgb(11_31_53/0.35)]">
              {rows == null && <p className="px-3 py-4 text-sm text-muted">Загружаем…</p>}
              {rows && items.length === 0 && <p className="px-3 py-4 text-sm text-muted">Сейчас ничего не требует внимания</p>}
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onOpenNotice?.(item.number)
                  }}
                  className="block w-full cursor-pointer rounded-xl px-3 py-3 text-left hover:bg-canvas"
                >
                  <div className="text-sm font-semibold text-ink">{item.title}</div>
                  <div className="mt-0.5 text-sm text-muted">{item.text}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
