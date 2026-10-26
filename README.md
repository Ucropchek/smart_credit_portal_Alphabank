# Умный кредитный портал

Репозиторий `smart_credit_portal_Alphabank`. В кейсе Changellenge >> и АО «Альфа-Банк» от 19.10.2026 продукт называется «Умный кредитный кабинет предпринимателя».

Кейс задаёт прототип цифрового кредитного конвейера для малого и микробизнеса: один процесс от потребности в финансировании до результата по заявке, общий для клиента и банка. Клиент выбирает задачу и продукт и передаёт сумму, срок, цель и сведения о бизнесе. Банк проверяет полноту, при нехватке данных запрашивает уточнение, обогащает заявку и отдельно считает риск и кредитное решение. Итог шире «да/нет»: запрошенные условия, другие условия, уточнение или отказ. Подписание и выдачу денег кейс разрешает смоделировать без реальных операций.

Пользователь кейса — представитель малого или микробизнеса без банковской экспертизы: собственник, генеральный директор, финансовый директор, бухгалтер или другой уполномоченный сотрудник. На 10.07.2026 в Едином реестре МСП 6,6 млн субъектов, на 3,5% больше, чем годом ранее. В июле 2026 банки выдали субъектам МСП 1,313 трлн рублей. К октябрю 2025 совокупные выдачи Альфа-Банка малому бизнесу превысили 1 трлн рублей. Доступа к системам банка нет: внешние проверки — локальные моки, данные синтетические, платных API нет. Сценарий идёт внутри продукта. Клиентская часть — сайт. У используемой языковой модели открытые веса.

В копии `main` `328e91c` этот путь уже собран в кабинете: заявка хранится в PostgreSQL, риск считает балльная таблица портала, сотрудник банка фиксирует решение. В коде входа и ролей с паролем нет: роль «предприниматель / кредитный эксперт» переключается в интерфейсе.

## Архитектура и стек

Браузер открывает Vite. Запросы кабинета идут на тот же origin. Прокси разработки пересылает `/companies`, `/businesses`, `/applications` и WebSocket `/bki-consent` на API `http://localhost:8080`.

API — ASP.NET Core, `net10.0`, проект `src/backend/SmartCredit.Api.csproj`. Он читает и пишет PostgreSQL 16. Строка подключения в режиме Development указывает базу `registries`. Схему `portal` API создаёт сам при первом обращении к заявкам. Реестры в эту базу кладёт скрипт инициализации Postgres, не API.

Один сервер Postgres держит две базы. `ml` создаёт образ из `POSTGRES_DB`. `registries` создаёт `src/registries/init-registries.sh`. В `registries` папка — схема с тем же именем. Сейчас это `arbitration`, `bki`, `egrip`, `egrul`, `fedresurs`, `fns`, `goods`, `msp`. Порядок — имена при `LC_ALL=C`. В кейсе среди источников названы бюро кредитных историй: ЕГРЮЛ, ЕГРИП, сервис ФНС «Прозрачный бизнес», МСП, Федресурса, арбитража и каталога `goods`. Все реестры локально сымитированы SQL таблицами.

Скоринг карточки — таблица баллов этого портала, не коэффициенты Альфа-Банка: в ответе `model.alfaCoefficients` равен `false`. Стоп-фактор даёт `reject`. Без стопа балл от 70 даёт `approve`, ниже — `review`. Подробности и источники лежат в `docs/scoring.md`. Решение сотрудника банка пишется отдельно: `approve`, `review` или `reject`. Если запрошенная сумма выше потолка продукта, API сохраняет встречную сумму. Коды продукта в API — `ordinary` и `msp-subsidized`. На витрине кабинета подписи другие: оборотный кредит, кредит на оборудование, кредит на исполнение контракта.

ML-сервис `smart_credit_ml` слушает порт 8000. API на шагах проверки реестров и скоринга шлёт ему цель заявки (`PurposeHandoff`) и ждёт ответ 3 секунды. Сервис отвечает `202` и ищет товары в фоне. Ссылки берёт SearXNG, текст страниц читает Qwen 3.5 в Ollama. Задания поиска лежат в `ml.goods_searches`. Это не схема `goods` в базе `registries`.

