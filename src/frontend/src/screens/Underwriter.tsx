import { useEffect, useRef, useState } from 'react'
import {
  decideApplication,
  getApplication,
  listApplications,
  scoreApplication,
  type ApplicationDetail,
  type ApplicationListItem,
} from '../api/applications'
import { cx } from '../components/cx'
import { Badge, Button, Card, CardHeader, KV } from '../components/ui'
import { months, rub } from '../format'

const decisionLabel: Record<string, string> = {
  approve: 'Одобрение',
  review: 'Разбор',
  reject: 'Отказ',
}

const stopLabel: Record<string, string> = {
  liquidated: 'Ликвидация',
  overdue: 'Текущая просрочка в БКИ',
  accountBlocked: 'Блокировка счёта',
}

const productLabel: Record<string, string> = {
  ordinary: 'Обычный кредит',
  'msp-subsidized': 'Льготный кредит МСП',
}

function decisionTone(decision: string): 'ok' | 'warn' | 'danger' | 'info' {
  if (decision === 'approve') return 'ok'
  if (decision === 'reject') return 'danger'
  if (decision === 'review') return 'warn'
  return 'info'
}

const outcomes = [
  { id: 'approve', label: 'Одобрить' },
  { id: 'review', label: 'На разбор' },
  { id: 'reject', label: 'Отказать' },
] as const

type Outcome = (typeof outcomes)[number]['id']

function savedOutcome(app: ApplicationDetail): Outcome {
  const outcome = app.employeeDecision?.outcome
  if (outcome === 'approve' || outcome === 'review' || outcome === 'reject') return outcome
  return 'review'
}

