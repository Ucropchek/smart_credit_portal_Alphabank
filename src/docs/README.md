# Документация

Короткий указатель по репозиторию. Запуск, архитектура и проверка по шагам — в [корневом README](../../README.md).

- [`frontend/`](../frontend) — клиент на React, TypeScript и Vite. В Docker Compose собирается `Dockerfile` и отдаётся nginx (`nginx.conf`), для разработки запускается dev-сервером Vite.
- [`backend/`](../backend) — веб-API на C# и ASP.NET Core, рядом Dockerfile.
- [`ml/`](../ml) — Python-пакет для ML. Своя PostgreSQL: пример переменных в [`ml/.env.example`](../ml/.env.example), скрипты в [`ml/sql/`](../ml/sql). Поиск товаров под сумму кредита на Qwen 3.5 и SearXNG (порт 8000, принимает заявку от бэкенда) описан в [`ml/README.md`](../ml/README.md).
- [`docker-compose.yml`](../../docker-compose.yml) — весь прототип: `frontend`, `backend`, `postgres`, `ml`, `ollama`, `ollama-pull` и `searxng`.
- [`docker-compose.dev.yml`](../../docker-compose.dev.yml) — для разработки: публикует порты Postgres, SearXNG и Ollama на машине.