Шаги заявки в ограничении базы: `submitted`, `registryCheck`, `scoring`, `decision`. Экраны кабинета: личный кабинет, подача заявки, статус и решение, конвейер банка. Пункты меню «Счета и платежи», «Документы», «Чат с банком», «Портфель клиентов», «Отчёты по рискам», «Политики скоринга» открывают оболочку `Services`.

Ранний текст `docs/code-guide.md` описывает каркас из двух сервисов Compose и экран-счётчик Vite. В `328e91c` состав сервисов и экраны — как в этом файле. Заметка `docs/frontend-endpoints.md` описывает `main` без вызовов API. В этой копии кабинет вызывает API из `src/frontend/src/api`.

```
smart_credit_portal_Alphabank/
  README.md                 корневой README пустой
  .env.example              пользователь, пароль и база Postgres для Compose
  .gitignore
  docker-compose.yml        API, Postgres, ML, SearXNG, Ollama
  src/frontend/             React, TypeScript, Vite, Tailwind; в Compose не входит
  src/backend/              ASP.NET Core, Dockerfile, appsettings
  src/ml/                   пакет smart_credit_ml, lock-файлы, SQL базы ml
  src/postgres/initdb/      init.sh: SQL базы ml, затем реестры
  src/registries/           SQL моков реестров и init-registries.sh
  src/docs/README.md        указатель папок репозитория
```

## Что должно быть установлено

Для сценария Compose: Docker с Compose. Версия Docker в репозитории не зафиксирована.

Образы, которые поднимает Compose:

| Образ | Где задан |
| --- | --- |
| `mcr.microsoft.com/dotnet/sdk:10.0` и `aspnet:10.0` | `src/backend/Dockerfile` |
| `postgres:16-alpine` | `docker-compose.yml` |
| `python:3.12-slim` | `src/ml/Dockerfile` |
| `searxng/searxng:2026.10.17-2a6fc07be` | `docker-compose.yml` |
| `ollama/ollama:0.40.9` | `docker-compose.yml` |

Для запуска страницы на этой машине: Node.js и npm. В `package.json` версия Node не задана. Сборки oxlint в `package-lock.json` требуют Node `^20.19.0` или `>=22.12.0`.

Для `dotnet run`: SDK .NET 10 (`TargetFramework` `net10.0`).

Для локального ML без его контейнера: Python. Образ сервиса — 3.12. `pyproject.toml` допускает `>=3.11`. Lock-файлы собраны под 3.12.

Отдельных Make, линтера .NET и тестов API в репозитории нет.

## Переменные окружения

Compose сам читает `.env` в корне репозитория. Пример — корневой `.env.example`. Если файла нет, в `docker-compose.yml` остаются те же значения: пользователь `ml`, пароль `change-me`, база `ml`.

```powershell
Copy-Item .env.example .env
```

`src/ml/.env.example` — справочник пакета. Compose этот путь не читает. `main.py` и сервис читают только окружение процесса, файла `.env` рядом с пакетом не подхватывают. Для локального Python переменные нужно выставить в сессии.

Пароль `change-me` — локальная заглушка.

