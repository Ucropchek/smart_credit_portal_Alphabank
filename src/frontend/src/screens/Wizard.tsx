import { useEffect, useRef, useState } from 'react'
import { createApplication, matchPurpose, type LoanDraft, type PurposeMatch } from '../api/applications'
import { useBkiConsent } from '../api/bkiConsent'
import { lookupBusiness, mspProfile, registrationId, type BusinessCard, type BkiObligation } from '../api/businesses'
import { entrepreneurName, hasRegistryRecord, lookupCompany, type CompanyLookup } from '../api/companies'
import { cx } from '../components/cx'
import { annuity, months, rub } from '../format'
import { Icon } from '../components/Icon'
import { Badge, Button, Card, CardHeader, Field, KV, Slider, inputCls } from '../components/ui'

type Doc = { name: string; size: string; kind: string; state: 'ok' | 'checking' }

const required = ['Бухгалтерский баланс (ф. 1)', 'Отчёт о финансовых результатах (ф. 2)', 'Устав компании']

function Stepper({ step }: { step: number }) {
  const steps = ['О компании', 'Параметры и финансы', 'Документы']
  return (
    <Card className="flex items-center gap-4 px-8 py-5">
      {steps.map((label, index) => {
        const n = index + 1
        const done = n < step
        const active = n === step
        return (
          <div key={label} className="flex flex-1 items-center gap-4 last:flex-none">
            <div className="flex items-center gap-3">
              <span
                className={cx(
                  'tnum grid size-8 place-items-center rounded-full text-sm font-semibold transition-colors',
                  done && 'bg-ink text-white',
                  active && 'bg-alfa text-white',
                  !done && !active && 'border border-line bg-white text-muted',
                )}
              >
                {done ? <Icon name="check" size={16} strokeWidth={2.5} /> : n}
              </span>
              <span className={cx('text-sm font-medium whitespace-nowrap', done || active ? 'text-ink' : 'text-muted')}>
                {label}
              </span>
            </div>
            {n < 3 && <span className={cx('h-px flex-1', done ? 'bg-ink' : 'bg-line')} />}
          </div>
        )
      })}
    </Card>
  )
}

const numFmt = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits ? new Intl.NumberFormat('ru-RU').format(Number(digits)) : ''
}

type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; company: CompanyLookup; profile: BusinessCard | null; profileFailed: boolean }

const mspCategory: Record<string, string> = {
  '1': 'Микропредприятие',
  '2': 'Малое предприятие',
  '3': 'Среднее предприятие',
}

const procedureName: Record<string, string> = {
  FinancialRecovery: 'Финансовое оздоровление',
  ExternalManagement: 'Внешнее управление',
  Tender: 'Конкурсное производство',
  Watching: 'Наблюдение',
  CitizenAssetsDisposal: 'Реализация имущества гражданина',
  CitizenDebtRestructuring: 'Реструктуризация долгов гражданина',
}

const scheduleName: Record<string, string> = {
  '1': 'срок платежа не наступил',
  '2': 'платежи вовремя',
  '3': 'платежи с просрочкой',
}

const roleName: Record<string, string> = {
  company: 'компания',
  entrepreneur: 'предприниматель',
  director: 'руководитель',
  founder: 'учредитель',
}

function ruDate(iso: string) {
  const [year, month, day] = iso.split('-')
  return day && month && year ? `${day}.${month}.${year}` : iso
}

function roleLabel(whose: BkiObligation['whose']) {
  const roles = Array.isArray(whose) ? whose : [whose]
  return roles.map((role) => roleName[role] ?? role).join(', ')
}

