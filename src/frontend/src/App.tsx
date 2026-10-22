import { useState } from 'react'
import { Badge, Button, Card, CardHeader, Field, Slider, inputCls } from './components/ui'

const rub = (n: number) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽'

export default function App() {
  const [pressed, setPressed] = useState(false)
  const [inn, setInn] = useState('7701234567')
  const [amount, setAmount] = useState(12_000_000)

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-10">
      <Card className="p-6">
        <CardHeader title="Кнопка" />
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
      </Card>

      <Card className="p-6">
        <CardHeader title="Бейдж" />
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
      </Card>

      <Card className="p-6">
        <CardHeader
          title="Параметры"
          subtitle="Поле и слайдер калькулятора"
          action={
            <Badge tone="info" dot>
              Черновик
            </Badge>
          }
        />
        <div className="mt-6 max-w-sm">
          <Field label="ИНН организации" hint="10 или 12 цифр">
            <input
              className={inputCls}
              inputMode="numeric"
              value={inn}
              onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
            />
          </Field>
        </div>
        <div className="mt-6">
          <Slider
            label="Сумма кредита"
            value={amount}
            min={1_000_000}
            max={50_000_000}
            step={500_000}
            onChange={setAmount}
            format={rub}
            minLabel="1 млн ₽"
            maxLabel="50 млн ₽"
          />
        </div>
      </Card>
    </main>
  )
}
