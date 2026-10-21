"""Show the ML PostgreSQL settings and the SQL scripts this package expects."""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def database_settings() -> dict[str, str]:
    return {
        "host": os.environ.get("ML_POSTGRES_HOST", "localhost"),
        "port": os.environ.get("ML_POSTGRES_PORT", "5432"),
        "user": os.environ.get("ML_POSTGRES_USER", "ml"),
        "password": os.environ.get("ML_POSTGRES_PASSWORD", "change-me"),
        "dbname": os.environ.get("ML_POSTGRES_DB", "ml"),
    }


def sql_dir() -> Path:
    override = os.environ.get("ML_SQL_DIR")
    if override:
        path = Path(override)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return path

    for parent in Path(__file__).resolve().parents:
        candidate = parent / "sql"
        if candidate.is_dir() and any(candidate.glob("*.sql")):
            return candidate

    return PROJECT_ROOT / "sql"


def sql_scripts() -> list[Path]:
    directory = sql_dir()
    if not directory.is_dir():
        raise FileNotFoundError(f"ML SQL directory not found: {directory}")
    scripts = sorted(path for path in directory.glob("*.sql") if path.is_file())
    if not scripts:
        raise FileNotFoundError(f"No SQL scripts in {directory}")
    return scripts


def main() -> None:
    settings = database_settings()
    scripts = sql_scripts()
    print(
        "ml postgres: {user}@{host}:{port}/{dbname}".format(**settings)
    )
    print("sql scripts:")
    for script in scripts:
        print(f"  {script}")


if __name__ == "__main__":
    main()
