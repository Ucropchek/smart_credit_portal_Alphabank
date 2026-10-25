import type { ApplicationDetail } from '../api/applications'
import { rub } from '../format'
import { Badge, Card, CardHeader } from './ui'

export function FinancesCard({
  finances,
  amount,
  subtitle,
}: {
  finances: NonNullable<ApplicationDetail['finances']>
  amount: number
  subtitle: string
}) {
  const revenue = finances.annualRevenue
  const obligations = finances.obligations
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
          </div>
        )}
        {obligations != null && (
          <div>
            <dt className="text-muted">Текущие обязательства</dt>
            <dd className="tnum mt-1 text-lg font-semibold text-ink">{rub(obligations)}</dd>
          </div>
        )}
        {finances.employees != null && (
          <div>
            <dt className="text-muted">Сотрудников</dt>
            <dd className="tnum mt-1 text-lg font-semibold text-ink">{finances.employees.toLocaleString('ru-RU')}</dd>
          </div>
        )}
      </dl>
    </Card>
  )
}
