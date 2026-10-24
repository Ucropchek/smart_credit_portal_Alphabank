export type RegistryIdentity = {
  ogrn: string
  inn: string
  shortName: string
}

export type LegalEntity = RegistryIdentity & {
  kpp: string
  opfFullName: string
  ogrnDate: string
  capitalAmount: number
  statusName: string | null
  terminationName: string | null
  address: string | null
  mainOkvedCode: string | null
  mainOkvedName: string | null
  directorName: string | null
  directorPosition: string | null
}

export type FoundedOrganization = RegistryIdentity & {
  shareNominal: number
  sharePercent: number
}

export type Entrepreneur = {
  ogrnip: string
  inn: string
  lastName: string
  firstName: string
  middleName: string | null
}

export type CompanyLookup = {
  legalEntities: LegalEntity[]
  foundedOrganizations: FoundedOrganization[]
  entrepreneurs: Entrepreneur[]
}

export function hasRegistryRecord(company: CompanyLookup) {
  return (
    company.legalEntities.length > 0 ||
    company.foundedOrganizations.length > 0 ||
    company.entrepreneurs.length > 0
  )
}

export function entrepreneurName(person: Entrepreneur) {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ')
}

export async function lookupCompany(inn: string): Promise<CompanyLookup> {
  const response = await fetch(`/companies/${encodeURIComponent(inn)}`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('registry request failed')
  const body: unknown = await response.json()
  if (!isCompanyLookup(body)) throw new Error('registry response is invalid')
  return body
}

function isCompanyLookup(value: unknown): value is CompanyLookup {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    Array.isArray(record.legalEntities) &&
    Array.isArray(record.foundedOrganizations) &&
    Array.isArray(record.entrepreneurs)
  )
}