| Переменная | Описание | По умолчанию или пример | Обязательность |
| --- | --- | --- | --- |
| `ML_POSTGRES_USER` | Пользователь Postgres. Compose передаёт его в `POSTGRES_USER` | `ml` | нет |
| `ML_POSTGRES_PASSWORD` | Пароль Postgres | `change-me` | нет |
| `ML_POSTGRES_DB` | База, которую создаёт образ Postgres. Это база `ml`, не `registries` | `ml` | нет |
| `ML_POSTGRES_HOST` | Хост базы для Python. В Compose у сервиса `ml` стоит `postgres` | `localhost` | нет |
| `ML_POSTGRES_PORT` | Порт Postgres | `5432` | нет |
| `ML_SQL_DIR` | Каталог `*.sql` для команды `smart-credit-ml`. Относительный путь считается от `src/ml` | каталог `sql` рядом с пакетом | нет |
| `ML_SEARXNG_URL` | SearXNG. В Compose: `http://searxng:8080` | `http://localhost:8888` | нет |
| `ML_OLLAMA_URL` | Ollama. В Compose: `http://ollama:11434` | `http://localhost:11434` | нет |
| `ML_LLM_MODEL` | Имя модели Ollama. Её скачивает сервис `ollama-pull` | `qwen3.5:4b` | нет |
| `ML_LLM_TIMEOUT` | Таймаут вызова модели, секунды | `180` | нет |
| `ML_SEARCH_MAX_QUERIES` | Сколько поисковых запросов оставить | `3` | нет |
| `ML_SEARCH_RESULTS_PER_QUERY` | Результатов SearXNG на запрос | `8` | нет |
| `ML_SEARCH_MAX_CANDIDATES` | Потолок кандидатов | `16` | нет |
| `ML_FETCH_TIMEOUT` | Таймаут загрузки страницы, секунды | `8` | нет |
| `ML_FETCH_CONCURRENCY` | Параллельные загрузки страниц | `5` | нет |
| `ML_GOODS_STORE` | Где хранить задания поиска. Любое значение, кроме `memory`, включает Postgres | `postgres` | нет |
| `ML_HANDOFF_MAX_CATEGORIES` | Сколько категорий цели искать по одной заявке | `3` | нет |
| `ASPNETCORE_ENVIRONMENT` | В Compose и в профиле `http` — `Development`. Тогда читается `appsettings.Development.json` | `Development` | да, чтобы подхватить строку Postgres из этого файла |
| `ASPNETCORE_URLS` | Адрес Kestrel в контейнере | `http://+:8080` | задана в Dockerfile и Compose |
| `Ml__BaseUrl` | Куда API шлёт передачу заявки. В `appsettings.json` ключ `Ml:BaseUrl` | Compose: `http://ml:8000`. Файл: `http://localhost:8000` | нет |
| `Postgres__ConnectionString` | Перекрывает `Postgres:ConnectionString` | в файле Development: `Host=localhost;Port=5432;Username=ml;Password=change-me;Database=registries` | да для запуска API. В Compose переменная не задана |
| `OLLAMA_HOST` | Только у сервиса `ollama-pull` | `http://ollama:11434` | задана в Compose |

Без `Postgres:ConnectionString` процесс API останавливается с текстом `Нет строки подключения Postgres:ConnectionString`.

## Локальный запуск с нуля

Команды из корня `smart_credit_portal_Alphabank`, если не указана другая папка. SQL реестров и базы `ml` выполняет контейнер Postgres при первом создании тома `postgres-data`. Повторный запуск готового тома эти файлы заново не применяет. Отдельной команды миграций нет. Схему `portal` создаёт API при работе с заявками.

Учётных записей приложения нет.

### Docker Compose

Compose поднимает `backend`, `postgres`, `ml`, `searxng`, `ollama` и одноразовый `ollama-pull`. Фронтенд в файл не входит. Первый старт скачивает модель `qwen3.5:4b`, около 3 ГБ, в том `ollama-data`. Пока загрузка не завершилась, сервис `ml` не стартует: он ждёт успешного `ollama-pull`.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Страница отдельно:

```powershell
cd src/frontend
npm install
npm run dev
```

После запуска:

| Что | Адрес |
| --- | --- |
| Кабинет, сервер Vite | http://127.0.0.1:5173/ |
| API | http://localhost:8080/ и http://localhost:8080/health |
| ML, Swagger и проверка | http://localhost:8000/docs и http://localhost:8000/health |
| SearXNG | http://localhost:8888 |
| Ollama | http://localhost:11434 |
| Postgres | `localhost:5432` |

