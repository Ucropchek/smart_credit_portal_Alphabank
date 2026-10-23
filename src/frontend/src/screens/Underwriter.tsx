import { useState } from 'react'
import { cx } from '../components/cx'
import { Icon } from '../components/Icon'
import { Badge, Button, Card, KV, Slider } from '../components/ui'
import { annuity, months, rub } from '../format'

const positive = [
  { label: 'Стабильная выручка > 24 мес', weight: '+14' },
  { label: 'Положительная кредитная история', weight: '+11' },
  { label: 'Компания на рынке 9 лет', weight: '+6' },
  { label: 'Диверсифицированная клиентская база', weight: '+4' },
]

const negative: { label: string; weight: string; tone: 'danger' | 'warn' }[] = [
  { label: 'Высокая долговая нагрузка', weight: '−12', tone: 'danger' },
  { label: 'Сезонность выручки в Q1', weight: '−5', tone: 'warn' },
  { label: 'Арбитражные споры', weight: '−3', tone: 'warn' },
]

function Gauge({ value }: { value: number }) {
  const radius = 96
  const arc = Math.PI * radius
  const segment = (from: number, to: number, color: string) => (
    <path
      d={`M ${120 - radius} 120 A ${radius} ${radius} 0 0 1 ${120 + radius} 120`}
      fill="none"
      stroke={color}
      strokeWidth={14}
      strokeDasharray={`${((to - from) / 100) * arc - 3} ${arc}`}
      strokeDashoffset={-(from / 100) * arc}
    />
  )
  const angle = Math.PI * (1 - value / 100)
  const needleX = 120 + Math.cos(angle) * (radius - 26)
  const needleY = 120 - Math.sin(angle) * (radius - 26)

  return (
    <svg viewBox="0 0 240 132" className="w-full max-w-[300px]" role="img" aria-label={`Риск ${value} из 100`}>
      {segment(0, 40, '#0CC44D')}
      {segment(40, 75, '#FA8C16')}
      {segment(75, 100, '#EF3124')}
      <line x1="120" y1="120" x2={needleX} y2={needleY} stroke="#0B1F35" strokeWidth="3" strokeLinecap="round" />
      <circle cx="120" cy="120" r="7" fill="#0B1F35" />
      <circle cx="120" cy="120" r="2.5" fill="#fff" />
    </svg>
  )
}

type Decision = 'approve' | 'counter' | 'rework' | 'reject'

const decisions: { id: Decision; label: string }[] = [
  { id: 'approve', label: 'Одобрить' },
  { id: 'counter', label: 'Встречное предложение' },
  { id: 'rework', label: 'На доработку' },
  { id: 'reject', label: 'Отказать' },
]

const reworkPrompts = ['Выписка по счёту', 'Договоры с контрагентами', 'Отчётность за Q1']

const rejectReasons = [
  'Высокая долговая нагрузка',
  'Недостаточная выручка',
  'Негативная кредитная история',
  'Стоп-факторы по политике',
]

const decisionAction: Record<Decision, string> = {
  approve: 'Одобрить на условиях клиента',
  counter: 'Отправить встречное предложение',
  rework: 'Отправить запрос клиенту',
  reject: 'Подтвердить отказ',
}

const decisionDone: Record<Decision, string> = {
  approve: 'Заявка одобрена. Клиент получил уведомление.',
  counter: 'Встречное предложение отправлено клиенту.',
  rework: 'Запрос на доработку отправлен клиенту.',
  reject: 'Отказ зафиксирован в системе.',
}

