import { useEffect, useState } from 'react'
import { answerApplication, getApplication, type ApplicationDetail } from '../api/applications'
import { cx } from '../components/cx'
import { Icon } from '../components/Icon'
import type { Scenario } from '../components/Shell'
import { Badge, Button, Card, CardHeader } from '../components/ui'
import { annuity, months, rub } from '../format'

const stages = [
  { label: 'Заявка подана', time: '12 мая, 10:24' },
  { label: 'Проверка ФНС и БКИ', time: '12 мая, 10:31' },
  { label: 'Кредитный скоринг', time: '13 мая, 15:02' },
  { label: 'Решение банка', time: 'Сейчас' },
]

function Row({ k, v, delta }: { k: string; v: string; delta?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{k}</dt>
      <dd className="tnum flex items-center gap-2 font-medium text-ink">
        {delta && <span className="rounded-md bg-ok-soft px-1.5 py-0.5 text-xs font-semibold text-ok">{delta}</span>}
        {v}
      </dd>
    </div>
  )
}

export function Tracker({ scenario, applicationNumber }: { scenario: Scenario; applicationNumber: number | null }) {
  if (applicationNumber != null) return <LiveApplication number={applicationNumber} />
  return <DemoTracker scenario={scenario} />
}

const liveStages = ['Заявка подана', 'Проверка ФНС и БКИ', 'Кредитный скоринг', 'Решение банка']

const clientDecision: Record<string, { title: string; short: string }> = {
  approve: { title: 'Банк одобрил заявку', short: 'Одобрено' },
  review: { title: 'Банк оставил заявку на разбор', short: 'На разборе' },
  reject: { title: 'Банк отказал в кредите', short: 'Отказ' },
}

