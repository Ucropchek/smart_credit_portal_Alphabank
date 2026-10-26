# Модель данных

Один сервер PostgreSQL 16. Базу `ml` создаёт образ Postgres. Базу `registries` и схемы реестров создаёт `src/postgres/initdb` при пустом томе. Схему `portal` создаёт API при первом обращении к заявкам.

```mermaid
erDiagram
  applications ||--o{ information_requests : "уточнения"
  applications ||--o{ statement_months : "выписка"
  applications {
    bigint id PK
    text purpose
    numeric amount
    int term_months
    varchar inn
    varchar registration_id
    text step
    timestamptz submitted_at
    boolean bki_checked
    jsonb msp_snapshot
    jsonb fedresurs_snapshot
    jsonb arbitration_snapshot
    jsonb fns_snapshot
    jsonb bki_snapshot
    jsonb score_json
    int score_total
    text score_decision
    text product_code
    numeric max_amount
    numeric counter_amount
    text employee_decision
    text employee_reason
    boolean statement_consent
    numeric annual_revenue
    numeric obligations
    int employees
    jsonb documents
  }
  information_requests {
    bigint id PK
    bigint application_id FK
    text question
    text answer
    timestamptz asked_at
    timestamptz answered_at
  }
  statement_months {
    bigint application_id PK
    date month PK
    numeric incoming
    numeric outgoing
  }
```

`documents` — массив объектов `{ "name", "kind" }`. Содержимого файлов нет.

Снимок реестра пишется в заявку на `registry-check` и дальше не меняется, пока снимок не обновят тем же методом. Карточка компании при открытии заявки читается из снимка, а не заново из реестра.

## Реестры в базе `registries`

Это моки. Имена схем совпадают с папками `src/registries/`.

| Схема | Зачем в процессе |
| --- | --- |
| `egrul` | Юридическое лицо: наименование, ИНН, ОГРН, статус |
| `egrip` | Индивидуальный предприниматель |
| `fns` | Выручка, расходы, численность, налоговая задолженность |
| `msp` | Категория субъекта и признак вновь созданного |
| `fedresurs` | Действующее банкротство и действующий залог |
| `arbitration` | Открытые иски к ответчику и их сумма |
| `bki` | Договоры, код срока платежей, просрочка, блокировка счёта |
| `goods` | Словарь категорий, по которым цель кредита сопоставляется с товарами |

## База `ml`

Таблица `ml.goods_searches`: одна строка на заявку. Статусы `queued`, `running`, `done`, `failed`, `no_categories`. Результаты — JSON со ссылками и ценами. Эта таблица не относится к схеме `goods`.