function RegistryCard({
  company,
  profile,
  profileFailed,
}: {
  company: CompanyLookup
  profile: BusinessCard | null
  profileFailed: boolean
}) {
  const entity = company.legalEntities[0]
  const person = company.entrepreneurs[0]
  const founded = company.foundedOrganizations[0]
  const title = profile?.business.name ?? entity?.shortName ?? (person ? entrepreneurName(person) : founded?.shortName ?? 'Запись реестра')
  const inn = profile?.business.inn ?? entity?.inn ?? person?.inn ?? founded?.inn
  const msp = profile ? mspProfile(profile) : null
  const liquidated = profile?.business.liquidated ?? false
  const statusNote = profile?.business.status
  const flags = profile
    ? [
        profile.stops.overdue ? 'Просрочка в БКИ' : null,
        profile.fns.disqualified ? 'Дисквалификация' : null,
        profile.fns.massLeader ? 'Массовый руководитель' : null,
        profile.fns.massFounder ? 'Массовый учредитель' : null,
        profile.fns.massAddress ? 'Массовый адрес' : null,
        profile.fns.hasBailiffDebt ? 'Долг у приставов' : null,
        msp?.newBusiness ? 'Вновь созданный' : null,
        profile.fns.accountBlocked ? 'Счёт заблокирован' : null,
      ].filter((flag): flag is string => Boolean(flag))
    : []

  return (
    <div className="animate-fade-up mt-6 rounded-xl border border-line">
      <div className="flex items-center gap-4 border-b border-line px-6 py-5">
        <div className="grid size-12 place-items-center rounded-xl bg-canvas text-ink">
          <Icon name={entity || founded || profile?.business.kind === 'legal_entity' ? 'building' : 'user'} size={22} />
        </div>
        <div className="flex-1">
          <div className="text-[17px] font-semibold text-ink">{title}</div>
          {inn && <div className="tnum text-sm text-muted">ИНН {inn}</div>}
          {profile?.business.registrationDate && (
            <div className="mt-1 text-sm text-muted">с {ruDate(profile.business.registrationDate)}</div>
          )}
        </div>
        <Badge
          tone={!profile ? 'ok' : liquidated ? 'danger' : profile.fedresurs.bankruptcyActive || statusNote ? 'warn' : 'ok'}
          dot
        >
          {!profile
            ? 'Найдено в реестре'
            : liquidated
              ? 'Прекращена'
              : profile.fedresurs.bankruptcyActive
                ? 'Банкротство'
                : statusNote
                  ? 'Особый статус'
                  : 'Действующая'}
        </Badge>
      </div>
      {statusNote && <div className="border-b border-line px-6 py-3 text-sm text-ink">{statusNote}</div>}
      <div className="grid grid-cols-3 gap-x-8 gap-y-5 px-6 py-5">
        {entity && <KV k="ОГРН" v={entity.ogrn} mono />}
        {person && <KV k="ОГРНИП" v={person.ogrnip} mono />}
        {person && entity && <KV k="ИП" v={entrepreneurName(person)} />}
        {profile && (
          <KV
            k="МСП"
            v={
              msp
                ? [mspCategory[msp.categoryCode ?? ''] ?? 'Категория не указана', msp.headcount == null ? null : `численность ${msp.headcount.toLocaleString('ru-RU')}`]
                    .filter(Boolean)
                    .join(' · ')
                : 'Нет в реестре'
            }
          />
        )}
        {profile && (
          <KV k="Налоговая задолженность" v={profile.fns.arrearsTotal == null ? 'Нет данных' : rub(profile.fns.arrearsTotal)} mono />
        )}
        {profile && (
          <KV
            k="Иски к ответчику"
            v={
              profile.arbitration.openDefendantCases > 0
                ? `${profile.arbitration.openDefendantCases} · ${rub(profile.arbitration.openClaimSum)}`
                : 'Нет открытых дел'
            }
            mono
          />
        )}
        {profile && (
          <KV
            k="Банкротство"
            v={
              profile.fedresurs.bankruptcyActive
                ? procedureName[profile.fedresurs.procedureType ?? ''] ?? profile.fedresurs.procedureType ?? 'Процедура идёт'
                : 'Нет действующей процедуры'
            }
          />
        )}
        {profile && <KV k="Залог" v={profile.fedresurs.pledgeActive ? 'Есть действующий залог' : 'Нет'} />}
        {profile && profile.fns.accountBlocked == null && <KV k="Блокировка счёта" v="Нет данных" />}
        {company.foundedOrganizations.map((organization) => (
          <KV
            key={organization.ogrn}
            k="Доля в организации"
            v={`${organization.shortName} · ${organization.sharePercent.toLocaleString('ru-RU')}%`}
          />
        ))}
      </div>
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-2 px-6 pb-5">
          {flags.map((flag) => (
            <Badge key={flag} tone="warn">
              {flag}
            </Badge>
          ))}
        </div>
      )}
      {profile && profile.bki.length > 0 && (
        <div className="space-y-3 border-t border-line px-6 py-5">
          <div className="text-xs text-muted">Обязательства в БКИ</div>
          {profile.bki.map((row, index) => (
            <div key={`${row.inn}-${index}`} className="text-sm text-ink">
              <span className="font-medium">{roleLabel(row.whose)}</span>
              <span className="text-muted"> · ИНН {row.inn} · </span>
              <span className="tnum">просрочка {rub(row.debtOverdueSum)}</span>
              <span className="text-muted"> · {scheduleName[row.scheduleCode ?? ''] ?? 'код срока не указан'}</span>
            </div>
          ))}
        </div>
      )}
      {profileFailed && (
        <div className="border-t border-line px-6 py-3 text-sm text-muted">Карточка ФНС, МСП, БКИ и Федресурса не загрузилась</div>
      )}
      <div className="flex items-center gap-2 border-t border-line bg-canvas/50 px-6 py-3 text-xs text-muted">
        <Icon name="shield" size={14} className="text-ok" />
        {profile ? 'Источник: ЕГРЮЛ, ЕГРИП, ФНС, МСП, БКИ, Федресурс и арбитраж' : 'Источник: ЕГРЮЛ и ЕГРИП'}
      </div>
    </div>
  )
}

