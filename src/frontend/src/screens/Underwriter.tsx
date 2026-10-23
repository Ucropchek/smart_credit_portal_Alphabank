import { Icon } from '../components/Icon'
import { Badge, Card, KV } from '../components/ui'

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

      <Card className="w-[320px] p-6">
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
    </div>
  )
}