function LiveApplication({ number }: { number: number }) {
  const [loaded, setLoaded] = useState<{ number: number; detail: ApplicationDetail | null; failed: boolean } | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [answering, setAnswering] = useState<number | null>(null)
  const [answerError, setAnswerError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    getApplication(number)
      .then((app) => {
        if (!cancel) setLoaded({ number, detail: app, failed: false })
      })
      .catch(() => {
        if (!cancel) setLoaded({ number, detail: null, failed: true })
      })
    return () => {
      cancel = true
    }
  }, [number])

  const current = loaded?.number === number ? loaded : null
  const detail = current?.detail ?? null
  const failed = current?.failed ?? false
  const active = detail ? Math.max(0, ['submitted', 'registryCheck', 'scoring', 'decision'].indexOf(detail.step)) : 0
  const verdict = detail?.employeeDecision ? clientDecision[detail.employeeDecision.outcome] : undefined

  const sendAnswer = async (requestId: number) => {
    const text = answers[requestId]?.trim() ?? ''
    if (!text) {
      setAnswerError('Напишите ответ')
      return
    }
    setAnswering(requestId)
    setAnswerError(null)
    try {
      await answerApplication(number, requestId, text)
      const app = await getApplication(number)
      setLoaded({ number, detail: app, failed: false })
      setAnswers((current) => ({ ...current, [requestId]: '' }))
    } catch (error) {
      setAnswerError(error instanceof Error ? error.message : 'Не удалось отправить ответ')
    } finally {
      setAnswering(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="tnum text-sm text-muted">Заявка #{number}</p>
        <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.025em] text-ink">
          {detail?.business.name ?? 'Статус заявки'}
        </h1>
      </div>

      {failed && (
        <Card className="p-8">
          <p className="text-sm text-ink">Не удалось загрузить заявку #{number}.</p>
        </Card>
      )}

      {!failed && !detail && <p className="text-sm text-muted">Загружаем заявку…</p>}

      {detail && (
        <>
          <Card className="px-8 py-7">
            <div className="flex items-start">
              {liveStages.map((label, index) => {
                const last = index === liveStages.length - 1
                const settled = verdict != null
                const registryRan = detail.registries != null
                const done = index === 1 ? registryRan : index < active || (settled && index === active)
                const activeStage = !done && index === active && !settled
                const caption = activeStage
                  ? detail.stepTitle
                  : settled && last
                    ? verdict.short
                    : index === 1 && !registryRan
                      ? 'Не запускалась'
                      : done
                        ? 'Пройдено'
                        : 'Дальше'
                return (
                  <div key={label} className="flex flex-1 flex-col last:flex-none last:basis-[200px]">
                    <div className="flex items-center">
                      <span
                        className={cx(
                          'relative grid size-9 shrink-0 place-items-center rounded-full',
                          done && 'bg-ok text-white',
                          activeStage && 'bg-alfa text-white',
                          !done && !activeStage && 'border border-line bg-white text-muted',
                        )}
                      >
                        {activeStage ? (
                          <>
                            <span className="absolute inset-0 animate-ping rounded-full bg-alfa/30" />
                            <span className="relative size-2.5 rounded-full bg-white" />
                          </>
                        ) : done ? (
                          <Icon name="check" size={18} strokeWidth={2.5} />
                        ) : (
                          <span className="tnum text-xs font-semibold">{index + 1}</span>
                        )}
                      </span>
                      {!last && <span className={cx('mx-3 h-0.5 flex-1 rounded-full', done ? 'bg-ok' : 'bg-line')} />}
                    </div>
                    <div className="mt-3 pr-4">
                      <div className="text-sm font-semibold text-ink">{label}</div>
                      <div className="mt-0.5 text-xs text-muted">{caption}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {(detail.requests?.length ?? 0) > 0 && (
            <Card className="p-8">
              <CardHeader title="Банк запросил уточнение" subtitle="Ответ сохранится в заявке" />
              <ul className="mt-6 space-y-5">
                {detail.requests?.map((request) => (
                  <li key={request.id} className="rounded-xl border border-line px-4 py-4">
                    <div className="text-sm font-medium text-ink">{request.text}</div>
                    {request.open ? (
                      <div className="mt-3">
                        <textarea
                          value={answers[request.id] ?? ''}
                          maxLength={2000}
                          rows={3}
                          onChange={(event) => {
                            setAnswers((current) => ({ ...current, [request.id]: event.target.value }))
                            setAnswerError(null)
                          }}
                          className="w-full resize-y rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-ink"
                          placeholder="Ответ банку"
                        />
                        <Button
                          type="button"
                          className="mt-3"
                          onClick={() => sendAnswer(request.id)}
                          disabled={answering === request.id}
                        >
                          {answering === request.id ? 'Отправляем…' : 'Ответить'}
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-ink">{request.answer}</p>
                    )}
                  </li>
                ))}
              </ul>
              {answerError && <p className="mt-3 text-sm text-alfa">{answerError}</p>}
            </Card>
          )}

          <Card className="p-8">
            <CardHeader title={verdict?.title ?? detail.stepTitle} subtitle={detail.purpose} />
            {detail.employeeDecision?.reason?.trim() && (
              <p className="mt-6 text-sm text-ink">{detail.employeeDecision.reason}</p>
            )}
            <dl className="mt-6 grid grid-cols-2 gap-x-10 gap-y-4 text-sm">
              <div>
                <dt className="text-muted">Сумма</dt>
                <dd className="tnum mt-1 text-lg font-semibold text-ink">{rub(detail.amount)}</dd>
              </div>
              <div>
                <dt className="text-muted">Срок</dt>
                <dd className="tnum mt-1 text-lg font-semibold text-ink">{months(detail.termMonths)}</dd>
              </div>
              <div>
                <dt className="text-muted">ИНН</dt>
                <dd className="tnum mt-1 font-medium text-ink">{detail.inn}</dd>
              </div>
              <div>
                <dt className="text-muted">ОГРН</dt>
                <dd className="tnum mt-1 font-medium text-ink">{detail.registrationId}</dd>
              </div>
            </dl>
            {detail.step === 'submitted' && (
              <p className="mt-6 text-sm text-muted">Заявка принята. Банк ещё не начал проверку реестров и скоринг.</p>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function DemoTracker({ scenario }: { scenario: Scenario }) {
  const [statement, setStatement] = useState<'idle' | 'loading' | 'done'>('idle')
  const [signed, setSigned] = useState(false)
  const [signing, setSigning] = useState(false)
  const needsStatement = scenario !== 'approved' && statement !== 'done'
  const decisionReady = scenario !== 'clarify' || statement === 'done'
  const offer =
    scenario === 'approved'
      ? { amount: 15_000_000, term: 24, rate: 19.9 }
      : { amount: 12_000_000, term: 36, rate: 18.5 }
  const requestedPayment = annuity(15_000_000, 19.9, 24)
  const offeredPayment = annuity(offer.amount, offer.rate, offer.term)

  const upload = () => {
    setStatement('loading')
    setTimeout(() => setStatement('done'), 1200)
  }

  const sign = () => {
    setSigning(true)
    setTimeout(() => {
      setSigning(false)
      setSigned(true)
    }, 1400)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="tnum text-sm text-muted">Заявка #ALFA-2026-89 · от 12 мая 2026</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.025em] text-ink">Статус заявки и решение банка</h1>
        </div>
        {signed ? (
          <Badge tone="ok" dot className="px-3 py-1.5 text-[13px]">
            Договор подписан
          </Badge>
        ) : scenario === 'approved' ? (
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
            const done = !last || signed
            return (
              <div key={stage.label} className="flex flex-1 flex-col last:flex-none last:basis-[200px]">
                <div className="flex items-center">
                  <span
                    className={cx(
                      'relative grid size-9 shrink-0 place-items-center rounded-full',
                      done ? 'bg-ok text-white' : 'bg-alfa text-white',
                    )}
                  >
                    {last && !done ? (
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
                    {last && !done ? <span className="font-medium text-alfa">Активный этап</span> : stage.time}
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

      <Card className="p-8">
        <CardHeader
          title={scenario === 'approved' ? 'Банк одобрил вашу заявку' : 'Предложение банка'}
          subtitle={
            scenario === 'approved'
              ? 'Условия полностью совпадают с вашим запросом'
              : 'По результатам скоринга банк подготовил альтернативные условия с более комфортным платежом'
          }
          action={<span className="tnum text-xs text-muted">Предложение действует до 28 мая 2026</span>}
        />

        {decisionReady ? (
          <>
            <div className="mt-6 grid grid-cols-[1fr_auto_1.15fr] items-stretch gap-4">
              <div className="rounded-2xl border border-line p-6">
                <div className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Ваш запрос</div>
                <div className="tnum mt-3 text-[28px] font-semibold tracking-[-0.02em] text-ink">
                  15 млн ₽ <span className="text-muted">на 24 мес.</span>
                </div>
                <dl className="mt-6 space-y-3 text-sm">
                  <Row k="Ставка" v="19,9%" />
                  <Row k="Ежемесячный платёж" v={rub(requestedPayment)} />
                  <Row k="Залог" v="Без залога" />
                </dl>
              </div>
              <div className="grid place-items-center">
                <span className="grid size-10 place-items-center rounded-full border border-line bg-white text-muted">
                  <Icon name="arrowRight" size={18} />
                </span>
              </div>
              <div className="relative rounded-2xl border-2 border-ink p-6">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold tracking-[0.08em] text-ink uppercase">
                    Одобренное предложение банка
                  </div>
                  <Badge tone="ok">Одобрено</Badge>
                </div>
                <div className="tnum mt-3 text-[28px] font-semibold tracking-[-0.02em] text-ink">
                  {offer.amount / 1_000_000} млн ₽ <span className="text-muted">на {offer.term} мес.</span>{' '}
                  <span>под {offer.rate.toLocaleString('ru-RU')}%</span>
                </div>
                <dl className="mt-6 space-y-3 text-sm">
                  <Row
                    k="Ставка"
                    v={`${offer.rate.toLocaleString('ru-RU')}%`}
                    delta={scenario !== 'approved' ? '−1,4 п.п.' : undefined}
                  />
                  <Row
                    k="Ежемесячный платёж"
                    v={rub(offeredPayment)}
                    delta={scenario !== 'approved' ? `−${rub(requestedPayment - offeredPayment)}` : undefined}
                  />
                  <Row k="Залог" v="Без залога" />
                </dl>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-4 border-t border-line pt-6">
              {signed ? (
                <div className="animate-fade-up flex items-center gap-3 text-sm text-ink">
                  <span className="grid size-10 place-items-center rounded-full bg-ok-soft text-ok">
                    <Icon name="check" size={20} strokeWidth={2.5} />
                  </span>
                  <div>
                    <div className="font-semibold">Договор подписан ЭЦП</div>
                    <div className="text-muted">Средства поступят на расчётный счёт в течение 1 рабочего дня</div>
                  </div>
                </div>
              ) : (
                <>
                  <Button type="button" size="lg" onClick={sign} disabled={signing}>
                    {signing ? (
                      <>
                        <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Подписание…
                      </>
                    ) : (
                      <>
                        <Icon name="pen" size={18} />
                        Принять условия и подписать ЭЦП
                      </>
                    )}
                  </Button>
                  <Button type="button" size="lg" variant="secondary">
                    Обсудить с менеджером
                  </Button>
                  <span className="ml-auto max-w-[280px] text-xs text-muted">
                    Подписание через КЭП ФНС или Алфа-ЭЦП. Комиссия за выдачу — 0 ₽.
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-dashed border-line px-6 py-10">
            <Icon name="clock" size={22} className="text-muted" />
            <div className="text-sm text-muted">
              Решение будет сформировано после загрузки запрошенной выписки — обычно в течение 2 часов.
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
