import { useEffect, useMemo, useState } from 'react'
import { listApplications, type ApplicationListItem, type LoanDraft } from '../api/applications'
import { cx } from '../components/cx'
import { Icon } from '../components/Icon'
import { Badge, Button, Card, CardHeader, Slider } from '../components/ui'
import { annuity, mln, months, rub } from '../format'

type Purpose = 'working' | 'equipment' | 'contract'

const purposes: { id: Purpose; label: string }[] = [
  { id: 'working', label: 'Пополнение оборотных средств' },
  { id: 'equipment', label: 'Покупка оборудования' },
  { id: 'contract', label: 'Исполнение контракта' },
]

function recommend(purpose: Purpose, amount: number, term: number) {
  if (purpose === 'working') {
    return amount <= 15_000_000
      ? {
          name: 'Оборотный кредит без залога',
          rate: 19.9,
          tag: 'Без залога и поручителей',
          time: 'Решение за 1 день',
          match: 96,
        }
      : {
          name: 'Оборотный кредит под залог',
          rate: 17.4,
          tag: 'Залог — недвижимость или транспорт',
          time: 'Решение за 3 дня',
          match: 88,
        }
  }
  if (purpose === 'equipment') {
    return term >= 24
      ? {
          name: 'Инвестиционный кредит на оборудование',
          rate: 16.9,
          tag: 'Залог — приобретаемое оборудование',
          time: 'Решение за 2 дня',
          match: 93,
        }
      : {
          name: 'Экспресс-кредит на оборудование',
          rate: 18.7,
          tag: 'Без первоначального взноса',
          time: 'Решение за 1 день',
          match: 85,
        }
  }
  return {
    name: 'Кредит на исполнение госконтракта',
    rate: 18.2,
    tag: 'Под 44-ФЗ и 223-ФЗ',
    time: 'Решение за 2 дня',
    match: 91,
  }
}

const stepProgress: Record<string, number> = {
  submitted: 1,
  registryCheck: 2,
  scoring: 3,
  decision: 4,
}

