import type { ApplicationDetail, RegistrySnapshot } from '../api/applications'
import { rub, ruDate } from '../format'
import { Badge, Card, CardHeader } from './ui'

function registryMoney(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function registryCount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function fnsLine(amount: string, date: string | null | undefined) {
  const when = ruDate(date)
  return when ? `ФНС на ${when}: ${amount}` : `ФНС: ${amount}`
}

export function FinancesCard({
  finances,
  amount,
  subtitle,
  registry,
}: {
  finances: NonNullable<ApplicationDetail['finances']>
  amount: number
  subtitle: string
  registry?: RegistrySnapshot['fns'] | null
}) {
  const revenue = finances.annualRevenue
  const obligations = finances.obligations
  const fnsRevenue = registryMoney(registry?.revenue)
  const fnsExpenses = registryMoney(registry?.expenses)
  const fnsStaff = registryCount(registry?.employeeCount)
  const load =
    revenue != null && revenue > 0 && obligations != null ? Math.round(((obligations + amount) / revenue) * 100) : null
  const loadLabel = load == null ? null : load < 25 ? 'Низкая' : load < 40 ? 'Умеренная' : 'Высокая'

  return (
    <Card className="p-8">
      <CardHeader
        title="Финансы из заявки"
        subtitle={subtitle}
        action={
          load != null && loadLabel ? (
            <Badge tone={load < 25 ? 'ok' : load < 40 ? 'warn' : 'danger'}>
              Нагрузка {load}% · {loadLabel}
            </Badge>
          ) : undefined
        }
      />
      <dl className="mt-6 grid grid-cols-3 gap-x-10 gap-y-4 text-sm">
        {revenue != null && (
          <div>
            <dt className="text-muted">Годовая выручка</dt>
            <dd className="tnum mt-1 text-lg font-semibold text-ink">{rub(revenue)}</dd>
            {fnsRevenue != null && <dd className="tnum mt-1 text-xs text-muted">{fnsLine(rub(fnsRevenue), registry?.revenueDate)}</dd>}
          </div>
        )}
        {obligations != null && (
          <div>
            <dt className="text-muted">Текущие обязательства</dt>
            <dd className="tnum mt-1 text-lg font-semibold text-ink">{rub(obligations)}</dd>
          </div>
        )}
        {fnsExpenses != null && (
          <div>
            <dt className="text-muted">Расходы по ФНС</dt>
            <dd className="tnum mt-1 text-lg font-semibold text-ink">{rub(fnsExpenses)}</dd>
            {registry?.revenueDate && <dd className="mt-1 text-xs text-muted">на {ruDate(registry.revenueDate)}</dd>}
          </div>
        )}
        {(finances.employees != null || fnsStaff != null) && (
          <div>
            <dt className="text-muted">Сотрудников</dt>
            <dd className="tnum mt-1 text-lg font-semibold text-ink">
              {finances.employees != null ? finances.employees.toLocaleString('ru-RU') : 'Не указано'}
            </dd>
            {fnsStaff != null && (
              <dd className="tnum mt-1 text-xs text-muted">{fnsLine(fnsStaff.toLocaleString('ru-RU'), registry?.employeeCountDate)}</dd>
            )}
          </div>
        )}
      </dl>
    </Card>
  )
}
