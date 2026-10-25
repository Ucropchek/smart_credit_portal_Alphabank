# Документация

Короткий указатель по репозиторию. Корневой README пустой.

- [`frontend/`](../frontend) — клиент на React, TypeScript и Vite. Запускается локальным dev-сервером и в Docker Compose не входит.
- [`backend/`](../backend) — веб-API на C# и ASP.NET Core, рядом Dockerfile.
- [`ml/`](../ml) — Python-пакет для ML. Своя PostgreSQL: пример переменных в [`ml/.env.example`](../ml/.env.example), скрипты в [`ml/sql/`](../ml/sql). Поиск товаров под сумму кредита на Qwen 3.5 и SearXNG (порт 8000, принимает заявку от бэкенда) описан в [`ml/README.md`](../ml/README.md).
- [`docker-compose.yml`](../../docker-compose.yml) — сервисы `backend`, `postgres`, `ml`, `ollama`, `ollama-pull` и `searxng` в корне репозитория.
