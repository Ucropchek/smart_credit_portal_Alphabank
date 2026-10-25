import { useEffect, useState } from 'react'
import { getApplication, listApplications, type ApplicationDetail } from '../api/applications'
import type { Role, ServiceId } from '../components/Shell'
import { Badge, Button, Card, CardHeader } from '../components/ui'
import { rub } from '../format'

const rules = [
  ['Возраст бизнеса', 'До 3 месяцев 0, до 9 месяцев +8, до 24 месяцев +14, до 66 месяцев +22, до 108 месяцев +28, дальше +34'],
  ['Категория МСП', 'Микропредприятие +18, малое +24, среднее +30. Нет записи в реестре — 0'],
  ['Вновь созданный', 'Признак равен 1: −12. Иначе 0'],
  ['Банкротство', 'Действующая процедура: −40'],
  ['Залог', 'Действующий залог в Федресурсе: −18'],
  ['Иски к ответчику', 'Ноль: 0. До 100 тыс. ₽ −10, до 1 млн ₽ −18, больше −28'],
  ['Код срока платежей', 'Код 2: +32, код 1: +12, код 3: −8. Другой код или нет согласия на БКИ: 0'],
  ['Налоговая задолженность', 'Ноль: +10, до 50 тыс. ₽ −8, больше −16. Нет суммы — 0'],
  ['Выписка', 'Нет выписки или отказ: 0. Чистый поток не положительный: −8. Поступления меньше суммы кредита: +8. Поступления не меньше суммы кредита: +16'],
  ['Стоп-факторы', 'Ликвидация, текущая просрочка в БКИ или блокировка счёта дают отказ независимо от суммы баллов'],
  ['Порог', '70 баллов и выше — одобрение модели. Ниже — разбор. Итог ограничен диапазоном 0…100'],
  ['Ставка', '16,9–19,9% — предварительная ставка продукта из калькулятора. Балл её не считает'],
]

export function Services({
  role,
  service,
  onOpen,
}: {
  role: Role
  service: ServiceId
  onOpen: (number: number) => void
}) {
  const [rows, setRows] = useState<ApplicationDetail[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (service === 'policy') return
    let cancel = false
    listApplications()
      .then(async (list) => {
        const details = await Promise.all(list.map((item) => getApplication(item.number, role === 'bank' ? 'bank' : 'client')))
        if (!cancel) setRows(details)
      })
      .catch(() => {
        if (!cancel) setFailed(true)
      })
    return () => {
      cancel = true
    }
  }, [role, service])

  if (service === 'policy') return <Policy />
  if (failed) {
    return (
      <Card className="p-8">
        <p className="text-sm text-ink">Не удалось загрузить данные заявок.</p>
      </Card>
    )
  }
  if (rows == null) return <p className="text-sm text-muted">Загружаем…</p>
  if (service === 'payments') return <Payments rows={rows} onOpen={onOpen} />
  if (service === 'documents') return <Documents rows={rows} onOpen={onOpen} />
  if (service === 'chat') return <Chat rows={rows} onOpen={onOpen} />
  if (service === 'portfolio') return <Portfolio rows={rows} onOpen={onOpen} />
  return <Risks rows={rows} onOpen={onOpen} />
}

