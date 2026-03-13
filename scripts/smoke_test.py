#!/usr/bin/env python3
"""
Smoke test for deployed Rafiki backend.
Usage: python scripts/smoke_test.py [BASE_URL]
Default BASE_URL: https://rafiki-backend.onrender.com
"""
import json
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE_URL = (sys.argv[1] if len(sys.argv) > 1 else "https://rafiki-backend.onrender.com").rstrip("/")


def req(path: str, method: str = "GET", data: dict | None = None) -> tuple[int, dict]:
    url = f"{BASE_URL}{path}"
    body = json.dumps(data).encode() if data else None
    r = Request(url, data=body, method=method, headers={"Content-Type": "application/json"} if body else {})
    try:
        with urlopen(r, timeout=15) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw.strip() else {}
    except HTTPError as e:
        body = e.read().decode() if e.fp else ""
        try:
            return e.code, json.loads(body) if body else {}
        except json.JSONDecodeError:
            return e.code, {"raw": body}
    except URLError as e:
        print(f"ERROR: {e.reason}")
        sys.exit(1)


def main():
    print(f"Smoke testing: {BASE_URL}\n")
    ok = 0
    fail = 0

    # Health
    code, data = req("/health")
    if code == 200 and data.get("ok"):
        print("  /health: OK")
        ok += 1
    else:
        print(f"  /health: FAIL (code={code})")
        fail += 1

    # Readiness
    code, data = req("/health/ready")
    if code == 200 and data.get("ok") and data.get("database") == "ok":
        print("  /health/ready: OK (DB connected)")
        ok += 1
    elif code == 503:
        print("  /health/ready: DEGRADED (DB unavailable)")
        fail += 1
    else:
        print(f"  /health/ready: FAIL (code={code})")
        fail += 1

    # Auth - verify-code invalid
    code, data = req("/auth/verify-code", method="POST", data={"code": "smoke-test-invalid"})
    if code == 404:
        print("  /auth/verify-code (invalid): OK (404)")
        ok += 1
    else:
        print(f"  /auth/verify-code (invalid): FAIL (expected 404, got {code})")
        fail += 1

    # Auth - login invalid
    code, _ = req("/auth/login", method="POST", data={"email": "smoke@test.local", "password": "wrong"})
    if code == 401:
        print("  /auth/login (invalid): OK (401)")
        ok += 1
    else:
        print(f"  /auth/login (invalid): FAIL (expected 401, got {code})")
        fail += 1

    # Protected route without token
    code, _ = req("/auth/me")
    if code == 401:
        print("  /auth/me (no token): OK (401)")
        ok += 1
    else:
        print(f"  /auth/me (no token): FAIL (expected 401, got {code})")
        fail += 1

    # Protected admin route
    code, _ = req("/super-admin/billing/overview")
    if code == 401:
        print("  /super-admin/billing/overview (no token): OK (401)")
        ok += 1
    else:
        print(f"  /super-admin/billing/overview (no token): FAIL (expected 401, got {code})")
        fail += 1

    print(f"\nResult: {ok} passed, {fail} failed")
    sys.exit(1 if fail > 0 else 0)


if __name__ == "__main__":
    main()
