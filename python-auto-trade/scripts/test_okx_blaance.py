#!/usr/bin/env python3
import asyncio
import ccxt.async_support as ccxt

API_KEY = "4eae5916-d4dd-4470-82d6-c008405d372e"
API_SECRET = "07C0AC17B85860C27180E944C91C2F94"
PASSPHRASE = "@P@ssw0rd"
DEMO_MODE = True  # set False if you’re targeting live

async def check_okx_balance():
    exchange = ccxt.okx({
        "apiKey": API_KEY,
        "secret": API_SECRET,
        "password": PASSPHRASE,
        "enableRateLimit": True,
    })
    if hasattr(exchange, "set_sandbox_mode"):
        exchange.set_sandbox_mode(DEMO_MODE)

    try:
        await exchange.load_markets()
        balance = await exchange.fetch_balance()
        print("Balance response keys:", list(balance.keys())[:5])
        print("Info:", balance.get("info"))
    except Exception as exc:
        print("OKX error:", exc)
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(check_okx_balance())
