# Умный кредитный портал

Репозиторий `smart_credit_portal_Alphabank`. В кейсе Changellenge >> и АО «Альфа-Банк» от 19.10.2026 продукт называется «Умный кредитный кабинет предпринимателя».

Кейс задаёт прототип цифрового кредитного конвейера для малого и микробизнеса: один процесс от потребности в финансировании до результата по заявке, общий для клиента и банка. Клиент выбирает задачу и продукт и передаёт сумму, срок, цель и сведения о бизнесе. Банк проверяет полноту, при нехватке данных запрашивает уточнение, обогащает заявку и отдельно считает риск и кредитное решение. Итог шире «да/нет»: запрошенные условия, другие условия, уточнение или отказ. Подписание и выдачу денег кейс разрешает смоделировать без реальных операций.

Пользователь кейса — представитель малого или микробизнеса без банковской экспертизы: собственник, генеральный директор, финансовый директор, бухгалтер или другой уполномоченный сотрудник. На 10.07.2026 в Едином реестре МСП 6,6 млн субъектов, на 3,5% больше, чем годом ранее. В июле 2026 банки выдали субъектам МСП 1,313 трлн рублей. К октябрю 2025 совокупные выдачи Альфа-Банка малому бизнесу превысили 1 трлн рублей. Доступа к системам банка нет: внешние проверки — локальные моки, данные синтетические, платных API нет. Сценарий идёт внутри продукта. Клиентская часть — сайт. У используемой языковой модели открытые веса.

Путь собран в кабинете целиком: заявка хранится в PostgreSQL, реестры проверяются по локальным мокам, риск считает балльная таблица портала, сотрудник банка фиксирует решение, клиент видит статус и подборку товаров под сумму кредита. В коде входа и ролей с паролем нет: роль «предприниматель / кредитный эксперт» переключается в интерфейсе.

## Комплект для проверки

Кейс просит приложить к репозиторию схему, описание API, OpenAPI, коллекцию запросов, диаграмму состояний, модель данных, тестовые сценарии и перечень сторонних компонентов.

