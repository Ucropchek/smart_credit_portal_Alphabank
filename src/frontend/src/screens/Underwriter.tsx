import { cx } from '../components/cx'
import { Icon } from '../components/Icon'
import { Badge, Card, KV } from '../components/ui'

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

      <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-6">
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
      </div>
    </div>
  )
}
