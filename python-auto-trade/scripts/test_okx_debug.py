"""
Debug script for OKX API authentication issues.
Error 50119 typically means API key permission issues.
"""
import base64
import hashlib
import hmac
from datetime import datetime, timezone
import requests

# Your credentials
api_key = "6afa98e5-ae2a-438c-86d0-dd7187118ebf"
secret_key = "37C7B571E82F8926C14DCBDA6CE993EB"
passphrase = "P@ssw0rd"

def iso_timestamp():
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )

print("=" * 60)
print("OKX Demo Trading API Test")
print("=" * 60)

# Test 1: Public endpoint (no auth required)
print("\n1. Testing PUBLIC endpoint (no auth)...")
public_url = "https://my.okx.com/api/v5/public/time"
resp = requests.get(public_url)
print(f"   Status: {resp.status_code}")
print(f"   Response: {resp.text}")

# Test 2: Account balance with demo mode
print("\n2. Testing PRIVATE endpoint with demo mode...")
timestamp = iso_timestamp()
method = "GET"
request_path = "/api/v5/account/balance"
body = ""

# Create signature
message = timestamp + method + request_path + body
print(f"   Timestamp: {timestamp}")
print(f"   Message to sign: {message}")

sign = base64.b64encode(
    hmac.new(secret_key.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).digest()
).decode()

print(f"   Signature: {sign}")

headers = {
    "OK-ACCESS-KEY": api_key,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
    "x-simulated-trading": "1",  # CRITICAL for demo mode
}

url = "https://my.okx.com" + request_path
resp = requests.get(url, headers=headers)

print(f"   Status: {resp.status_code}")
print(f"   Response: {resp.text}")

# Interpret error codes
if resp.status_code == 200:
    print("\n✅ SUCCESS! Demo trading API is working.")
else:
    print(f"\n❌ ERROR {resp.status_code}")
    
    # Parse error
    try:
        error_data = resp.json()
        error_code = error_data.get('code', 'unknown')
        error_msg = error_data.get('msg', 'unknown')
        
        print(f"   Error Code: {error_code}")
        print(f"   Error Message: {error_msg}")
        
        # Common error codes
        if error_code == "50119":
            print("\n💡 Error 50119 Solutions:")
            print("   1. API key was NOT created in Demo Trading mode")
            print("   2. Go to: https://www.okx.com/demo-trading")
            print("   3. Click Profile → API Management")
            print("   4. Create a NEW API key while in DEMO mode")
            print("   5. Enable 'Trade' and 'Read' permissions")
            print("   6. Save the new credentials")
        elif error_code == "50113":
            print("\n💡 Error 50113: Invalid signature")
            print("   - Check that secret key is correct")
            print("   - Make sure no extra spaces in credentials")
        elif error_code == "50111":
            print("\n💡 Error 50111: Invalid API key")
            print("   - API key might be expired or deleted")
            print("   - Verify you copied the full key correctly")
    except:
        pass

print("\n" + "=" * 60)