const purposePresets = [
  'Пополнение оборотных средств',
  'Покупка оборудования',
  'Исполнение контракта',
  'Ремонт и модернизация',
  'Покупка транспорта',
]

function consentText(link: 'connecting' | 'open' | 'closed', saved: boolean | null) {
  if (link === 'connecting') return 'Подключаемся к серверу согласия…'
  if (link === 'closed') return 'Нет связи с сервером согласия'
  if (saved === true) return 'Согласие записано на сервере'
  if (saved === false) return 'Отказ записан на сервере'
  return 'Отметка ещё не записана. Она живёт, пока открыта эта страница.'
}

function PurposeMatchList({
  purpose,
  matched,
}: {
  purpose: string
  matched: { text: string; matches: PurposeMatch[]; failed: boolean } | null
}) {
  const asked = purpose.trim()
  if (asked.length < 2) return null
  const current = matched?.text === asked ? matched : null
  if (!current) return <p className="mt-3 text-sm text-muted">Смотрим справочник товаров…</p>
  if (current.failed) return <p className="mt-3 text-sm text-alfa">Не удалось разобрать цель</p>
  if (current.matches.length === 0) return <p className="mt-3 text-sm text-muted">По этому тексту конкретные категории не нашлись.</p>
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {current.matches.map((item) => (
        <li key={item.code} className="rounded-full bg-canvas px-3 py-1.5 text-xs font-medium text-ink">
          {item.title}
        </li>
      ))}
    </ul>
  )
}