function Policy() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-ink">Политики скоринга</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Балльная таблица портала. Это не коэффициенты Альфа-Банка. Выписка считается по оборотам, которые клиент сохранил в заявке.
        </p>
      </div>
      <Card className="p-8">
        <ul className="divide-y divide-line">
          {rules.map(([title, text]) => (
            <li key={title} className="py-4">
              <div className="text-sm font-semibold text-ink">{title}</div>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function Payments({ rows, onOpen }: { rows: ApplicationDetail[]; onOpen: (number: number) => void }) {
  const withStatement = rows.filter((row) => (row.statement?.turnover.length ?? 0) > 0)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-ink">Счета и платежи</h1>
        <p className="mt-2 text-sm text-muted">Обороты из выписок, которые сохранены в заявках. Отдельных счетов в кабинете нет.</p>
      </div>
      {withStatement.length === 0 && <p className="text-sm text-muted">Переданных выписок пока нет.</p>}
      {withStatement.map((row) => {
        const turnover = row.statement?.turnover ?? []
        const incoming = turnover.reduce((sum, item) => sum + item.incoming, 0)
        const outgoing = turnover.reduce((sum, item) => sum + item.outgoing, 0)
        return (
          <Card key={row.number} className="p-8">
            <CardHeader
              title={row.business.name ?? `Заявка #${row.number}`}
              subtitle={`${turnover.length} мес. · поступления ${rub(incoming)} · списания ${rub(outgoing)}`}
              action={
                <Button type="button" variant="secondary" onClick={() => onOpen(row.number)}>
                  Заявка #{row.number}
                </Button>
              }
            />
          </Card>
        )
      })}
    </div>
  )
}

function Documents({ rows, onOpen }: { rows: ApplicationDetail[]; onOpen: (number: number) => void }) {
  const withDocs = rows.filter((row) => (row.documents?.length ?? 0) > 0)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-ink">Документы</h1>
        <p className="mt-2 text-sm text-muted">Названия, которые клиент указал в заявке. Содержимое файлов не хранится.</p>
      </div>
      {withDocs.length === 0 && <p className="text-sm text-muted">Названий документов пока нет.</p>}
      {withDocs.map((row) => (
        <Card key={row.number} className="p-8">
          <CardHeader
            title={row.business.name ?? `Заявка #${row.number}`}
            subtitle={`Заявка #${row.number}`}
            action={
              <Button type="button" variant="secondary" onClick={() => onOpen(row.number)}>
                Открыть
              </Button>
            }
          />
          <ul className="mt-4 space-y-2">
            {row.documents?.map((document) => (
              <li key={`${document.kind}:${document.name}`} className="text-sm text-ink">
                {document.kind}
                <span className="text-muted"> · {document.name}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

function Chat({ rows, onOpen }: { rows: ApplicationDetail[]; onOpen: (number: number) => void }) {
  const threads = rows.filter((row) => (row.requests?.length ?? 0) > 0)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-ink">Чат с банком</h1>
        <p className="mt-2 text-sm text-muted">Вопросы банка и ответы клиента по заявкам.</p>
      </div>
      {threads.length === 0 && <p className="text-sm text-muted">Вопросов пока нет.</p>}
      {threads.map((row) => (
        <Card key={row.number} className="p-8">
          <CardHeader
            title={`Заявка #${row.number}`}
            subtitle={row.business.name ?? row.purpose}
            action={
              <Button type="button" variant="secondary" onClick={() => onOpen(row.number)}>
                Открыть
              </Button>
            }
          />
          <ul className="mt-4 space-y-4">
            {row.requests?.map((request) => (
              <li key={request.id}>
                <div className="text-sm font-medium text-ink">{request.text}</div>
                <p className="mt-1 text-sm text-muted">{request.answer ?? 'Ждём ответ'}</p>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

function Portfolio({ rows, onOpen }: { rows: ApplicationDetail[]; onOpen: (number: number) => void }) {
  const groups = new Map<string, ApplicationDetail[]>()
  for (const row of rows) {
    const name = row.business.name ?? row.inn
    groups.set(name, [...(groups.get(name) ?? []), row])
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-ink">Портфель клиентов</h1>
        <p className="mt-2 text-sm text-muted">Компании из поданных заявок.</p>
      </div>
      {[...groups.entries()].map(([name, items]) => (
        <Card key={name} className="p-8">
          <CardHeader title={name} subtitle={`${items.length} заяв. · ${rub(items.reduce((sum, item) => sum + item.amount, 0))}`} />
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <li key={item.number}>
                <button type="button" onClick={() => onOpen(item.number)} className="cursor-pointer text-sm text-ink hover:underline">
                  #{item.number} · {rub(item.amount)} · {item.employeeDecision?.outcome === 'approve' ? 'Одобрено' : item.employeeDecision?.outcome === 'reject' ? 'Отказ' : item.stepTitle}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

function Risks({ rows, onOpen }: { rows: ApplicationDetail[]; onOpen: (number: number) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-ink">Отчёты по рискам</h1>
        <p className="mt-2 text-sm text-muted">Балл и решение модели по каждой заявке.</p>
      </div>
      <Card className="p-8">
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.number} className="flex items-center justify-between gap-4 py-3">
              <button type="button" onClick={() => onOpen(row.number)} className="cursor-pointer text-left text-sm text-ink hover:underline">
                #{row.number} · {row.business.name ?? 'Компания'}
              </button>
              {row.score ? (
                <Badge tone={row.score.decision === 'approve' ? 'ok' : row.score.decision === 'reject' ? 'danger' : 'warn'}>
                  {row.score.total}/100
                </Badge>
              ) : (
                <span className="text-sm text-muted">Скоринг не считался</span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
