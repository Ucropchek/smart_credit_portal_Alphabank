export const rub = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽'

export const mln = (n: number) =>
  (n / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн ₽'

export function annuity(amount: number, ratePct: number, monthsCount: number) {
  const r = ratePct / 100 / 12
  return (amount * r) / (1 - Math.pow(1 + r, -monthsCount))
}

export function months(n: number) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return `${n} месяц`
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} месяца`
  return `${n} месяцев`
}
