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

export async function getApplication(number: number): Promise<ApplicationDetail> {
  const response = await fetch(`/applications/${number}?view=client`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('application request failed')
  const body: unknown = await response.json()
  if (!isDetail(body)) throw new Error('application response is invalid')
  return body
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
