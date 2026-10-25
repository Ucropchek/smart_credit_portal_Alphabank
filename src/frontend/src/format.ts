export const rub = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽'

export const mln = (n: number) =>
  (n / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн ₽'

export function annuity(amount: number, ratePct: number, monthsCount: number) {
  const r = ratePct / 100 / 12
  return (amount * r) / (1 - Math.pow(1 + r, -monthsCount))
}

const monthNames = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

export function ruDate(iso: string | null | undefined) {
  if (!iso) return ''
  const [year, month, day] = iso.split('-')
  return day && month && year ? `${day}.${month}.${year}` : iso
}

export function monthLabel(yyyyMm: string) {
  const [yearText, monthText] = yyyyMm.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const name = monthNames[month - 1]
  if (!year || !name) return yyyyMm
  return `${name} ${year}`
}

export function months(n: number) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return `${n} месяц`
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} месяца`
  return `${n} месяцев`
}
