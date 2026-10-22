import { useState } from 'react'
import { Badge, Button } from './components/ui'

export default function App() {
  const [pressed, setPressed] = useState(false)

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-10">
      <section className="rounded-2xl border border-line bg-white p-6">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]">Кнопка</h1>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setPressed(true)}>
            Продолжить
          </Button>
          <Button type="button" variant="secondary">
            Назад
          </Button>
          <Button type="button" variant="ghost">
            Отмена
          </Button>
          <Button type="button" variant="dark">
            Войти как банк
          </Button>
          <Button type="button" disabled>
            Отправить
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" size="sm">
            Подробнее
          </Button>
          <Button type="button" size="md">
            Сохранить
          </Button>
          <Button type="button" size="lg">
            Подать заявку
          </Button>
        </div>
        {pressed && <p className="mt-4 text-sm text-muted">Нажата «Продолжить»</p>}
      </section>

      <section className="rounded-2xl border border-line bg-white p-6">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]">Бейдж</h1>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Badge tone="ok" dot>
            Одобрено
          </Badge>
          <Badge tone="warn" dot>
            На проверке
          </Badge>
          <Badge tone="info" dot>
            Черновик
          </Badge>
          <Badge tone="danger" dot>
            Отказ
          </Badge>
          <Badge>Архив</Badge>
        </div>
      </section>
    </main>
  )
}
