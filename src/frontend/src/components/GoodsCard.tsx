import { useEffect, useState } from 'react'
import { getGoods, type GoodsOffer, type GoodsSearch } from '../api/applications'
import { rub } from '../format'
import { Badge, Card, CardHeader } from './ui'

function statusText(search: GoodsSearch) {
  if (search.status === 'queued' || search.status === 'running') return 'Ищем предложения магазинов под сумму кредита.'
  if (search.status === 'absent') return 'Поиск начнётся при проверке реестров или скоринге.'
  if (search.status === 'unavailable') return 'Сервис поиска сейчас не отвечает.'
  if (search.status === 'no_categories') return 'По цели не нашлось категорий товаров.'
  if (search.status === 'failed') return 'Поиск не удался.'
  return 'Под эту сумму предложений не нашлось.'
}

function shopHost(url: string) {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

function OfferList({ offers }: { offers: GoodsOffer[] }) {
  return (
    <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
      {offers.map((offer) => (
        <li key={offer.url} className="flex items-start justify-between gap-6 px-4 py-3">
          <div className="min-w-0">
            <a href={offer.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-alfa hover:underline">
              {offer.name}
            </a>
            <div className="mt-0.5 truncate text-xs text-muted">{shopHost(offer.url)}</div>
          </div>
          <span className="tnum shrink-0 text-sm font-semibold text-ink">{rub(offer.priceRub)}</span>
        </li>
      ))}
    </ul>
  )
}

export function GoodsCard({ number, subtitle }: { number: number; subtitle: string }) {
  const [search, setSearch] = useState<GoodsSearch | null>(null)

  useEffect(() => {
    let cancel = false
    let timer = 0
    const load = () => {
      getGoods(number)
        .then((next) => {
          if (cancel) return
          setSearch(next)
          if (next.status === 'queued' || next.status === 'running') timer = window.setTimeout(load, 3000)
        })
        .catch(() => {
          if (!cancel) setSearch({ status: 'unavailable', categories: [] })
        })
    }
    load()
    return () => {
      cancel = true
      window.clearTimeout(timer)
    }
  }, [number])

  const offers = search?.categories.reduce((sum, category) => sum + category.offers.length, 0) ?? 0
  const overBudget = search?.categories.reduce((sum, category) => sum + category.overBudget.length, 0) ?? 0
  const listed = offers + overBudget > 0

  return (
    <Card className="p-8">
      <CardHeader
        title="Товары под сумму кредита"
        subtitle={search == null ? 'Загружаем подборку…' : listed ? subtitle : statusText(search)}
        action={
          search && (search.status === 'queued' || search.status === 'running') ? (
            <Badge tone="info" dot>
              Ищем
            </Badge>
          ) : offers > 0 ? (
            <Badge tone="neutral">{offers}</Badge>
          ) : undefined
        }
      />
      {listed && (
        <div className="mt-6 space-y-6">
          {search?.categories.map((category, index) =>
            category.offers.length === 0 ? null : (
              <section key={`${category.code}-${index}`}>
                {category.title && <h3 className="text-sm font-semibold text-ink">{category.title}</h3>}
                <OfferList offers={category.offers} />
              </section>
            ),
          )}
          {overBudget > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-ink">Дороже суммы кредита</h3>
              {search?.categories.map((category, index) =>
                category.overBudget.length === 0 ? null : (
                  <div key={`over-${category.code}-${index}`} className="mt-3">
                    {category.title && <div className="text-xs text-muted">{category.title}</div>}
                    <OfferList offers={category.overBudget} />
                  </div>
                ),
              )}
            </section>
          )}
        </div>
      )}
    </Card>
  )
}
