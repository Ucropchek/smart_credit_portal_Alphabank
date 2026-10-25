from __future__ import annotations

import argparse
import asyncio
import json
import sys
from decimal import Decimal, InvalidOperation

from smart_credit_ml.product_search import open_searcher
from smart_credit_ml.product_search.serialize import result_json


async def _run(args: argparse.Namespace) -> dict:
    async with open_searcher() as searcher:
        result = await searcher.run(args.keywords, args.budget, args.purpose, args.limit)
    return result_json(result)


def _budget(value: str) -> Decimal:
    try:
        amount = Decimal(value.replace(" ", "").replace(",", "."))
    except InvalidOperation as error:
        raise argparse.ArgumentTypeError("budget must be a number of roubles") from error
    if amount <= 0:
        raise argparse.ArgumentTypeError("budget must be positive")
    return amount


def main() -> None:
    parser = argparse.ArgumentParser(description="Find goods on the web that fit the loan amount.")
    parser.add_argument("keywords", help="what to buy, e.g. 'холодильная витрина'")
    parser.add_argument("budget", type=_budget, help="loan amount in roubles")
    parser.add_argument("--purpose", help="loan purpose, helps the model write queries")
    parser.add_argument("--limit", type=int, default=10, help="max offers in the answer")
    args = parser.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(asyncio.run(_run(args)), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
