import { useEffect, useState } from 'react'
import { answerApplication, getApplication, listApplications, listStatus, purposeMatches, saveStatement, type ApplicationDetail, type ApplicationListItem } from '../api/applications'
import { cx } from '../components/cx'
import { DocumentsCard } from '../components/DocumentsCard'
import { FinancesCard } from '../components/FinancesCard'
import { GoodsCard } from '../components/GoodsCard'
import { Icon } from '../components/Icon'
import type { Scenario } from '../components/Shell'
import { Badge, Button, Card, CardHeader } from '../components/ui'
import { annuity, monthLabel, months, rub } from '../format'

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

const stepProgress: Record<string, number> = {
  submitted: 1,
  registryCheck: 2,
  scoring: 3,
  decision: 4,
}

export function Tracker({
  scenario,
  applicationNumber,
  live,
  onOpen,
  onBack,
}: {
  scenario: Scenario
  applicationNumber: number | null
  live: boolean
  onOpen: (number: number) => void
  onBack: () => void
}) {
  if (!live && applicationNumber == null) return <DemoTracker scenario={scenario} />
  if (applicationNumber == null) return <ApplicationList onOpen={onOpen} />
  return <LiveApplication number={applicationNumber} onBack={onBack} />
}

function ApplicationList({ onOpen }: { onOpen: (number: number) => void }) {
  const [rows, setRows] = useState<ApplicationListItem[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancel = false
    listApplications()
      .then((list) => {
        if (!cancel) setRows(list)
      })
      .catch(() => {
        if (!cancel) setFailed(true)
      })
    return () => {
      cancel = true
    }
  }, [])

  return (
    <div>
      <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-ink">Мои заявки</h1>
      <p className="mt-2 text-sm text-muted">Выберите заявку, чтобы открыть статус и решение банка</p>
      <Card className="mt-6 p-8">
        {failed && <p className="text-sm text-ink">Не удалось загрузить заявки.</p>}
        {!failed && rows == null && <p className="text-sm text-muted">Загружаем заявки…</p>}
        {rows?.length === 0 && <p className="text-sm text-muted">Пока нет отправленных заявок.</p>}
        {rows && rows.length > 0 && (
          <div>
            <div className="grid grid-cols-[1.1fr_2fr_1.1fr_0.8fr_2fr_1.3fr_32px] gap-4 border-b border-line pb-3 text-xs font-medium text-muted">
              <span>Номер</span>
              <span>Компания</span>
              <span className="text-right">Сумма</span>
              <span className="text-right">Срок</span>
              <span>Этап конвейера</span>
              <span>Статус</span>
              <span />
            </div>
            {rows.map((app) => {
              const progress = stepProgress[app.step] ?? 1
              const status = listStatus(app.employeeDecision, app.stepTitle)
              return (
                <button
                  key={app.number}
                  type="button"
                  onClick={() => onOpen(app.number)}
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
                    <Badge tone={status.tone} dot>
                      {status.label}
                    </Badge>
                  </span>
                  <Icon name="chevronRight" size={18} className="text-muted" />
                </button>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

const liveStages = ['Заявка подана', 'Проверка ФНС и БКИ', 'Кредитный скоринг', 'Решение банка']

const clientDecision: Record<string, { title: string; short: string }> = {
  approve: { title: 'Банк одобрил заявку', short: 'Одобрено' },
  review: { title: 'Банк оставил заявку на разбор', short: 'На разборе' },
  reject: { title: 'Банк отказал в кредите', short: 'Отказ' },
}

const productLabel: Record<string, string> = {
  ordinary: 'Обычный кредит',
  'msp-subsidized': 'Льготный кредит МСП',
}

const scoreDecisionLabel: Record<string, string> = {
  approve: 'Одобрение',
  review: 'Разбор',
  reject: 'Отказ',
}

const stopLabel: Record<string, string> = {
  liquidated: 'Ликвидация',
  overdue: 'Текущая просрочка в БКИ',
  accountBlocked: 'Блокировка счёта',
}

function scoreTone(decision: string): 'ok' | 'warn' | 'danger' | 'info' {
  if (decision === 'approve') return 'ok'
  if (decision === 'reject') return 'danger'
  if (decision === 'review') return 'warn'
  return 'info'
}

function ScoreBreakdown({ score }: { score: NonNullable<ApplicationDetail['score']> }) {
  const capped = typeof score.totalBeforeCap === 'number' && score.totalBeforeCap !== score.total

  return (
    <Card className="p-8">
      <CardHeader
        title="Скоринг"
        subtitle="Баллы по карточке компании. Итог ограничен диапазоном от 0 до 100."
        action={
          <Badge tone={scoreTone(score.decision)} dot>
            {scoreDecisionLabel[score.decision] ?? score.decision}
          </Badge>
        }
      />
      <div className="mt-6">
        <div className="tnum text-[40px] leading-none font-semibold tracking-[-0.03em] text-ink">
          {score.total}
          <span className="text-xl text-muted">/100</span>
        </div>
        {capped && (
          <p className="mt-2 text-sm text-muted">
            Сумма факторов {score.totalBeforeCap}. На экране показано {score.total}.
          </p>
        )}
        <p className="mt-3 max-w-xl text-sm text-ink">{score.reason}</p>
        {(score.stops?.fired?.length ?? 0) > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {score.stops?.fired?.map((code) => (
              <Badge key={code} tone="danger">
                {stopLabel[code] ?? code}
              </Badge>
            ))}
          </div>
        )}
        <ul className="mt-6 divide-y divide-line">
          {score.points?.map((point) => (
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
      </div>
    </Card>
  )
}

function ScoreLimit({
  requestedAmount,
  product,
  counter,
}: {
  requestedAmount: number
  product: NonNullable<ApplicationDetail['product']>
  counter: NonNullable<ApplicationDetail['counterOffer']>
}) {
  const covered = counter.amount >= requestedAmount && counter.amount > 0
  const empty = counter.amount <= 0
  const title = covered ? 'Запрошенная сумма входит в лимит' : 'Лимит по скорингу'
  const subtitle = covered
    ? 'Сумма заявки не выше лимита, который даёт балл'
    : empty
      ? 'По текущему баллу лимит нулевой, запрошенная сумма в него не входит'
      : 'В лимит входит меньшая сумма, чем в заявке'

  return (
    <Card className="p-8">
      <CardHeader title={title} subtitle={subtitle} />
      <dl className="mt-6 grid grid-cols-3 gap-x-10 gap-y-4 text-sm">
        <div>
          <dt className="text-muted">Продукт</dt>
          <dd className="mt-1 text-lg font-semibold text-ink">{productLabel[product.code] ?? product.code}</dd>
        </div>
        <div>
          <dt className="text-muted">Лимит по баллу</dt>
          <dd className="tnum mt-1 text-lg font-semibold text-ink">{rub(product.maxAmount)}</dd>
        </div>
        <div>
          <dt className="text-muted">К выдаче</dt>
          <dd className="tnum mt-1 text-lg font-semibold text-ink">
            {rub(counter.amount)}
            <span className="text-sm font-medium text-muted"> · {months(counter.termMonths)}</span>
          </dd>
        </div>
      </dl>
    </Card>
  )
}

type TurnoverDraft = { month: string; incoming: string; outgoing: string }

const exampleIncoming = [16_000_000, 15_500_000, 16_500_000, 17_000_000, 15_000_000, 16_000_000]
const exampleOutgoing = [12_000_000, 11_800_000, 12_400_000, 13_000_000, 11_200_000, 12_100_000]

function recentMonths(): TurnoverDraft[] {
  const now = new Date()
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (6 - index), 1)
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return { month, incoming: '', outgoing: '' }
  })
}

function parseMoney(text: string) {
  const normalized = text.replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

function LiveApplication({ number, onBack }: { number: number; onBack: () => void }) {
  const [loaded, setLoaded] = useState<{ number: number; detail: ApplicationDetail | null; failed: boolean } | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [answering, setAnswering] = useState<number | null>(null)
  const [answerError, setAnswerError] = useState<string | null>(null)
  const [rows, setRows] = useState(recentMonths)
  const [editing, setEditing] = useState(false)
  const [savingStatement, setSavingStatement] = useState(false)
  const [statementError, setStatementError] = useState<string | null>(null)

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
  const goalMatches = purposeMatches(detail?.purposeCategory)

  const fillExample = () => {
    setRows((current) =>
      current.map((row, index) => ({
        ...row,
        incoming: String(exampleIncoming[index] ?? 0),
        outgoing: String(exampleOutgoing[index] ?? 0),
      })),
    )
    setStatementError(null)
  }

  const sendStatement = async () => {
    const turnover = []
    for (const row of rows) {
      const incoming = parseMoney(row.incoming)
      const outgoing = parseMoney(row.outgoing)
      if (incoming == null || outgoing == null) {
        setStatementError('Укажите поступления и списания за каждый месяц')
        return
      }
      turnover.push({ month: row.month, incoming, outgoing })
    }
    setSavingStatement(true)
    setStatementError(null)
    try {
      await saveStatement(number, turnover)
      const app = await getApplication(number)
      setLoaded({ number, detail: app, failed: false })
      setEditing(false)
    } catch (error) {
      setStatementError(error instanceof Error ? error.message : 'Не удалось передать выписку')
    } finally {
      setSavingStatement(false)
    }
  }

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
        <button type="button" onClick={onBack} className="cursor-pointer text-sm font-medium text-muted hover:text-ink">
          Все заявки
        </button>
        <p className="tnum mt-3 text-sm text-muted">Заявка #{number}</p>
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

          {detail.finances && (
            <FinancesCard
              finances={detail.finances}
              amount={detail.amount}
              subtitle="Цифры, которые вы указали при подаче"
            />
          )}

          {(detail.documents?.length ?? 0) > 0 && (
            <DocumentsCard
              documents={detail.documents ?? []}
              subtitle="Названия файлов из формы. Содержимое на сервер не отправлялось"
            />
          )}

          <GoodsCard key={detail.number} number={detail.number} subtitle="Ссылки на товары магазинов в пределах суммы кредита" />

          <StatementCard
            statement={detail.statement}
            rows={rows}
            editing={editing}
            saving={savingStatement}
            error={statementError}
            onEdit={() => {
              const saved = detail.statement?.turnover ?? []
              if (saved.length >= 6) {
                setRows(saved.map((row) => ({ month: row.month, incoming: String(row.incoming), outgoing: String(row.outgoing) })))
              }
              setEditing(true)
              setStatementError(null)
            }}
            onChange={(index, field, value) => {
              setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)))
              setStatementError(null)
            }}
            onExample={fillExample}
            onSend={sendStatement}
          />

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
            {goalMatches.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {goalMatches.map((match) => (
                  <li key={match.code} className="rounded-full bg-canvas px-3 py-1.5 text-xs font-medium text-ink">
                    {match.title}
                  </li>
                ))}
              </ul>
            )}
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

          {detail.score && <ScoreBreakdown score={detail.score} />}

          {detail.product && detail.counterOffer && (
            <ScoreLimit requestedAmount={detail.amount} product={detail.product} counter={detail.counterOffer} />
          )}
        </>
      )}
    </div>
  )
}