function DecisionPanel() {
  const [decision, setDecision] = useState<Decision>('counter')
  const [amount, setAmount] = useState(12_000_000)
  const [term, setTerm] = useState(36)
  const [rate, setRate] = useState(18.5)
  const [comment, setComment] = useState(
    'Загрузите выписку по расчётному счёту в стороннем банке за последний квартал (январь — март 2026).',
  )
  const [reason, setReason] = useState(rejectReasons[0])
  const [sent, setSent] = useState<Decision | null>(null)
  const payment = annuity(amount, rate, term)
  const debtLoad = Math.round(((22_500_000 / 12 + payment) / (186_400_000 / 12)) * 100)

  return (
    <Card as="aside" className="sticky top-6 overflow-hidden">
      <div className="border-b border-line px-6 pt-6 pb-4">
        <h3 className="text-[17px] font-semibold text-ink">Решение по заявке</h3>
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1">
          {decisions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setDecision(item.id)
                setSent(null)
              }}
              className={cx(
                'h-9 cursor-pointer rounded-[10px] px-2 text-[12.5px] font-medium transition-all',
                decision === item.id
                  ? 'bg-white text-ink shadow-[0_1px_2px_rgb(11_31_53/0.08)] ring-1 ring-line'
                  : 'text-muted hover:text-ink',
                decision === item.id && item.id === 'reject' && 'text-alfa',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div key={decision} className="animate-fade-up px-6 py-6">
        {decision === 'approve' && (
          <div className="space-y-4 text-sm">
            <p className="text-muted">Одобрение на условиях, запрошенных клиентом.</p>
            <dl className="space-y-3 rounded-xl border border-line p-4">
              {(
                [
                  ['Сумма', '15 000 000 ₽'],
                  ['Срок', '24 месяца'],
                  ['Ставка', '19,9%'],
                  ['Платёж', rub(annuity(15_000_000, 19.9, 24))],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-muted">{label}</dt>
                  <dd className="tnum font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex gap-2 rounded-xl bg-warn-soft p-3 text-xs text-ink">
              <Icon name="alert" size={16} className="shrink-0 text-warn" />
              DSCR 1,24 ниже порога политики (1,3). Потребуется согласование комитета.
            </div>
          </div>
        )}
        {decision === 'counter' && (
          <div className="space-y-6">
            <Slider
              label="Одобренная сумма"
              value={amount}
              min={3_000_000}
              max={15_000_000}
              step={500_000}
              onChange={setAmount}
              format={rub}
              minLabel="3 млн"
              maxLabel="15 млн"
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
            <Slider
              label="Ставка"
              value={rate}
              min={16}
              max={24}
              step={0.1}
              onChange={(value) => setRate(Math.round(value * 10) / 10)}
              format={(value) => `${value.toLocaleString('ru-RU')}%`}
              minLabel="16%"
              maxLabel="24%"
            />
            <div className="space-y-2.5 rounded-xl bg-canvas p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Платёж клиента</span>
                <span className="tnum font-semibold text-ink">{rub(payment)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Долговая нагрузка</span>
                <Badge tone={debtLoad < 25 ? 'ok' : debtLoad < 35 ? 'warn' : 'danger'} className="tnum">
                  {debtLoad}%
                </Badge>
              </div>
            </div>
          </div>
        )}
        {decision === 'rework' && (
          <div className="space-y-3">
            <label className="text-[13px] text-muted" htmlFor="rework-comment">
              Комментарий для клиента
            </label>
            <textarea
              id="rework-comment"
              rows={6}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="w-full resize-none rounded-xl border border-line p-3.5 text-sm text-ink outline-none focus:border-ink"
            />
            <div className="flex flex-wrap gap-2">
              {reworkPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setComment((current) => `${current}\n• ${prompt}`)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-ink hover:bg-canvas"
                >
                  <Icon name="plus" size={12} />
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {decision === 'reject' && (
          <div className="space-y-2">
            <div className="text-[13px] text-muted">Причина отказа</div>
            {rejectReasons.map((item) => (
              <label
                key={item}
                className={cx(
                  'flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm',
                  reason === item ? 'border-ink' : 'border-line',
                )}
              >
                <input
                  type="radio"
                  name="reject-reason"
                  className="accent-alfa"
                  checked={reason === item}
                  onChange={() => setReason(item)}
                />
                {item}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line px-6 py-5">
        {sent === decision ? (
          <div className="animate-fade-up flex items-center gap-2.5 rounded-xl bg-ok-soft px-4 py-3 text-sm font-medium text-ink">
            <Icon name="checkCircle" size={18} className="text-ok" />
            {decisionDone[decision]}
          </div>
        ) : (
          <Button
            type="button"
            size="lg"
            className="w-full"
            variant={decision === 'reject' ? 'dark' : 'primary'}
            onClick={() => setSent(decision)}
          >
            {decisionAction[decision]}
          </Button>
        )}
        <p className="mt-3 text-center text-xs text-muted">Решение будет записано в журнал аудита</p>
      </div>
    </Card>
  )
}

const checks: { source: string; text: string; tone: 'ok' | 'warn' }[] = [
  { source: 'ЕГРЮЛ', text: 'Действующая', tone: 'ok' },
  { source: 'ФНС Прозрачный бизнес', text: 'Налоговых задолженностей нет', tone: 'ok' },
  { source: 'БКИ', text: 'Кредитный рейтинг 780/1000', tone: 'ok' },
  { source: 'Федресурс', text: 'Банкротств и ликвидаций нет', tone: 'ok' },
  { source: 'Картотека арбитражных дел', text: '2 иска как ответчик · 1,4 млн ₽', tone: 'warn' },
]

export function Underwriter() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>Конвейер МСБ</span>
            <Icon name="chevronRight" size={14} />
            <span>Кредитный комитет</span>
          </div>
          <h1 className="tnum mt-1 flex items-center gap-3 text-[32px] font-semibold tracking-[-0.025em] text-ink">
            Заявка #ALFA-2026-89
            <Badge tone="info" dot className="text-[13px]">
              На рассмотрении
            </Badge>
          </h1>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="text-right">
            <div className="text-xs text-muted">SLA решения</div>
            <div className="tnum font-semibold text-ink">осталось 3 ч 40 мин</div>
          </div>
          <div className="h-9 w-px bg-line" />
          <div className="text-right">
            <div className="text-xs text-muted">Запрос клиента</div>
            <div className="tnum font-semibold text-ink">15 000 000 ₽ · 24 мес</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[320px_minmax(0,1fr)_340px] items-start gap-6">
        <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-ink text-sm font-semibold text-white">ВЛ</div>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-ink">ООО «Вектор Логистик»</div>
              <div className="tnum text-xs text-muted">ИНН 7701234567</div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-5">
            <KV k="ОГРН" v="1177746258341" mono />
            <KV k="Дата регистрации" v="14.03.2017" mono />
            <KV k="ОКВЭД" v="49.41 Грузоперевозки" />
            <KV k="Сотрудников" v="84" mono />
            <KV k="Выручка 2025" v="186,4 млн ₽" mono />
            <KV k="Чистая прибыль" v="14,2 млн ₽" mono />
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <KV k="Генеральный директор" v="Орлов Михаил Сергеевич · 100% долей" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Внешние источники</div>
          <ul className="mt-4 space-y-3">
            {checks.map((check) => (
              <li key={check.source} className="flex gap-3">
                <span
                  className={cx(
                    'grid size-8 shrink-0 place-items-center rounded-lg',
                    check.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn',
                  )}
                >
                  <Icon name={check.tone === 'ok' ? 'check' : 'alert'} size={16} strokeWidth={check.tone === 'ok' ? 2.5 : 2} />
                </span>
                <div className="min-w-0 text-sm">
                  <div className="font-semibold text-ink">{check.source}</div>
                  <div className="text-muted">{check.text}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-xs text-muted">
            <Icon name="clock" size={14} />
            Обновлено автоматически 13.05.2026, 15:02
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-8">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-[17px] font-semibold text-ink">Скоринг и риск-движок</h3>
              <p className="mt-1 text-sm text-muted">Модель МСБ v4.2 · 47 факторов</p>
            </div>
            <Badge tone="warn" dot>
              Средний риск
            </Badge>
          </div>
          <div className="mt-4 flex flex-col items-center">
            <Gauge value={68} />
            <div className="-mt-1 text-center">
              <div className="tnum text-[40px] leading-none font-semibold tracking-[-0.03em] text-ink">
                68<span className="text-xl text-muted">/100</span>
              </div>
              <div className="mt-2 text-sm text-ink">
                Уровень риска: <span className="font-semibold text-warn">Средний</span>
              </div>
            </div>
            <div className="mt-4 flex w-full max-w-[300px] justify-between text-xs text-muted">
              <span>Низкий</span>
              <span>Средний</span>
              <span>Высокий</span>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
            {[
              ['PD (12 мес)', '3,8%'],
              ['Долг / EBITDA', '3,1×'],
              ['DSCR', '1,24'],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-4 py-3.5 text-center">
                <div className="text-xs text-muted">{label}</div>
                <div className="tnum mt-1 text-[17px] font-semibold text-ink">{value}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-8">
          <div className="text-sm font-semibold text-ink">Положительные факторы</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {positive.map((factor) => (
              <span
                key={factor.label}
                className="inline-flex items-center gap-2 rounded-full bg-ok-soft py-1.5 pr-1.5 pl-3 text-[13px] font-medium text-ink"
              >
                <Icon name="trendUp" size={14} className="text-ok" />
                {factor.label}
                <span className="tnum rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ok">{factor.weight}</span>
              </span>
            ))}
          </div>
          <div className="mt-6 text-sm font-semibold text-ink">Факторы риска</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {negative.map((factor) => (
              <span
                key={factor.label}
                className={cx(
                  'inline-flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3 text-[13px] font-medium text-ink',
                  factor.tone === 'danger' ? 'bg-danger-soft' : 'bg-warn-soft',
                )}
              >
                <Icon
                  name="trendDown"
                  size={14}
                  className={factor.tone === 'danger' ? 'text-alfa' : 'text-warn'}
                />
                {factor.label}
                <span
                  className={cx(
                    'tnum rounded-full bg-white px-2 py-0.5 text-xs font-semibold',
                    factor.tone === 'danger' ? 'text-alfa' : 'text-warn',
                  )}
                >
                  {factor.weight}
                </span>
              </span>
            ))}
          </div>
          <div className="mt-6 flex gap-3 rounded-xl bg-canvas p-4 text-sm">
            <Icon name="sparkle" size={18} className="mt-0.5 shrink-0 text-info" />
            <p className="text-ink">
              <span className="font-semibold">Рекомендация модели:</span> снизить сумму до 12 млн ₽ и увеличить срок до 36
              мес — DSCR вырастет до 1,52, долговая нагрузка снизится до допустимого уровня.
            </p>
          </div>
        </Card>
        </div>
        <DecisionPanel />
      </div>
    </div>
  )
}
