#!/usr/bin/env python3
import base64
import hashlib
import hmac
import httpx
import json
import time

API_KEY = "6afa98e5-ae2a-438c-86d0-dd7187118ebf"
API_SECRET = "37C7B571E82F8926C14DCBDA6CE993EB"
PASSPHRASE = "P@ssw0rd"
DEMO_MODE = True  # True => sandbox (simulated trading)

BASE_URL = "https://my.okx.com"  # Use my.okx.com for regions where www.okx.com is blocked
REQUEST_PATH = "/api/v5/account/balance"
METHOD = "GET"
BODY = ""

def _iso_timestamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

def _sign(timestamp: str) -> str:
    message = f"{timestamp}{METHOD}{REQUEST_PATH}{BODY}"
    mac = hmac.new(API_SECRET.encode(), message.encode(), hashlib.sha256)
    return base64.b64encode(mac.digest()).decode()

def main() -> None:
    if not API_KEY or not API_SECRET or not PASSPHRASE:
        raise SystemExit("Fill in API_KEY/SECRET/PASSPHRASE first.")

    timestamp = _iso_timestamp()
    signature = _sign(timestamp)

    headers = {
        "OK-ACCESS-KEY": API_KEY,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": PASSPHRASE,
        "Content-Type": "application/json",
    }
    if DEMO_MODE:
        headers["x-simulated-trading"] = "1"

    url = f"{BASE_URL}{REQUEST_PATH}"
    response = httpx.get(url, headers=headers, timeout=10.0)
    print("Status:", response.status_code)
    try:
        payload = response.json()
        print(json.dumps(payload, indent=2))
    except json.JSONDecodeError:
        print("Raw response:", response.text)

if __name__ == "__main__":
    main()