export function Dashboard({
  onApply,
  onOpenApp,
}: {
  onApply: (draft: LoanDraft) => void
  onOpenApp: (number: number) => void
}) {
  const [purpose, setPurpose] = useState<Purpose>('working')
  const [amount, setAmount] = useState(12_000_000)
  const [term, setTerm] = useState(24)
  const rec = useMemo(() => recommend(purpose, amount, term), [purpose, amount, term])
  const payment = annuity(amount, rec.rate, term)
  const overpay = payment * term - amount
  const purposeLabel = purposes.find((item) => item.id === purpose)?.label ?? 'Пополнение оборотных средств'
  const [saved, setSaved] = useState<ApplicationListItem[] | null>(null)

  useEffect(() => {
    let cancel = false
    listApplications()
      .then((rows) => {
        if (!cancel) setSaved(rows)
      })
      .catch(() => {
        if (!cancel) setSaved([])
      })
    return () => {
      cancel = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted">Добрый день, Михаил</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.025em] text-ink">
            Подберём кредит под задачу бизнеса
          </h1>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm">
          <Icon name="shield" size={18} className="text-ok" />
          <span className="text-muted">Предварительный лимит:</span>
          <span className="tnum font-semibold text-ink">до 25 млн ₽</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-7 p-8">
          <CardHeader title="Калькулятор и цель кредита" subtitle="Выберите цель — мы подберём подходящий продукт" />
          <div className="mt-6 flex flex-wrap gap-2">
            {purposes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPurpose(item.id)}
                className={cx(
                  'h-10 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors',
                  purpose === item.id
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-white text-ink hover:border-[#cfd4da]',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-10">
            <Slider
              label="Сумма кредита"
              value={amount}
              min={1_000_000}
              max={50_000_000}
              step={500_000}
              onChange={setAmount}
              format={rub}
              minLabel="1 млн ₽"
              maxLabel="50 млн ₽"
            />
            <Slider
              label="Срок"
              value={term}
              min={6}
              max={36}
              step={1}
              onChange={setTerm}
              format={months}
              minLabel="6 мес"
              maxLabel="36 мес"
            />
          </div>
          <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
            {(
              [
                ['Сумма к получению', mln(amount)],
                ['Переплата', rub(overpay)],
                ['Общая выплата', rub(payment * term)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="bg-white px-5 py-4">
                <div className="text-xs text-muted">{label}</div>
                <div className="tnum mt-1 text-[15px] font-semibold text-ink">{value}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="col-span-5 flex flex-col p-8">
          <div className="flex items-center justify-between">
            <Badge tone="ok" dot>
              Лучшее совпадение · {rec.match}%
            </Badge>
            <span className="text-xs text-muted">Обновлено только что</span>
          </div>
          <div key={rec.name} className="animate-fade-up">
            <h3 className="mt-5 text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink">{rec.name}</h3>
            <p className="mt-2 text-sm text-muted">{rec.tag}</p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-canvas p-4">
              <div className="text-xs text-muted">Предварительная ставка</div>
              <div className="tnum mt-1 text-[26px] font-semibold tracking-[-0.02em] text-ink">
                от {rec.rate.toLocaleString('ru-RU')}%
              </div>
            </div>
            <div className="rounded-xl bg-canvas p-4">
              <div className="text-xs text-muted">Ежемесячный платёж</div>
              <div className="tnum mt-1 text-[26px] font-semibold tracking-[-0.02em] text-ink">
                {new Intl.NumberFormat('ru-RU').format(Math.round(payment / 100) * 100)}
                <span className="text-lg"> ₽</span>
              </div>
            </div>
          </div>

          <ul className="mt-6 space-y-2.5 text-sm text-ink">
            {[rec.time, 'Данные компании заполним автоматически', 'Подписание через ЭЦП онлайн'].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <Icon name="check" size={16} className="text-ok" strokeWidth={2.25} />
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-auto flex items-center gap-3 pt-8">
            <Button type="button" size="lg" className="flex-1" onClick={() => onApply({ purpose: purposeLabel, amount, termMonths: term })}>
              Оформить заявку
              <Icon name="arrowRight" size={18} />
            </Button>
            <Button type="button" size="lg" variant="secondary">
              Сравнить
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-8">
        <CardHeader
          title="Активные заявки"
          subtitle="Статус рассмотрения в реальном времени"
          action={
            <Button type="button" variant="secondary" size="sm">
              <Icon name="filter" size={16} />
              Все заявки
            </Button>
          }
        />
        <div className="mt-6">
          <div className="grid grid-cols-[1.1fr_2fr_1.1fr_0.8fr_2fr_1.3fr_32px] gap-4 border-b border-line pb-3 text-xs font-medium text-muted">
            <span>Номер</span>
            <span>Компания</span>
            <span className="text-right">Сумма</span>
            <span className="text-right">Срок</span>
            <span>Этап конвейера</span>
            <span>Статус</span>
            <span />
          </div>
          {saved == null && <p className="py-8 text-sm text-muted">Загружаем заявки…</p>}
          {saved?.length === 0 && <p className="py-8 text-sm text-muted">Пока нет отправленных заявок</p>}
          {saved?.map((app) => {
            const progress = stepProgress[app.step] ?? 1
            return (
              <button
                key={app.number}
                type="button"
                onClick={() => onOpenApp(app.number)}
                className="grid w-full cursor-pointer grid-cols-[1.1fr_2fr_1.1fr_0.8fr_2fr_1.3fr_32px] items-center gap-4 border-b border-line py-4 text-left text-sm transition-colors last:border-0 hover:bg-canvas/50"
              >
                <span className="tnum font-semibold text-ink">#{app.number}</span>
                <span className="text-ink">{app.businessName ?? 'Компания'}</span>
                <span className="tnum text-right font-medium text-ink">{rub(app.amount)}</span>
                <span className="tnum text-right text-ink">{app.termMonths} мес</span>
                <span className="flex items-center gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <span key={step} className={cx('h-1.5 flex-1 rounded-full', step <= progress ? 'bg-ink' : 'bg-line')} />
                  ))}
                  <span className="tnum ml-2 text-xs text-muted">{progress}/4</span>
                </span>
                <span>
                  <Badge tone="info" dot>
                    {app.stepTitle}
                  </Badge>
                </span>
                <Icon name="chevronRight" size={18} className="text-muted" />
              </button>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
