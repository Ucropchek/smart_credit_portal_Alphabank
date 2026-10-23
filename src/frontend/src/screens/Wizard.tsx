import { useRef, useState } from 'react'
import { entrepreneurName, hasRegistryRecord, lookupCompany, type CompanyLookup } from '../api/companies'
import { cx } from '../components/cx'
import { Icon } from '../components/Icon'
import { Badge, Button, Card, CardHeader, Field, KV, inputCls } from '../components/ui'

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
  | { status: 'ready'; company: CompanyLookup }

function RegistryCard({ company }: { company: CompanyLookup }) {
  const entity = company.legalEntities[0]
  const person = company.entrepreneurs[0]
  const founded = company.foundedOrganizations[0]
  const title = entity?.shortName ?? (person ? entrepreneurName(person) : founded?.shortName ?? 'Запись реестра')
  const inn = entity?.inn ?? person?.inn ?? founded?.inn

  return (
    <div className="animate-fade-up mt-6 rounded-xl border border-line">
      <div className="flex items-center gap-4 border-b border-line px-6 py-5">
        <div className="grid size-12 place-items-center rounded-xl bg-canvas text-ink">
          <Icon name={entity || founded ? 'building' : 'user'} size={22} />
        </div>
        <div className="flex-1">
          <div className="text-[17px] font-semibold text-ink">{title}</div>
          {inn && <div className="tnum text-sm text-muted">ИНН {inn}</div>}
        </div>
        <Badge tone="ok" dot>
          Найдено в реестре
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-x-8 gap-y-5 px-6 py-5">
        {entity && <KV k="ОГРН" v={entity.ogrn} mono />}
        {person && <KV k="ОГРНИП" v={person.ogrnip} mono />}
        {person && entity && <KV k="ИП" v={entrepreneurName(person)} />}
        {company.foundedOrganizations.map((organization) => (
          <KV
            key={organization.ogrn}
            k="Доля в организации"
            v={`${organization.shortName} · ${organization.sharePercent.toLocaleString('ru-RU')}%`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-canvas/50 px-6 py-3 text-xs text-muted">
        <Icon name="shield" size={14} className="text-ok" />
        Источник: ЕГРЮЛ и ЕГРИП
      </div>
    </div>
  )
}

export function Wizard({ onSubmit }: { onSubmit: () => void }) {
  const [inn, setInn] = useState('7701234567')
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' })
  const [revenue, setRevenue] = useState('186 400 000')
  const [debt, setDebt] = useState('22 500 000')
  const [employees, setEmployees] = useState('84')
  const [docs, setDocs] = useState<Doc[]>([
    { name: 'Баланс_2025.pdf', size: '1,2 МБ', kind: required[0], state: 'ok' },
    { name: 'ОФР_2025.pdf', size: '860 КБ', kind: required[1], state: 'ok' },
  ])
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const runEnrich = async () => {
    const digits = inn.replace(/\D/g, '')
    if (digits.length < 10) return
    setLookup({ status: 'loading' })
    try {
      const company = await lookupCompany(digits)
      setLookup(hasRegistryRecord(company) ? { status: 'ready', company } : { status: 'empty' })
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

  const step1 = lookup.status === 'ready'
  const step2 = step1 && revenue.length > 0 && debt.length > 0
  const step3 = step2 && required.every((item) => docs.some((doc) => doc.kind === item && doc.state === 'ok'))
  const step = !step1 ? 1 : !step2 ? 2 : !step3 ? 3 : 4
  const revenueValue = Number(revenue.replace(/\D/g, '')) || 0
  const debtValue = Number(debt.replace(/\D/g, '')) || 0
  const load = revenueValue ? Math.round(((debtValue + 15_000_000) / revenueValue) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted">Оборотный кредит без залога · 15 млн ₽ на 24 мес</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.025em] text-ink">Подача заявки</h1>
        </div>
        <span className="flex items-center gap-2 text-sm text-muted">
          <Icon name="clock" size={16} />
          Черновик сохранён автоматически
        </span>
      </div>

      <Stepper step={step} />

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
                    Данные из ЕГРЮЛ и ЕГРИП загружены
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
              <RegistryCard company={lookup.company} />
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
              <div className="mt-4 text-[17px] font-semibold text-ink">Оборотный кредит без залога</div>
              <dl className="mt-5 space-y-3 text-sm">
                {(
                  [
                    ['Сумма', '15 000 000 ₽'],
                    ['Срок', '24 месяца'],
                    ['Ставка', 'от 19,9%'],
                    ['Платёж', '≈ 763 400 ₽/мес'],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-muted">{label}</dt>
                    <dd className="tnum font-medium text-ink">{value}</dd>
                  </div>
                ))}
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
              <Button type="button" size="lg" className="mt-6 w-full" disabled={!step3} onClick={onSubmit}>
                Отправить в банк
              </Button>
              {!step3 && <p className="mt-3 text-center text-xs text-muted">Загрузите все обязательные документы</p>}
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
