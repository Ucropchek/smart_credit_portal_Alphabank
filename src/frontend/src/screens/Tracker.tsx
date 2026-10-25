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
import { preliminaryRate } from '../productRate'

const stepProgress: Record<string, number> = {
  submitted: 1,
  registryCheck: 2,
  scoring: 3,
  decision: 4,
}

const scenarioTitle: Record<Scenario, string> = {
  counter: 'Встречное предложение',
  approved: 'Полное одобрение',
  clarify: 'Запрос уточнения',
}

export function Tracker({
  scenario,
  scenarioArmed,
  applicationNumber,
  onOpen,
  onBack,
}: {
  scenario: Scenario
  scenarioArmed: boolean
  applicationNumber: number | null
  onOpen: (number: number) => void
  onBack: () => void
}) {
  if (scenarioArmed && applicationNumber == null) return <ScenarioApplication scenario={scenario} onBack={onBack} />
  if (applicationNumber == null) return <ApplicationList onOpen={onOpen} />
  return <LiveApplication number={applicationNumber} onBack={onBack} />
}

function ApplicationList({ onOpen }: { onOpen: (number: number) => void }) {
  const [rows, setRows] = useState<ApplicationListItem[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancel = false
    let seen = false
    const load = () => {
      listApplications()
        .then((list) => {
          if (cancel) return
          seen = true
          setFailed(false)
          setRows(list)
        })
        .catch(() => {
          if (!cancel && !seen) setFailed(true)
        })
    }
    load()
    const timer = window.setInterval(load, 8000)
    return () => {
      cancel = true
      window.clearInterval(timer)
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
  termMonths,
  purpose,
  product,
  counter,
}: {
  requestedAmount: number
  termMonths: number
  purpose: string
  product: NonNullable<ApplicationDetail['product']>
  counter: NonNullable<ApplicationDetail['counterOffer']>
}) {
  const rate = preliminaryRate(purpose, requestedAmount, termMonths)
  const payment = rate == null || counter.amount <= 0 ? null : annuity(counter.amount, rate, counter.termMonths)
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
        {rate != null && (
          <div>
            <dt className="text-muted">Предварительная ставка</dt>
            <dd className="tnum mt-1 text-lg font-semibold text-ink">от {rate.toLocaleString('ru-RU')}%</dd>
          </div>
        )}
        {payment != null && (
          <div>
            <dt className="text-muted">Платёж по этой ставке</dt>
            <dd className="tnum mt-1 text-lg font-semibold text-ink">{rub(payment)}/мес</dd>
          </div>
        )}
      </dl>
      {rate != null && <p className="mt-4 text-xs text-muted">Ставка продукта из калькулятора. Балл её не считает.</p>}
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
    let seen = false
    const load = () => {
      getApplication(number)
        .then((app) => {
          if (cancel) return
          seen = true
          setLoaded({ number, detail: app, failed: false })
        })
        .catch(() => {
          if (!cancel && !seen) setLoaded({ number, detail: null, failed: true })
        })
    }
    load()
    const timer = window.setInterval(load, 5000)
    return () => {
      cancel = true
      window.clearInterval(timer)
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
              registry={detail.registries?.fns}
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
            <ScoreLimit
              requestedAmount={detail.amount}
              termMonths={detail.termMonths}
              purpose={detail.purpose}
              product={detail.product}
              counter={detail.counterOffer}
            />
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

function matchScenario(rows: ApplicationListItem[], scenario: Scenario) {
  const latest = [...rows].reverse()
  if (scenario === 'clarify') return latest.find((row) => (row.openRequestCount ?? 0) > 0) ?? null
  const approved = latest.filter((row) => row.employeeDecision === 'approve' && (row.counterAmount ?? 0) > 0)
  if (scenario === 'approved') return approved.find((row) => (row.counterAmount ?? 0) >= row.amount) ?? null
  return approved.find((row) => (row.counterAmount ?? 0) < row.amount) ?? null
}

function ScenarioApplication({ scenario, onBack }: { scenario: Scenario; onBack: () => void }) {
  const [picked, setPicked] = useState<{ scenario: Scenario; number: number | null; failed: boolean } | null>(null)

  useEffect(() => {
    let cancel = false
    listApplications()
      .then((rows) => {
        if (cancel) return
        const match = matchScenario(rows, scenario)
        setPicked({ scenario, number: match?.number ?? null, failed: false })
      })
      .catch(() => {
        if (!cancel) setPicked({ scenario, number: null, failed: true })
      })
    return () => {
      cancel = true
    }
  }, [scenario])

  const current = picked?.scenario === scenario ? picked : null
  if (!current) return <p className="text-sm text-muted">Ищем заявку под сценарий…</p>
  if (current.failed) {
    return (
      <Card className="p-8">
        <p className="text-sm text-ink">Не удалось загрузить заявки для сценария.</p>
      </Card>
    )
  }
  if (current.number == null) {
    const empty =
      scenario === 'clarify'
        ? 'Сейчас нет заявки, по которой банк ждёт ответ.'
        : scenario === 'approved'
          ? 'Сейчас нет одобренной заявки, где сумма к выдаче покрывает запрос.'
          : 'Сейчас нет одобренной заявки, где банк выдал меньшую сумму, чем просили.'
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-ink">{scenarioTitle[scenario]}</h1>
          <p className="mt-2 text-sm text-muted">{empty}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onBack}>
          Все заявки
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Сценарий «{scenarioTitle[scenario]}» открыт на заявке #{current.number}
      </p>
      <LiveApplication number={current.number} onBack={onBack} />
    </div>
  )
}
