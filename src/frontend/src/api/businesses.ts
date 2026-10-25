export type BusinessIdentity = {
  kind: 'legal_entity' | 'entrepreneur'
  inn: string | null
  name: string | null
  registrationDate: string | null
  status: string | null
  liquidated: boolean
  ogrn?: string
  ogrnip?: string
}

export type MspProfile = {
  inRegistry: true
  categoryCode: string | null
  newBusiness: boolean
  headcount: number | null
}

export type FnsProfile = {
  arrearsTotal: number | null
  revenue?: number | null
  revenueDate?: string | null
  expenses?: number | null
  employeeCount?: number | null
  employeeCountDate?: string | null
  disqualified: boolean
  massLeader: boolean
  massFounder: boolean
  massAddress: boolean
  hasBailiffDebt: boolean
  accountBlocked: boolean | null
}

export type BkiObligation = {
  inn: string
  whose: string | string[]
  debtOverdueSum: number
  missDuration: number
  debtSum: number
  obligationSum: number
  scheduleCode: string | null
}

export type BusinessCard = {
  business: BusinessIdentity
  msp: MspProfile | null
  fns: FnsProfile
  fedresurs: {
    bankruptcyActive: boolean
    procedureType: string | null
    pledgeActive: boolean
  }
  arbitration: {
    openDefendantCases: number
    openClaimSum: number
  }
  bki: BkiObligation[]
  statement: null
  stops: {
    liquidated: boolean
    overdue: boolean
    accountBlocked: boolean | null
  }
}

export function registrationId(company: { legalEntities: { ogrn: string }[]; entrepreneurs: { ogrnip: string }[] }) {
  return company.legalEntities[0]?.ogrn ?? company.entrepreneurs[0]?.ogrnip ?? null
}

export function mspProfile(card: BusinessCard) {
  return card.msp
}

export async function lookupBusiness(id: string): Promise<BusinessCard> {
  const response = await fetch(`/businesses/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('business request failed')
  const body: unknown = await response.json()
  if (!isBusinessCard(body)) throw new Error('business response is invalid')
  if (!body.msp || !('inRegistry' in body.msp) || body.msp.inRegistry !== true) return { ...body, msp: null }
  return body
}

function isBusinessCard(value: unknown): value is BusinessCard {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const business = record.business
  if (!business || typeof business !== 'object') return false
  const kind = (business as { kind?: unknown }).kind
  return (
    (kind === 'legal_entity' || kind === 'entrepreneur') &&
    !!record.fns &&
    typeof record.fns === 'object' &&
    !!record.fedresurs &&
    typeof record.fedresurs === 'object' &&
    !!record.arbitration &&
    typeof record.arbitration === 'object' &&
    Array.isArray(record.bki) &&
    !!record.stops &&
    typeof record.stops === 'object'
  )
}