export function Wizard({ initial, onSubmit }: { initial: LoanDraft; onSubmit: (number: number) => void }) {
  const consent = useBkiConsent()
  const [purpose, setPurpose] = useState(initial.purpose)
  const [matchedPurpose, setMatchedPurpose] = useState<{ text: string; matches: PurposeMatch[]; failed: boolean } | null>(null)
  const [amount, setAmount] = useState(initial.amount)
  const [termMonths, setTermMonths] = useState(initial.termMonths)
  const [inn, setInn] = useState('7701990013')
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' })
  const [revenue, setRevenue] = useState('186 400 000')
  const [debt, setDebt] = useState('22 500 000')
  const [employees, setEmployees] = useState('84')
  const [docs, setDocs] = useState<Doc[]>([
    { name: 'Баланс_2025.pdf', size: '1,2 МБ', kind: required[0], state: 'ok' },
    { name: 'ОФР_2025.pdf', size: '860 КБ', kind: required[1], state: 'ok' },
  ])
  const [drag, setDrag] = useState(false)
  const [sending, setSending] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const text = purpose.trim()
    if (text.length < 2) return
    let cancel = false
    const timer = window.setTimeout(() => {
      matchPurpose(text)
        .then((matches) => {
          if (!cancel) setMatchedPurpose({ text, matches, failed: false })
        })
        .catch(() => {
          if (!cancel) setMatchedPurpose({ text, matches: [], failed: true })
        })
    }, 350)
    return () => {
      cancel = true
      window.clearTimeout(timer)
    }
  }, [purpose])

  const runEnrich = async () => {
    const digits = inn.replace(/\D/g, '')
    if (digits.length < 10) return
    setLookup({ status: 'loading' })
    try {
      const company = await lookupCompany(digits)
      if (!hasRegistryRecord(company)) {
        setLookup({ status: 'empty' })
        return
      }
      const id = registrationId(company)
      let profile: BusinessCard | null = null
      let profileFailed = false
      if (id) {
        try {
          profile = await lookupBusiness(id)
        } catch {
          profileFailed = true
        }
      }
      setLookup({ status: 'ready', company, profile, profileFailed })
    } catch {
      setLookup({ status: 'error' })
    }
  }

  const addFiles = (files: FileList | null) => {
    const list = files && files.length ? Array.from(files).map((file) => file.name) : ['Устав_ООО_Вектор.pdf']
    list.forEach((name, index) => {
      const kind = required.find((item) => !docs.some((doc) => doc.kind === item)) ?? 'Дополнительный документ'
      const doc: Doc = { name, size: '640 КБ', kind, state: 'checking' }
      setDocs((current) => [...current, doc])
      setTimeout(
        () => setDocs((current) => current.map((item) => (item === doc ? { ...item, state: 'ok' } : item))),
        900 + index * 300,
      )
    })
  }

  const attachSamples = () => {
    const missing = required.filter((item) => !docs.some((doc) => doc.kind === item))
    const added: Doc[] = missing.map((kind) => ({ name: `${kind}.pdf`, size: '640 КБ', kind, state: 'checking' }))
    if (!added.length) return
    setDocs((current) => [...current, ...added])
    added.forEach((doc, index) => {
      setTimeout(
        () => setDocs((current) => current.map((item) => (item.kind === doc.kind ? { ...item, state: 'ok' } : item))),
        400 + index * 200,
      )
    })
  }

  const step1 = lookup.status === 'ready'
  const step2 = step1 && revenue.length > 0 && debt.length > 0
  const step3 = step2 && required.every((item) => docs.some((doc) => doc.kind === item && doc.state === 'ok'))
  const step = !step1 ? 1 : !step2 ? 2 : !step3 ? 3 : 4
  const revenueValue = Number(revenue.replace(/\D/g, '')) || 0
  const debtValue = Number(debt.replace(/\D/g, '')) || 0
  const load = revenueValue ? Math.round(((debtValue + amount) / revenueValue) * 100) : 0
  const foundId = lookup.status === 'ready' ? registrationId(lookup.company) : null
  const purposeReady = purpose.trim().length > 0
  const payment = annuity(amount, 19.9, termMonths)

  const send = async () => {
    if (!foundId || !purposeReady) return
    setSending(true)
    setSubmitError(null)
    try {
      const revenueDigits = revenue.replace(/\D/g, '')
      const debtDigits = debt.replace(/\D/g, '')
      const marked = docs.filter((doc) => doc.state === 'ok').map((doc) => ({ name: doc.name, kind: doc.kind }))
      const created = await createApplication({
        purpose: purpose.trim(),
        amount,
        termMonths,
        inn: inn.replace(/\D/g, ''),
        registrationId: foundId,
        ...(revenueDigits ? { annualRevenue: Number(revenueDigits) } : {}),
        ...(debtDigits ? { obligations: Number(debtDigits) } : {}),
        ...(/^\d+$/.test(employees) ? { employees: Number(employees) } : {}),
        ...(marked.length ? { documents: marked } : {}),
      })
      onSubmit(created.number)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось отправить заявку')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted">
            {purpose.trim() || 'Укажите цель кредита'} · {rub(amount)} · {months(termMonths)}
          </p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.025em] text-ink">Подача заявки</h1>
        </div>
        <span className="flex items-center gap-2 text-sm text-muted">
          <Icon name="clock" size={16} />
          Черновик сохранён автоматически
        </span>
      </div>

      <Stepper step={step} />

      <Card className="p-8">
        <CardHeader title="Цель кредита" subtitle="Напишите, на что нужны деньги. Категорию определим по тексту." />
        <div className="mt-6 flex flex-wrap gap-2">
          {purposePresets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setPurpose(preset)}
              className={cx(
                'h-10 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors',
                purpose === preset ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-[#cfd4da]',
              )}
            >
              {preset}
            </button>
          ))}
        </div>
        <label className="mt-5 block">
          <span className="text-sm font-medium text-ink">Как сформулировать цель</span>
          <textarea
            value={purpose}
            maxLength={1000}
            rows={3}
            onChange={(event) => setPurpose(event.target.value)}
            className="mt-2 w-full resize-y rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-ink"
            placeholder="Например, покупка оборудования для цеха"
          />
        </label>
        <PurposeMatchList purpose={purpose} matched={matchedPurpose} />
      </Card>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-8 space-y-6">
          <Card className="p-8">
            <CardHeader
              title="1. О компании"
              subtitle="Введите ИНН — остальное заполним из государственных реестров"
              action={
                lookup.status === 'ready' && (
                  <Badge tone="ok">
                    <Icon name="checkCircle" size={14} strokeWidth={2.25} />
                    {lookup.status === 'ready' && lookup.profile
                      ? 'Карточка реестров загружена'
                      : 'Данные из ЕГРЮЛ и ЕГРИП загружены'}
                  </Badge>
                )
              }
            />
            <div className="mt-6 flex items-end gap-3">
              <div className="w-[320px]">
                <Field label="ИНН организации">
                  <div className="relative">
                    <input
                      className={cx(inputCls, 'pr-11 font-medium')}
                      value={inn}
                      maxLength={12}
                      inputMode="numeric"
                      onChange={(event) => {
                        setInn(event.target.value.replace(/\D/g, ''))
                        setLookup({ status: 'idle' })
                      }}
                    />
                    {lookup.status === 'ready' && (
                      <Icon
                        name="checkCircle"
                        size={20}
                        className="absolute top-1/2 right-3.5 -translate-y-1/2 text-ok"
                      />
                    )}
                  </div>
                </Field>
              </div>
              <Button type="button" variant="secondary" onClick={runEnrich} disabled={lookup.status === 'loading'}>
                {lookup.status === 'loading' ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-line border-t-ink" />
                    Запрос в реестры…
                  </>
                ) : (
                  <>
                    <Icon name="search" size={16} />
                    Найти
                  </>
                )}
              </Button>
            </div>

            {lookup.status === 'ready' ? (
              <RegistryCard company={lookup.company} profile={lookup.profile} profileFailed={lookup.profileFailed} />
            ) : (
              <div className="mt-6 grid h-[188px] place-items-center rounded-xl border border-dashed border-line px-6 text-center text-sm text-muted">
                {lookup.status === 'loading' && 'Получаем данные из ЕГРЮЛ и ЕГРИП…'}
                {lookup.status === 'idle' && 'Нажмите «Найти», чтобы загрузить реквизиты'}
                {lookup.status === 'empty' && 'В реестре нет записи с таким ИНН'}
                {lookup.status === 'error' && 'Не удалось запросить реестр'}
              </div>
            )}
          </Card>

          <Card className="p-8">
            <CardHeader title="2. Параметры и финансы" subtitle="Показатели за последние 12 месяцев" />
            <div className="mt-6 grid grid-cols-3 gap-5">
              <Field label="Годовая выручка, ₽" hint="По данным ФНС: 181,2 млн ₽">
                <input className={inputCls} value={revenue} onChange={(event) => setRevenue(numFmt(event.target.value))} />
              </Field>
              <Field label="Текущие обязательства, ₽" hint="Кредиты и лизинг в других банках">
                <input className={inputCls} value={debt} onChange={(event) => setDebt(numFmt(event.target.value))} />
              </Field>
              <Field label="Сотрудников" hint="Среднесписочная численность">
                <input
                  className={inputCls}
                  value={employees}
                  onChange={(event) => setEmployees(event.target.value.replace(/\D/g, ''))}
                />
              </Field>
            </div>
            <div className="mt-6 flex items-center gap-4 rounded-xl bg-canvas px-5 py-4">
              <Icon name="info" size={20} className="text-info" />
              <div className="flex-1 text-sm text-ink">
                Долговая нагрузка с учётом нового кредита: <span className="tnum font-semibold">{load}%</span> от выручки
              </div>
              <Badge tone={load < 25 ? 'ok' : load < 40 ? 'warn' : 'danger'}>
                {load < 25 ? 'Низкая' : load < 40 ? 'Умеренная' : 'Высокая'}
              </Badge>
            </div>
          </Card>

          <Card className="p-8">
            <CardHeader
              title="3. Документы"
              subtitle="PDF, JPG или XLSX до 20 МБ. Проверяем формат и подписи автоматически"
            />
            <div
              onDragOver={(event) => {
                event.preventDefault()
                setDrag(true)
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDrag(false)
                addFiles(event.dataTransfer.files)
              }}
              onClick={() => fileRef.current?.click()}
              className={cx(
                'mt-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                drag ? 'border-alfa bg-danger-soft/40' : 'border-line hover:border-[#cfd4da] hover:bg-canvas/50',
              )}
            >
              <div className="grid size-12 place-items-center rounded-full bg-canvas text-ink">
                <Icon name="upload" size={22} />
              </div>
              <div className="mt-4 text-[15px] font-medium text-ink">Перетащите файлы сюда</div>
              <div className="mt-1 text-sm text-muted">
                или <span className="font-medium text-alfa">выберите на компьютере</span>
              </div>
              <button
                type="button"
                className="mt-4 cursor-pointer text-sm font-medium text-ink underline decoration-line underline-offset-4"
                onClick={(event) => {
                  event.stopPropagation()
                  attachSamples()
                }}
              >
                Приложить примеры
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={(event) => addFiles(event.target.files)}
              />
            </div>

            <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
              {required.map((item) => {
                const doc = docs.find((entry) => entry.kind === item)
                return (
                  <li key={item} className="flex items-center gap-4 px-5 py-3.5">
                    <span
                      className={cx(
                        'grid size-8 place-items-center rounded-lg',
                        doc?.state === 'ok' ? 'bg-ok-soft text-ok' : doc ? 'bg-info-soft text-info' : 'bg-canvas text-muted',
                      )}
                    >
                      {doc?.state === 'checking' ? (
                        <span className="size-3.5 animate-spin rounded-full border-2 border-info/30 border-t-info" />
                      ) : (
                        <Icon name={doc ? 'check' : 'file'} size={16} strokeWidth={doc ? 2.5 : 1.75} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{item}</div>
                      <div className="text-xs text-muted">{doc ? `${doc.name} · ${doc.size}` : 'Не загружен'}</div>
                    </div>
                    {doc?.state === 'ok' && <Badge tone="ok">Проверен</Badge>}
                    {doc?.state === 'checking' && <Badge tone="info">Проверка…</Badge>}
                    {!doc && <Badge tone="warn">Требуется</Badge>}
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>

        <div className="col-span-4">
          <div className="sticky top-6 space-y-6">
            <Card className="p-6">
              <div className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Ваша заявка</div>
              <div className="mt-4 text-[17px] font-semibold text-ink">{purpose.trim() || 'Цель не указана'}</div>
              <div className="mt-5 space-y-5">
                <Slider
                  label="Сумма кредита"
                  value={amount}
                  min={1_000_000}
                  max={30_000_000}
                  step={500_000}
                  onChange={setAmount}
                  format={rub}
                  minLabel="1 млн"
                  maxLabel="30 млн"
                />
                <Slider
                  label="Срок"
                  value={termMonths}
                  min={6}
                  max={36}
                  step={1}
                  onChange={setTermMonths}
                  format={months}
                  minLabel="6 мес"
                  maxLabel="36 мес"
                />
              </div>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Ставка</dt>
                  <dd className="tnum font-medium text-ink">от 19,9%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Платёж</dt>
                  <dd className="tnum font-medium text-ink">≈ {rub(payment)}/мес</dd>
                </div>
              </dl>
              <div className="mt-6 border-t border-line pt-5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Готовность заявки</span>
                  <span className="tnum font-semibold text-ink">{Math.min(step - 1, 3) * 33 + (step > 3 ? 1 : 0)}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-ok transition-all duration-500"
                    style={{ width: `${Math.min(step - 1, 3) * 33.34}%` }}
                  />
                </div>
              </div>
              <label className="mt-6 flex items-start gap-3 rounded-xl border border-line px-4 py-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-alfa"
                  checked={consent.checked}
                  disabled={consent.link !== 'open'}
                  onChange={(event) => consent.toggle(event.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium text-ink">Разрешаю запрос кредитной истории в БКИ</span>
                  <span className="mt-1 block text-xs text-muted">{consentText(consent.link, consent.saved)}</span>
                </span>
              </label>
              <Button type="button" size="lg" className="mt-6 w-full" disabled={!step3 || !purposeReady || !foundId || sending} onClick={send}>
                {sending ? 'Отправляем…' : 'Отправить в банк'}
              </Button>
              {submitError && <p className="mt-3 text-center text-xs text-alfa">{submitError}</p>}
              {!submitError && !purposeReady && <p className="mt-3 text-center text-xs text-muted">Укажите цель кредита</p>}
              {!submitError && purposeReady && lookup.status === 'ready' && !foundId && (
                <p className="mt-3 text-center text-xs text-muted">В реестре нет ОГРН или ОГРНИП, заявку отправить нельзя</p>
              )}
              {!submitError && (!step3 || !foundId) && purposeReady && lookup.status !== 'ready' && (
                <p className="mt-3 text-center text-xs text-muted">Найдите компанию и загрузите все обязательные документы</p>
              )}
              {!submitError && purposeReady && foundId && !step3 && (
                <p className="mt-3 text-center text-xs text-muted">Загрузите все обязательные документы</p>
              )}
            </Card>
            <div className="flex gap-3 rounded-2xl border border-line bg-white p-5 text-sm">
              <Icon name="shield" size={20} className="shrink-0 text-muted" />
              <p className="text-muted">
                Данные передаются по защищённому каналу и используются только для рассмотрения заявки.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