export function Underwriter({ onCount }: { onCount?: (count: number) => void }) {
  const [rows, setRows] = useState<ApplicationListItem[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<ApplicationDetail | null>(null)
  const [errorFor, setErrorFor] = useState<number | null>(null)
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome>('review')
  const [reason, setReason] = useState('')
  const [deciding, setDeciding] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const onCountRef = useRef(onCount)

  useEffect(() => {
    onCountRef.current = onCount
  })

  useEffect(() => {
    let cancel = false
    listApplications()
      .then((list) => {
        if (cancel) return
        setRows(list)
        onCountRef.current?.(list.length)
        setSelected((current) => current ?? list.at(-1)?.number ?? null)
      })
      .catch(() => {
        if (cancel) return
        setRows([])
        onCountRef.current?.(0)
      })
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    if (selected == null) return
    let cancel = false
    getApplication(selected, 'bank')
      .then((app) => {
        if (!cancel) {
          setLoaded(app)
          setErrorFor(null)
          setOutcome(savedOutcome(app))
          setReason(app.employeeDecision?.reason ?? '')
          setDecisionError(null)
        }
      })
      .catch(() => {
        if (!cancel) setErrorFor(selected)
      })
    return () => {
      cancel = true
    }
  }, [selected])

  const detail = loaded?.number === selected ? loaded : null
  const failed = errorFor === selected && selected != null
  const recorded = detail?.employeeDecision?.outcome

  const remember = (app: ApplicationDetail) => {
    setLoaded(app)
    setOutcome(savedOutcome(app))
    setReason(app.employeeDecision?.reason ?? '')
    setRows((current) =>
      current?.map((row) => (row.number === app.number ? { ...row, step: app.step, stepTitle: app.stepTitle } : row)) ?? current,
    )
  }

  const score = async () => {
    if (selected == null) return
    setScoring(true)
    setScoreError(null)
    try {
      const app = await scoreApplication(selected)
      setLoaded(app)
      setRows((current) =>
        current?.map((row) => (row.number === app.number ? { ...row, step: app.step, stepTitle: app.stepTitle } : row)) ?? current,
      )
    } catch (error) {
      setScoreError(error instanceof Error ? error.message : 'Не удалось посчитать скоринг')
    } finally {
      setScoring(false)
    }
  }

  const decide = async () => {
    if (selected == null || !detail) return
    if ((outcome === 'approve' || outcome === 'review') && !detail.score) {
      setDecisionError('Сначала посчитайте скоринг')
      return
    }
    if (outcome === 'reject' && !reason.trim()) {
      setDecisionError('Напишите причину отказа')
      return
    }
    setDeciding(true)
    setDecisionError(null)
    try {
      remember(await decideApplication(selected, outcome, reason))
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : 'Не удалось записать решение')
    } finally {
      setDeciding(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">Конвейер заявок</p>
        <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.025em] text-ink">Заявки на рассмотрении</h1>
      </div>

      <div className="grid grid-cols-12 items-start gap-6">
        <Card className="col-span-4 p-4">
          {rows == null && <p className="px-3 py-6 text-sm text-muted">Загружаем заявки…</p>}
          {rows?.length === 0 && <p className="px-3 py-6 text-sm text-muted">Клиенты ещё не отправили заявок</p>}
          <ul>
            {rows?.map((row) => {
              const active = row.number === selected
              return (
                <li key={row.number}>
                  <button
                    type="button"
                    onClick={() => setSelected(row.number)}
                    className={cx(
                      'flex w-full cursor-pointer flex-col gap-1 rounded-xl px-3 py-3 text-left transition-colors',
                      active ? 'bg-canvas' : 'hover:bg-canvas/60',
                    )}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="tnum text-sm font-semibold text-ink">#{row.number}</span>
                      <Badge tone="info">{row.stepTitle}</Badge>
                    </span>
                    <span className="truncate text-sm text-ink">{row.businessName ?? 'Компания'}</span>
                    <span className="tnum text-xs text-muted">
                      {rub(row.amount)} · {row.termMonths} мес
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        <div className="col-span-8 space-y-6">
          {selected == null && rows != null && <p className="text-sm text-muted">Выберите заявку слева</p>}
          {failed && (
            <Card className="p-8">
              <p className="text-sm text-ink">Не удалось загрузить заявку #{selected}.</p>
            </Card>
          )}
          {selected != null && !failed && !detail && <p className="text-sm text-muted">Загружаем заявку…</p>}
          {detail && (
            <>
              <Card className="p-8">
                <CardHeader
                  title={detail.business.name ?? `Заявка #${detail.number}`}
                  subtitle={detail.purpose}
                  action={
                    <Badge tone="info" dot>
                      {detail.stepTitle}
                    </Badge>
                  }
                />
                <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5">
                  <KV k="Сумма" v={rub(detail.amount)} mono />
                  <KV k="Срок" v={months(detail.termMonths)} mono />
                  <KV k="ИНН" v={detail.inn} mono />
                  <KV k="ОГРН" v={detail.registrationId} mono />
                  <KV
                    k="Согласие БКИ"
                    v={
                      detail.bkiConsent?.checked === true
                        ? 'Есть'
                        : detail.bkiConsent?.checked === false
                          ? 'Отказ'
                          : 'Не привязано'
                    }
                  />
                </div>
              </Card>

              <Card className="p-8">
                <CardHeader
                  title="Скоринг"
                  subtitle={
                    detail.score?.model?.alfaCoefficients
                      ? 'Балл по карточке компании'
                      : 'Балльная таблица портала, без коэффициентов Альфы'
                  }
                  action={
                    detail.score && (
                      <Badge tone={decisionTone(detail.score.decision)} dot>
                        {decisionLabel[detail.score.decision] ?? detail.score.decision}
                      </Badge>
                    )
                  }
                />

                {detail.score ? (
                  <div className="mt-6">
                    <div className="tnum text-[40px] leading-none font-semibold tracking-[-0.03em] text-ink">
                      {detail.score.total}
                      <span className="text-xl text-muted">/100</span>
                    </div>
                    <p className="mt-3 max-w-xl text-sm text-ink">{detail.score.reason}</p>
                    {(detail.score.stops?.fired?.length ?? 0) > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {detail.score.stops?.fired?.map((code) => (
                          <Badge key={code} tone="danger">
                            {stopLabel[code] ?? code}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <ul className="mt-6 divide-y divide-line">
                      {detail.score.points?.map((point) => (
                        <li key={point.factor} className="flex items-start justify-between gap-6 py-3">
                          <div>
                            <div className="text-sm font-medium text-ink">{point.title}</div>
                            <div className="mt-1 text-xs text-muted">{point.detail}</div>
                          </div>
                          <span
                            className={cx(
                              'tnum shrink-0 text-sm font-semibold',
                              point.points > 0 && 'text-ok',
                              point.points < 0 && 'text-alfa',
                              point.points === 0 && 'text-muted',
                            )}
                          >
                            {point.points > 0 ? `+${point.points}` : point.points}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {detail.product && (
                      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-line pt-6">
                        <KV k="Продукт" v={productLabel[detail.product.code] ?? detail.product.code} />
                        <KV k="Лимит по баллу" v={rub(detail.product.maxAmount)} mono />
                        {detail.counterOffer && detail.counterOffer.amount < detail.amount && (
                          <KV k="Сумма в пределах лимита" v={rub(detail.counterOffer.amount)} mono />
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted">Скоринг по этой заявке ещё не считался.</p>
                )}

                <Button type="button" className="mt-6" onClick={score} disabled={scoring || recorded != null}>
                  {scoring ? 'Считаем…' : detail.score ? 'Пересчитать' : 'Посчитать скоринг'}
                </Button>
                {recorded != null && <p className="mt-3 text-sm text-muted">Пересчёт закрыт: решение эксперта уже записано.</p>}
                {scoreError && <p className="mt-3 text-sm text-alfa">{scoreError}</p>}
              </Card>

              <Card className="p-8">
                <CardHeader
                  title="Решение эксперта"
                  subtitle="Одобрение и разбор доступны после скоринга. Отказ можно записать сразу."
                  action={
                    recorded && (
                      <Badge tone={decisionTone(recorded)} dot>
                        Записано: {decisionLabel[recorded] ?? recorded}
                      </Badge>
                    )
                  }
                />
                <div className="mt-6 flex flex-wrap gap-2">
                  {outcomes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setOutcome(item.id)
                        setDecisionError(null)
                      }}
                      className={cx(
                        'h-10 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors',
                        outcome === item.id ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-[#cfd4da]',
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <label className="mt-5 block">
                  <span className="text-sm font-medium text-ink">
                    {outcome === 'reject' ? 'Причина отказа' : 'Комментарий для клиента'}
                  </span>
                  <textarea
                    value={reason}
                    maxLength={1000}
                    rows={3}
                    onChange={(event) => setReason(event.target.value)}
                    className="mt-2 w-full resize-y rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-ink"
                    placeholder={outcome === 'reject' ? 'Почему банк отказывает' : 'Что клиент должен увидеть вместе с решением'}
                  />
                </label>
                <Button type="button" className="mt-5" onClick={decide} disabled={deciding}>
                  {deciding ? 'Записываем…' : 'Записать решение'}
                </Button>
                {decisionError && <p className="mt-3 text-sm text-alfa">{decisionError}</p>}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
