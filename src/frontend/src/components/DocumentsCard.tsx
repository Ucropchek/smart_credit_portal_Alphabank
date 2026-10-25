import { Badge, Card, CardHeader } from './ui'

export function DocumentsCard({
  documents,
  subtitle,
}: {
  documents: { name: string; kind: string }[]
  subtitle: string
}) {
  return (
    <Card className="p-8">
      <CardHeader
        title="Документы из заявки"
        subtitle={subtitle}
        action={<Badge tone="neutral">{documents.length}</Badge>}
      />
      <ul className="mt-6 divide-y divide-line rounded-xl border border-line">
        {documents.map((document, index) => (
          <li key={`${document.kind}-${document.name}-${index}`} className="px-5 py-3.5">
            <div className="text-sm font-medium text-ink">{document.kind}</div>
            <div className="mt-0.5 text-xs text-muted">{document.name}</div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
