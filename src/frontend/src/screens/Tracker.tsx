import { useState } from 'react'
import { cx } from '../components/cx'
import { Icon } from '../components/Icon'
import type { Scenario } from '../components/Shell'
import { Badge, Button, Card } from '../components/ui'

const stages = [
  { label: 'Заявка подана', time: '12 мая, 10:24' },
  { label: 'Проверка ФНС и БКИ', time: '12 мая, 10:31' },
  { label: 'Кредитный скоринг', time: '13 мая, 15:02' },
  { label: 'Решение банка', time: 'Сейчас' },
]

export function Tracker({ scenario }: { scenario: Scenario }) {
  const [statement, setStatement] = useState<'idle' | 'loading' | 'done'>('idle')
  const needsStatement = scenario !== 'approved' && statement !== 'done'

  const upload = () => {
    setStatement('loading')
    setTimeout(() => setStatement('done'), 1200)
  }

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
        ) : scenario === 'clarify' && statement !== 'done' ? (
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

      {needsStatement && (
        <div className="animate-fade-up flex items-center gap-5 rounded-2xl border border-warn/30 bg-warn-soft px-6 py-5">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-warn">
            <Icon name="alert" size={22} />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold text-ink">
              Банк запрашивает уточнение: загрузите выписку по счёту за последний квартал
            </div>
            <div className="mt-0.5 text-sm text-muted">
              Выписка из стороннего банка за январь — март 2026 в формате PDF или 1С. Срок — до 16 мая.
            </div>
          </div>
          <Button type="button" variant="dark" onClick={upload} disabled={statement === 'loading'}>
            {statement === 'loading' ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Загрузка…
              </>
            ) : (
              <>
                <Icon name="upload" size={16} />
                Загрузить выписку
              </>
            )}
          </Button>
        </div>
      )}
      {statement === 'done' && scenario !== 'approved' && (
        <div className="animate-fade-up flex items-center gap-3 rounded-2xl border border-ok/25 bg-ok-soft px-6 py-4 text-sm text-ink">
          <Icon name="checkCircle" size={20} className="text-ok" />
          <span>
            <span className="font-semibold">Выписка_Q1_2026.pdf</span> загружена и передана кредитному эксперту
          </span>
        </div>
      )}
    </div>
  )
}
