#!/usr/bin/env python3
"""
Tests OKX credentials using the same OKXClient that the backend uses.
Run with: PYTHONPATH=src python scripts/test_okx_via_client.py
"""

import asyncio

from autotrade_service.config import Settings, get_settings
from autotrade_service.providers.okx_client import OKXClient, OKXClientError

# Optional: hardcode credentials here to bypass .env (leave empty to use .env values)
API_KEY_OVERRIDE = "6afa98e5-ae2a-438c-86d0-dd7187118ebf" 
API_SECRET_OVERRIDE = "37C7B571E82F8926C14DCBDA6CE993EB" 
API_PASSPHRASE_OVERRIDE = "P@ssw0rd"
DEMO_MODE_OVERRIDE = True


def resolve_settings() -> Settings:
    if API_KEY_OVERRIDE and API_SECRET_OVERRIDE and API_PASSPHRASE_OVERRIDE:
        return Settings(
            okx_api_key=API_KEY_OVERRIDE,
            okx_secret_key=API_SECRET_OVERRIDE,
            okx_passphrase=API_PASSPHRASE_OVERRIDE,
            okx_demo_mode=DEMO_MODE_OVERRIDE,
        )
    return get_settings()


async def main() -> None:
    settings = resolve_settings()
    print(f"Demo mode: {settings.okx_demo_mode}")
    print(f"Trading broker default: {settings.trading_broker}")

    try:
        client = await OKXClient.create(settings=settings)
        try:
            print("REST base URL:", client._exchange.urls["api"]["rest"])
            balance = await client.fetch_balance()
            info = balance.get("info")
            print("OKX balance fetch succeeded.")
            if isinstance(info, dict):
                print("Sample payload:", list(info.items())[:1])
            else:
                print("Balance keys:", balance.keys())
        finally:
            await client.close()
    except OKXClientError as exc:
        print("OKXClientError:", exc)
    except Exception as exc:
        print("Unexpected error:", exc)


if __name__ == "__main__":
    asyncio.run(main())
