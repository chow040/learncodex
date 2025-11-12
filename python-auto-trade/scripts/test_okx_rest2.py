import base64
import hashlib
import hmac
from datetime import datetime, timezone
import requests

api_key = "6afa98e5-ae2a-438c-86d0-dd7187118ebf"      # from Demo Trading page
secret_key = "37C7B571E82F8926C14DCBDA6CE993EB"    # from same key
passphrase = "P@ssw0rd"   # the one you chose

def iso_timestamp():
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )

timestamp = iso_timestamp()
method = "GET"
request_path = "/api/v5/account/balance"
body = ""

# Create signature
message = timestamp + method + request_path + body
sign = base64.b64encode(
    hmac.new(secret_key.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).digest()
).decode()

headers = {
    "OK-ACCESS-KEY": api_key,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
    "x-simulated-trading": "1",  # DEMO mode - CRITICAL for demo trading
}

url = "https://my.okx.com" + request_path
resp = requests.get(url, headers=headers)
print(resp.status_code)
print(resp.text)
