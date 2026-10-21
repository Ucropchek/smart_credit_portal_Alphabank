# Документация

Короткий указатель по репозиторию. Корневой README пустой.

- `frontend/` — клиент на React, TypeScript и Vite. Запускается локальным dev-сервером и в Docker Compose не входит.
- `backend/` — веб-API на C# и ASP.NET Core, рядом Dockerfile.
- `ml/` — Python-пакет для ML. Своя PostgreSQL: пример переменных в `ml/.env.example`, скрипты в `ml/sql/`.
- `docker-compose.yml` — сервисы `backend` и `ml-postgres`.
