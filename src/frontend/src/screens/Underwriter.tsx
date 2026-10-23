import { cx } from '../components/cx'
import { Icon } from '../components/Icon'
import { Badge, Card, KV } from '../components/ui'

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

      <div className="w-[320px] space-y-6">
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
    </div>
  )
}