`vite.config.ts` порт не задаёт. 5173 — порт сервера разработки Vite по умолчанию. Его же фиксирует `docs/code-guide.md`.

`<TODO: в docker-compose.yml нет Postgres__ConnectionString>`. В контейнере `backend` строка из `appsettings.Development.json` указывает `Host=localhost`. Этот localhost — сам контейнер API, не сервис `postgres`. Для API внутри Compose нужна строка с `Host=postgres` и базой `registries`. Локальный `dotnet run` на машине, где опубликован порт 5432, с файлом Development совпадает.

### Запуск для разработки

Postgres можно поднять одним сервисом. API и страница работают на машине.

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
```

Второй терминал:

```powershell
cd src/backend
dotnet run --launch-profile http
```

Профиль `http` в `Properties/launchSettings.json` слушает http://localhost:8080 и выставляет `ASPNETCORE_ENVIRONMENT=Development`. Браузер сам не открывается. Профиль IIS Express в репозитории есть и для этого запуска не используется.

Третий терминал — страница, команды те же: `cd src/frontend`, `npm install`, `npm run dev`.

ML вместе с Ollama и SearXNG, из корня:

```powershell
docker compose up --build ml
```

Локальный процесс ML, когда Ollama и SearXNG уже запущены. Зависимости ставятся двумя командами: пакет с хешами и редактируемая установка в одном вызове pip не смешиваются.

```powershell
cd src/ml
python -m venv .venv
.venv\Scripts\python -m pip install --require-hashes -r requirements-test.lock
.venv\Scripts\python -m pip install --no-deps -e .
.venv\Scripts\uvicorn smart_credit_ml.api:app --port 8000
```

Адреса те же, что в таблице выше. В этом сценарии API ходит в ML по `http://localhost:8000` из `appsettings.json`.

Сборка страницы и просмотр сборки, если нужны:

```powershell
cd src/frontend
npm run build
npm run preview
```

Отдельного production-образа фронтенда в репозитории нет.

## Команды, которые в проекте есть

Линтер страницы, из `src/frontend`:

```powershell
npm run lint
```

Это `oxlint`.

Тесты ML, из `src/ml`, после установки `requirements-test.lock`. Они подменяют поисковик, загрузку страниц и модель. Интернет и Ollama для них не нужны. `src/ml/README.md` указывает 30 тестов.

```powershell
.venv\Scripts\python -m pytest
```

Пересборка lock-файлов Python после правки `pyproject.toml`. Для обычного запуска `uv` не нужен. Команды записаны в `src/ml/README.md`.

```powershell
uv pip compile pyproject.toml --universal --python-version 3.12 --generate-hashes --no-header -o requirements.lock
uv pip compile pyproject.toml --extra test --universal --python-version 3.12 --generate-hashes --no-header -o requirements-test.lock
```

Команда `smart-credit-ml` печатает настройки Postgres и список `*.sql`. Соединение она не открывает. `smart-credit-products` запускает один поиск товаров из командной строки. Тестов .NET и отдельной команды генерации клиента API нет.

## Частые проблемы запуска

**Docker не запущен.** `docker compose` не подключается к движку. Запустите Docker Desktop и повторите команду.

**Порт занят.** Compose публикует 5432, 8080, 8000, 8888 и 11434. Если порт уже держит локальный Postgres, старый контейнер или другой API, привязка не создаётся. Освободите порт или остановите прежний контейнер того же проекта: `docker compose down`.

**База ещё не готова или API смотрит не туда.** У `postgres` есть проверка `pg_isready`. Сервис `ml` ждёт её. Сервис `backend` не ждёт и в Compose не получает хост `postgres`. Пока инициализация тома не закончилась, запросы к реестрам падают. Подождите готовности Postgres. Для контейнера API задайте `Postgres__ConnectionString` с `Host=postgres;Port=5432;Username=ml;Password=change-me;Database=registries`. Если том `postgres-data` уже был создан со старым SQL, новый скрипт реестров сам не применится: нужна пустая инициализация тома.
