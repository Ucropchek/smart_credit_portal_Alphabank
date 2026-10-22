import { cx } from '../components/cx'
import { Icon } from '../components/Icon'
import type { Scenario } from '../components/Shell'
import { Badge, Card } from '../components/ui'

const stages = [
  { label: 'Заявка подана', time: '12 мая, 10:24' },
  { label: 'Проверка ФНС и БКИ', time: '12 мая, 10:31' },
  { label: 'Кредитный скоринг', time: '13 мая, 15:02' },
  { label: 'Решение банка', time: 'Сейчас' },
]

export function Tracker({ scenario }: { scenario: Scenario }) {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="tnum text-sm text-muted">Заявка #ALFA-2026-89 · от 12 мая 2026</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.025em] text-ink">Статус заявки и решение банка</h1>
        </div>
        {scenario === 'approved' ? (
          <Badge tone="ok" dot className="px-3 py-1.5 text-[13px]">
            Одобрено
          </Badge>
        ) : scenario === 'clarify' ? (
          <Badge tone="warn" dot className="px-3 py-1.5 text-[13px]">
            Требуется действие
          </Badge>
        ) : (
          <Badge tone="warn" dot className="px-3 py-1.5 text-[13px]">
            Встречное предложение
          </Badge>
        )}
      </div>

      <Card className="px-8 py-7">
        <div className="flex items-start">
          {stages.map((stage, index) => {
            const last = index === stages.length - 1
            return (
              <div key={stage.label} className="flex flex-1 flex-col last:flex-none last:basis-[200px]">
                <div className="flex items-center">
                  <span
                    className={cx(
                      'relative grid size-9 shrink-0 place-items-center rounded-full',
                      last ? 'bg-alfa text-white' : 'bg-ok text-white',
                    )}
                  >
                    {last ? (
                      <>
                        <span className="absolute inset-0 animate-ping rounded-full bg-alfa/30" />
                        <span className="relative size-2.5 rounded-full bg-white" />
                      </>
                    ) : (
                      <Icon name="check" size={18} strokeWidth={2.5} />
                    )}
                  </span>
                  {!last && <span className="mx-3 h-0.5 flex-1 rounded-full bg-ok" />}
                </div>
                <div className="mt-3 pr-4">
                  <div className="text-sm font-semibold text-ink">{stage.label}</div>
                  <div className="tnum mt-0.5 text-xs text-muted">
                    {last ? <span className="font-medium text-alfa">Активный этап</span> : stage.time}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
