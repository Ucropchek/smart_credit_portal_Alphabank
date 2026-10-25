// Same preliminary product rates as the calculator. The score does not produce them.
export function preliminaryRate(purpose: string, amount: number, termMonths: number) {
  const text = purpose.toLowerCase()
  if (text.includes('контракт')) return 18.2
  if (text.includes('оборуд')) return termMonths >= 24 ? 16.9 : 18.7
  if (text.includes('оборот')) return amount <= 15_000_000 ? 19.9 : 17.4
  return null
}
