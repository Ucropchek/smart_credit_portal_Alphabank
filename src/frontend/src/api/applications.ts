export type LoanDraft = {
  purpose: string
  amount: number
  termMonths: number
}

export type CreatedApplication = LoanDraft & {
  number: number
  inn: string
  registrationId: string
  step: string
  stepTitle: string
  submittedAt: string
}

export type ApplicationListItem = {
  number: number
  businessName: string | null
  amount: number
  termMonths: number
  step: string
  stepTitle: string
}

export type ScorePoint = {
  factor: string
  title: string
  points: number
  detail: string
}

export type ApplicationScore = {
  total: number
  decision: string
  reason: string
  stops?: {
    liquidated?: boolean
    overdue?: boolean
    accountBlocked?: boolean
    fired?: string[]
  }
  points?: ScorePoint[]
  model?: {
    name?: string
    alfaCoefficients?: boolean
  }
}

export type ApplicationProduct = {
  code: string
  maxAmount: number
  subsidizedAvailable: boolean
  mspCategory: string | null
  ordinaryMaxAmount: number
}

export type CounterOffer = {
  amount: number
  termMonths: number
  product: string
}

export type ApplicationDetail = {
  number: number
  purpose: string
  amount: number
  termMonths: number
  inn: string
  registrationId: string
  step: string
  stepTitle: string
  submittedAt: string
  business: {
    kind: string | null
    registrationId: string
    inn: string
    name: string | null
  }
  bkiConsent?: {
    checked: boolean | null
    changedAt: string | null
  }
  score?: ApplicationScore
  product?: ApplicationProduct
  counterOffer?: CounterOffer
  employeeDecision?: {
    outcome: string
    reason: string | null
    decidedAt: string | null
  }
  requests?: InformationRequest[]
}

export type InformationRequest = {
  id: number
  text: string
  answer: string | null
  askedAt: string
  answeredAt: string | null
  open: boolean
}

export async function createApplication(
  draft: LoanDraft & { inn: string; registrationId: string },
): Promise<CreatedApplication> {
  const response = await fetch('/applications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(draft),
    signal: AbortSignal.timeout(8000),
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !isCreated(body)) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Не удалось отправить заявку'
    throw new Error(message)
  }
  return body
}

export async function listApplications(): Promise<ApplicationListItem[]> {
  const response = await fetch('/applications', { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('applications request failed')
  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new Error('applications response is invalid')
  return body.filter(isListItem)
}

export async function getApplication(number: number, view: 'client' | 'bank' = 'client'): Promise<ApplicationDetail> {
  const query = view === 'client' ? '?view=client' : ''
  const response = await fetch(`/applications/${number}${query}`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('application request failed')
  const body: unknown = await response.json()
  if (!isDetail(body)) throw new Error('application response is invalid')
  return body
}

export async function scoreApplication(number: number): Promise<ApplicationDetail> {
  const response = await fetch(`/applications/${number}/score`, {
    method: 'POST',
    signal: AbortSignal.timeout(12000),
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !isDetail(body)) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Не удалось посчитать скоринг'
    throw new Error(message)
  }
  return body
}

export async function decideApplication(
  number: number,
  decision: 'approve' | 'review' | 'reject',
  reason: string,
): Promise<ApplicationDetail> {
  const response = await fetch(`/applications/${number}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision, reason: reason.trim() }),
    signal: AbortSignal.timeout(8000),
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !isDetail(body)) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Не удалось записать решение'
    throw new Error(message)
  }
  return body
}

export async function askApplication(number: number, text: string): Promise<void> {
  const response = await fetch(`/applications/${number}/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: text.trim() }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(await errorText(response, 'Не удалось отправить вопрос'))
}

export async function answerApplication(number: number, requestId: number, text: string): Promise<void> {
  const response = await fetch(`/applications/${number}/requests/${requestId}/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: text.trim() }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(await errorText(response, 'Не удалось отправить ответ'))
}

async function errorText(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error
  return fallback
}

function isCreated(value: unknown): value is CreatedApplication {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.number === 'number' && typeof record.purpose === 'string' && typeof record.stepTitle === 'string'
}

function isListItem(value: unknown): value is ApplicationListItem {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.number === 'number' && typeof record.stepTitle === 'string'
}

function isDetail(value: unknown): value is ApplicationDetail {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.number === 'number' && typeof record.purpose === 'string' && typeof record.registrationId === 'string'
}