| Что требует кейс | Где лежит |
| --- | --- |
| Архитектурная схема | [docs/architecture.md](docs/architecture.md) |
| Допущения | [docs/assumptions.md](docs/assumptions.md) |
| Описание API и OpenAPI | [docs/openapi.yaml](docs/openapi.yaml). Swagger ML: http://localhost:8000/docs |
| Коллекция запросов | [docs/requests.http](docs/requests.http) |
| Диаграмма состояний заявки | [docs/application-states.md](docs/application-states.md) |
| Модель данных | [docs/data-model.md](docs/data-model.md) |
| Тестовые сценарии и данные | [docs/test-scenarios.md](docs/test-scenarios.md) |
| Сторонние компоненты, модель, моки | [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |

Идентификатор версии для жюри — вывод `git rev-parse HEAD` на `main` в момент дедлайна. Если репозиторий приватный, доступ нужен аккаунту `alfa-hack-2026`. Публикация на внешний сервер в кейсе желательна, для проверки достаточно `docker compose up --build` на обычном ПК.

## Быстрый старт

```powershell
docker compose up --build
```

Откройте http://localhost:3000.

Одна команда собирает и поднимает всё: кабинет, API, Postgres с моками реестров, ML-сервис, SearXNG и Ollama. Первый запуск сам скачивает базовые образы, пакеты npm, NuGet и pip и модель `qwen3.5:4b` (около 3,3 ГБ). На проверочной машине первый запуск занял около 11 минут, повторный поднимается за секунды. Сервис `ml` стартует последним, после загрузки модели: кабинет и заявки работают раньше, подборка товаров появится, когда поднимется `ml`.

Остановить: `Ctrl+C` или `docker compose down`. Сбросить базы и начать с чистыми данными: `docker compose down -v` (модель тоже удалится и скачается заново).

## Архитектура и стек

```
браузер ──► frontend (nginx, :3000) ──/applications, /companies, /businesses, /bki-consent──► backend (:8080)
                                                                                                  │
                    ┌─────────────────────────────────────────────────────────────────────────────┤
                    ▼                                                                             ▼
       postgres: база registries (моки реестров, заявки)                         ml (:8000): поиск товаров
                 база ml (задания поиска товаров)                ◄────────────────┤
                                                                   ollama (Qwen 3.5)   searxng (метапоиск)
```

Кабинет — React 19, TypeScript, Vite, Tailwind. В Compose его собирает `src/frontend/Dockerfile`, а nginx (`src/frontend/nginx.conf`) отдаёт сборку и пересылает `/companies`, `/businesses`, `/applications` и WebSocket `/bki-consent` на API. При разработке то же делает прокси Vite на `http://localhost:8080`. Запросы кабинета в обоих случаях идут на тот же origin.

API — ASP.NET Core, `net10.0`, проект `src/backend/SmartCredit.Api.csproj`. Он читает и пишет PostgreSQL 16 в базе `registries`. Схему `portal` API создаёт сам при первом обращении к заявкам. Реестры в эту базу кладёт скрипт инициализации Postgres, не API.

Один сервер Postgres держит две базы. `ml` создаёт образ из `POSTGRES_DB`. `registries` создаёт `src/registries/init-registries.sh`. В `registries` папка — схема с тем же именем. Сейчас это `arbitration`, `bki`, `egrip`, `egrul`, `fedresurs`, `fns`, `goods`, `msp`. Порядок — имена при `LC_ALL=C`. Источники из кейса — ЕГРЮЛ, ЕГРИП, сервис ФНС «Прозрачный бизнес», реестр МСП, бюро кредитных историй, Федресурс и картотека арбитражных дел — локально сымитированы SQL-таблицами. Схема `goods` — справочник категорий товаров для распознавания цели кредита.

Скоринг карточки — таблица баллов этого портала, не коэффициенты Альфа-Банка: в ответе `model.alfaCoefficients` равен `false`. Стоп-фактор даёт `reject`. Без стопа балл от 70 даёт `approve`, ниже — `review`. Правила баллов лежат в `src/backend/BusinessScore.cs`, потолки продуктов — в `src/backend/ProductOffer.cs`. Решение сотрудника банка пишется отдельно: `approve`, `review` или `reject`. Если запрошенная сумма выше потолка продукта, API сохраняет встречную сумму. Коды продукта в API — `ordinary` и `msp-subsidized`. На витрине кабинета подписи другие: оборотный кредит, кредит на оборудование, кредит на исполнение контракта.

ML-сервис `smart_credit_ml` слушает порт 8000. API при подаче заявки и на шагах проверки реестров и скоринга шлёт ему цель заявки, сумму и распознанные категории товаров (`PurposeHandoff`) и ждёт ответ 3 секунды. Сервис отвечает `202` и ищет товары в фоне. Ссылки берёт SearXNG, текст страниц читает Qwen 3.5 в Ollama. Задания поиска лежат в `ml.goods_searches`. Это не схема `goods` в базе `registries`. Подробности — в `src/ml/README.md`.

Шаги заявки в ограничении базы: `submitted`, `registryCheck`, `scoring`, `decision`. Экраны кабинета: личный кабинет, подача заявки, статус и решение, конвейер банка. Пункты меню «Счета и платежи», «Документы», «Чат с банком», «Портфель клиентов», «Отчёты по рискам», «Политики скоринга» открывают оболочку `Services`.

```
smart_credit_portal_Alphabank/
  README.md                 этот файл
  .env.example              порты, модель и учётные данные Postgres для Compose
  .gitattributes            LF для shell-скриптов и SQL инициализации базы
  .gitignore
  docker-compose.yml        весь прототип: frontend, backend, Postgres, ML, SearXNG, Ollama
  docker-compose.dev.yml    для разработки: публикует порты Postgres, SearXNG и Ollama
  src/frontend/             React, TypeScript, Vite, Tailwind; Dockerfile и nginx.conf
  src/backend/              ASP.NET Core, Dockerfile, appsettings
  src/ml/                   пакет smart_credit_ml, lock-файлы, SQL базы ml
  src/postgres/initdb/      init.sh: SQL базы ml, затем реестры
  src/registries/           SQL моков реестров и init-registries.sh
  src/docs/README.md        указатель папок репозитория
```

## Что должно быть установлено

Для запуска: Docker Desktop (Windows, macOS) или Docker Engine с плагинами Compose v2 и Buildx (Linux, WSL). Интернет при первом запуске и для поиска товаров. Около 15 ГБ места и 8 ГБ памяти. Видеокарта не нужна: модель в Docker работает на процессоре.

Образы, которые поднимает Compose:

| Образ | Где задан |
| --- | --- |
| `node:22-alpine` и `nginx:1.29-alpine` | `src/frontend/Dockerfile` |
| `mcr.microsoft.com/dotnet/sdk:10.0` и `aspnet:10.0` | `src/backend/Dockerfile` |
| `postgres:16-alpine` | `docker-compose.yml` |
| `python:3.12-slim` | `src/ml/Dockerfile` |
| `searxng/searxng:2026.10.17-2a6fc07be` | `docker-compose.yml` |
| `ollama/ollama:0.40.9` | `docker-compose.yml` |

Для разработки без контейнеров, по частям:

- страница: Node.js и npm. В `package.json` версия Node не задана. Сборки oxlint в `package-lock.json` требуют Node `^20.19.0` или `>=22.12.0`;
- `dotnet run`: SDK .NET 10 (`TargetFramework` `net10.0`);
- ML без его контейнера: Python. Образ сервиса — 3.12. `pyproject.toml` допускает `>=3.11`. Lock-файлы собраны под 3.12.

Отдельных Make, линтера .NET и тестов API в репозитории нет.

## Адреса

| Что | Адрес |
| --- | --- |
| Кабинет | http://localhost:3000 |
| API | http://localhost:8080/ и http://localhost:8080/health |
| ML, Swagger и проверка | http://localhost:8000/docs и http://localhost:8000/health |

Postgres, SearXNG и Ollama в основном сценарии наружу не публикуются, чтобы не конфликтовать с сервисами, уже запущенными на машине. Для разработки их открывает `docker-compose.dev.yml`: Postgres на `localhost:5432`, SearXNG на http://localhost:8888, Ollama на http://localhost:11434.

## Переменные окружения

Compose сам читает `.env` в корне репозитория. Пример — корневой `.env.example`. Файл необязателен: если его нет, в `docker-compose.yml` остаются те же значения.

```powershell
Copy-Item .env.example .env
```

`src/ml/.env.example` — справочник пакета. Compose этот путь не читает. `main.py` и сервис читают только окружение процесса, файла `.env` рядом с пакетом не подхватывают. Для локального Python переменные нужно выставить в сессии.

Пароль `change-me` — локальная заглушка.

| Переменная | Описание | По умолчанию или пример | Обязательность |
| --- | --- | --- | --- |
| `FRONTEND_PORT` | Порт кабинета на машине | `3000` | нет |
| `BACKEND_PORT` | Порт API на машине | `8080` | нет |
| `ML_PORT` | Порт ML-сервиса на машине | `8000` | нет |
| `POSTGRES_PORT`, `SEARXNG_PORT`, `OLLAMA_PORT` | Порты из `docker-compose.dev.yml` | `5432`, `8888`, `11434` | нет |
| `ML_POSTGRES_USER` | Пользователь Postgres. Compose передаёт его в `POSTGRES_USER` | `ml` | нет |
| `ML_POSTGRES_PASSWORD` | Пароль Postgres | `change-me` | нет |
| `ML_POSTGRES_DB` | База, которую создаёт образ Postgres. Это база `ml`, не `registries` | `ml` | нет |
| `ML_POSTGRES_HOST` | Хост базы для Python. В Compose у сервиса `ml` стоит `postgres` | `localhost` | нет |
| `ML_POSTGRES_PORT` | Порт Postgres | `5432` | нет |
| `ML_SQL_DIR` | Каталог `*.sql` для команды `smart-credit-ml`. Относительный путь считается от `src/ml` | каталог `sql` рядом с пакетом | нет |
| `ML_SEARXNG_URL` | SearXNG. В Compose: `http://searxng:8080` | `http://localhost:8888` | нет |
| `ML_OLLAMA_URL` | Ollama. В Compose: `http://ollama:11434` | `http://localhost:11434` | нет |
| `ML_LLM_MODEL` | Имя модели Ollama. Её скачивает сервис `ollama-pull`. `qwen3.5:9b` точнее, но требует около 7 ГБ | `qwen3.5:4b` | нет |
| `ML_LLM_TIMEOUT` | Таймаут вызова модели, секунды | `180` | нет |
| `ML_SEARCH_MAX_QUERIES` | Сколько поисковых запросов оставить | `3` | нет |
| `ML_SEARCH_RESULTS_PER_QUERY` | Результатов SearXNG на запрос | `8` | нет |
| `ML_SEARCH_MAX_CANDIDATES` | Потолок кандидатов | `16` | нет |
| `ML_FETCH_TIMEOUT` | Таймаут загрузки страницы, секунды | `8` | нет |
| `ML_FETCH_CONCURRENCY` | Параллельные загрузки страниц | `5` | нет |
| `ML_GOODS_STORE` | Где хранить задания поиска. Любое значение, кроме `memory`, включает Postgres | `postgres` | нет |
| `ML_HANDOFF_MAX_CATEGORIES` | Сколько категорий цели искать по одной заявке | `3` | нет |
| `ASPNETCORE_ENVIRONMENT` | В Compose и в профиле `http` — `Development`. Тогда читается `appsettings.Development.json` | `Development` | да для `dotnet run`: из этого файла берётся строка Postgres |
| `ASPNETCORE_URLS` | Адрес Kestrel в контейнере | `http://+:8080` | задана в Dockerfile и Compose |
| `Ml__BaseUrl` | Куда API шлёт передачу заявки. В `appsettings.json` ключ `Ml:BaseUrl` | Compose: `http://ml:8000`. Файл: `http://localhost:8000` | нет |
| `Postgres__ConnectionString` | Перекрывает `Postgres:ConnectionString` | Compose: `Host=postgres;Port=5432;…;Database=registries`. Файл Development: `Host=localhost;…` | задана в Compose; для `dotnet run` берётся из файла Development |
| `OLLAMA_HOST` | Только у сервиса `ollama-pull` | `http://ollama:11434` | задана в Compose |

Без `Postgres:ConnectionString` процесс API останавливается с текстом `Нет строки подключения Postgres:ConnectionString`.

## Проверка по шагам

Демо-компания — ООО «Демо-альфа», ИНН `7701990013`, ОГРН `1247700099008`. Она заложена во всех моках реестров с чистой историей. Для проверки стоп-факторов подходят ООО «Городская палата» (ИНН `5001033600`, ликвидирована) и ООО «Первая контора» (ИНН `7701862572`: банкротство, открытый иск, просрочка в БКИ).

1. Откройте http://localhost:3000. В шапке выбран режим «Предприниматель».
2. «Новая заявка». Компания «Демо-альфа» уже подставлена, карточка собрана из ЕГРЮЛ, ФНС, МСП, БКИ, Федресурса и арбитража. Другой ИНН из моков можно ввести и нажать «Найти».
3. Напишите цель кредита, например «Покупка настольного компьютера для бухгалтерии»: под полем появятся распознанные категории товаров. Выберите сумму и срок, проверьте финансы (выручка и численность подставлены из ФНС).
4. В блоке «Документы» нажмите «Подставить примеры названий», отметьте согласие на запрос в БКИ и нажмите «Отправить в банк».
5. В «Мои заявки» откройте заявку: видны этапы конвейера, финансы и блок «Товары под сумму кредита». Подборка появляется через несколько минут: поиск идёт в фоне, модель в Docker работает на процессоре.
6. Переключите режим на «Кредитный эксперт (Банк)»: заявка в конвейере, проверка реестров, скоринг с расшифровкой баллов, вопрос клиенту, решение.
7. После решения клиент видит итог в своей заявке.

Те же шаги через API, запросы идут через nginx кабинета. Команды для bash (Git Bash, WSL, macOS, Linux): в Windows PowerShell `curl` — другая команда, а кавычки внутри JSON могут потеряться.

```bash
curl http://localhost:3000/companies/7701990013
curl -X POST http://localhost:3000/applications -H "Content-Type: application/json" -d '{"purpose":"Покупка настольного компьютера","amount":80000,"termMonths":12,"inn":"7701990013","registrationId":"1247700099008"}'
```

Затем `POST /applications/{номер}/registry-check`, `POST /applications/{номер}/score`, `POST /applications/{номер}/decision` с телом `{"decision":"approve"}` и `GET /applications/{номер}/goods`.

## Запуск для разработки

Команды из корня `smart_credit_portal_Alphabank`, если не указана другая папка. SQL реестров и базы `ml` выполняет контейнер Postgres при первом создании тома `postgres-data`. Повторный запуск готового тома эти файлы заново не применяет. Отдельной команды миграций нет. Схему `portal` создаёт API при работе с заявками.

Учётных записей приложения нет.

Postgres в контейнере с опубликованным портом, API и страница на машине:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
```

Второй терминал:

```powershell
cd src/backend
dotnet run --launch-profile http
```

Профиль `http` в `Properties/launchSettings.json` слушает http://localhost:8080 и выставляет `ASPNETCORE_ENVIRONMENT=Development`. Браузер сам не открывается. Профиль IIS Express в репозитории есть и для этого запуска не используется.

Третий терминал — страница:

```powershell
cd src/frontend
npm install
npm run dev
```

Сервер Vite открывается на http://127.0.0.1:5173/: порт в `vite.config.ts` не задан, 5173 — порт Vite по умолчанию.

ML вместе с Ollama и SearXNG, из корня:

```powershell
docker compose up --build ml
```

Локальный процесс ML, когда Ollama и SearXNG запущены с `docker-compose.dev.yml`. Зависимости ставятся двумя командами: пакеты с хешами и редактируемая установка в одном вызове pip не смешиваются.

```powershell
cd src/ml
python -m venv .venv
.venv\Scripts\python -m pip install --require-hashes -r requirements-test.lock
.venv\Scripts\python -m pip install --no-deps -e .
.venv\Scripts\uvicorn smart_credit_ml.api:app --port 8000
```

В этом сценарии API ходит в ML по `http://localhost:8000` из `appsettings.json`.

Сборка страницы и просмотр сборки без Docker:

```powershell
cd src/frontend
npm run build
npm run preview
```

## Команды, которые в проекте есть

Линтер страницы, из `src/frontend`:

```powershell
npm run lint
```

Это `oxlint`.

Тесты ML, из `src/ml`, после установки `requirements-test.lock`. Их 35. Они подменяют поисковик, загрузку страниц и модель, поэтому интернет и Ollama не нужны.

```powershell
.venv\Scripts\python -m pytest
```

Пересборка lock-файлов Python после правки `pyproject.toml`. Для обычного запуска `uv` не нужен.

```powershell
uv pip compile pyproject.toml --universal --python-version 3.12 --generate-hashes --no-header -o requirements.lock
uv pip compile pyproject.toml --extra test --universal --python-version 3.12 --generate-hashes --no-header -o requirements-test.lock
```

Команда `smart-credit-ml` печатает настройки Postgres и список `*.sql`. Соединение она не открывает. `smart-credit-products` запускает один поиск товаров из командной строки. Тестов .NET и отдельной команды генерации клиента API нет.

## Частые проблемы запуска

**Docker не запущен.** `docker compose` не подключается к движку. Запустите Docker Desktop и повторите команду.

**Нет команды `docker compose` или `buildx`.** В Docker Engine из пакетов Linux (например, Ubuntu в WSL) плагины ставятся отдельно: `sudo apt install docker-compose-v2 docker-buildx`. В Docker Desktop они встроены.

**Порт занят.** Основной сценарий публикует 3000, 8080 и 8000; `docker-compose.dev.yml` добавляет 5432, 8888 и 11434. Если порт уже занят, задайте другой в `.env` (`FRONTEND_PORT`, `BACKEND_PORT`, `ML_PORT`, `POSTGRES_PORT` и т. д.) или остановите прежний контейнер того же проекта: `docker compose down`.

**Данные реестров не обновились после правки SQL.** Скрипты инициализации выполняются только на пустом томе `postgres-data`: `docker compose down -v`, затем снова `docker compose up --build`.

**Подборка товаров долго «загружается».** Посмотрите `docker compose logs -f ml`. Пока идёт первый запуск, `ml` ждёт загрузки модели. Потом поиск по одной категории занимает 2–5 минут на процессоре, и задания разных заявок выполняются по очереди.

**Подборка пустая.** Поиск товаров идёт через живой интернет, поисковики за SearXNG иногда ограничивают частые запросы. Для дорогих товаров в сумму кредита может не попасть ни одно предложение: они показываются в списке «Дороже суммы кредита».
