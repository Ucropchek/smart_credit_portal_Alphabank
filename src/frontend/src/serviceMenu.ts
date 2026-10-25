import type { IconName } from './components/Icon'
import type { Role, ServiceId } from './components/Shell'

export const serviceMenu: Record<Role, { id: ServiceId; label: string; icon: IconName }[]> = {
  client: [
    { id: 'payments', label: 'Счета и платежи', icon: 'wallet' },
    { id: 'documents', label: 'Документы', icon: 'docs' },
    { id: 'chat', label: 'Чат с банком', icon: 'chat' },
  ],
  bank: [
    { id: 'portfolio', label: 'Портфель клиентов', icon: 'building' },
    { id: 'risks', label: 'Отчёты по рискам', icon: 'trendUp' },
    { id: 'policy', label: 'Политики скоринга', icon: 'shield' },
  ],
}