function StatementCard({
  statement,
  rows,
  editing,
  saving,
  error,
  onEdit,
  onChange,
  onExample,
  onSend,
}: {
  statement: ApplicationDetail['statement']
  rows: TurnoverDraft[]
  editing: boolean
  saving: boolean
  error: string | null
  onEdit: () => void
  onChange: (index: number, field: 'incoming' | 'outgoing', value: string) => void
  onExample: () => void
  onSend: () => void
}) {
  const saved = statement?.consent === true && statement.turnover.length > 0 ? statement.turnover : null
  const showForm = editing || saved == null
  const incoming = saved?.reduce((sum, row) => sum + row.incoming, 0) ?? 0
  const outgoing = saved?.reduce((sum, row) => sum + row.outgoing, 0) ?? 0

  return (
    <Card className="p-8">
      <CardHeader
        title="Выписка по счёту"
        subtitle="Шесть месяцев оборотов сохраняются в заявке"
        action={
          saved && !showForm ? (
            <Badge tone="ok" dot>
              Передана
            </Badge>
          ) : undefined
        }
      />
      {saved && !showForm ? (
        <>
          <TurnoverTable rows={saved} incoming={incoming} outgoing={outgoing} />
          <Button type="button" variant="secondary" className="mt-6" onClick={onEdit}>
            Исправить обороты
          </Button>
        </>
      ) : (
        <>
          <div className="mt-6 overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-[1.2fr_1fr_1fr] bg-canvas px-4 py-2 text-xs text-muted">
              <span>Месяц</span>
              <span>Поступления, ₽</span>
              <span>Списания, ₽</span>
            </div>
            {rows.map((row, index) => (
              <div key={row.month} className="grid grid-cols-[1.2fr_1fr_1fr] items-center gap-3 border-t border-line px-4 py-2.5">
                <span className="text-sm text-ink">{monthLabel(row.month)}</span>
                <input
                  inputMode="decimal"
                  aria-label={`${monthLabel(row.month)}, поступления`}
                  value={row.incoming}
                  onChange={(event) => onChange(index, 'incoming', event.target.value)}
                  className="tnum h-10 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-ink"
                  placeholder="0"
                />
                <input
                  inputMode="decimal"
                  aria-label={`${monthLabel(row.month)}, списания`}
                  value={row.outgoing}
                  onChange={(event) => onChange(index, 'outgoing', event.target.value)}
                  className="tnum h-10 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-ink"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <Button type="button" variant="secondary" onClick={onExample}>
              Подставить пример
            </Button>
            <Button type="button" onClick={onSend} disabled={saving}>
              {saving ? 'Передаём…' : 'Передать банку'}
            </Button>
          </div>
          {error && <p className="mt-3 text-sm text-alfa">{error}</p>}
        </>
      )}
    </Card>
  )
}

function TurnoverTable({
  rows,
  incoming,
  outgoing,
}: {
  rows: Array<{ month: string; incoming: number; outgoing: number }>
  incoming: number
  outgoing: number
}) {
  return (
    <table className="mt-6 w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th className="pb-2 font-medium">Месяц</th>
          <th className="pb-2 text-right font-medium">Поступления</th>
          <th className="pb-2 text-right font-medium">Списания</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.month} className="border-t border-line">
            <td className="py-2.5 text-ink">{monthLabel(row.month)}</td>
            <td className="tnum py-2.5 text-right text-ink">{rub(row.incoming)}</td>
            <td className="tnum py-2.5 text-right text-ink">{rub(row.outgoing)}</td>
          </tr>
        ))}
        <tr className="border-t border-line font-semibold">
          <td className="py-2.5 text-ink">Итого</td>
          <td className="tnum py-2.5 text-right text-ink">{rub(incoming)}</td>
          <td className="tnum py-2.5 text-right text-ink">{rub(outgoing)}</td>
        </tr>
      </tbody>
    </table>
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
