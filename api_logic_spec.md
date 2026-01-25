# Jimeng/Dreamina API Routing & Authentication Spec

This document describes the correct logic for routing requests to Jimeng (CN) and Dreamina (International) APIs, derived from the [jimeng-api](https://github.com/iptag/jimeng-api) source code.

## 1. Region Detection Logic

The application supports multiple regions: `CN`, `US`, `HK`, `JP`, `SG`.
Detection is based on the Cookie/Token prefix (in original code) or Browser Cookie domain (in Extension).

- **Region CN**: Default if no other region detected.
  - Cookie Domain: `jimeng.jianying.com`
- **Region US**:
  - Cookie Domain: `www.capcut.com` (or `.us.capcut.com`)
- **Region SG/HK/JP**:
  - Cookie Domain: `www.capcut.com` (Asia/SG endpoint)

## 2. Base URL Routing (CRITICAL)

The `baseUrl` changes based on **Region** AND **Endpoint Path**.

| Region | Endpoint Starts With | Target Base URL | Constant Name (Source) |
| :--- | :--- | :--- | :--- |
| **CN** | * (Any) | `https://jimeng.jianying.com` | `BASE_URL_CN` |
| **US** | `/commerce/` | `https://commerce.us.capcut.com` | `BASE_URL_US_COMMERCE` |
| **US** | * (Anything else) | `https://dreamina-api.us.capcut.com` | `BASE_URL_DREAMINA_US` |
| **HK/JP/SG** | `/commerce/` | `https://commerce-api-sg.capcut.com` | `BASE_URL_HK_COMMERCE` |
| **HK/JP/SG** | * (Anything else) | `https://mweb-api-sg.capcut.com` | `BASE_URL_DREAMINA_HK` |

> **Error Root Cause**: The extension was sending US generation requests (`/mweb/...`) to `commerce.us.capcut.com`, which returned 404. It MUST go to `dreamina-api.us.capcut.com`.

## 3. Assistant IDs (AID)

| Region | AID |
| :--- | :--- |
| CN | `513695` |
| US | `513641` |
| HK | `513641` |
| JP | `513641` |
| SG | `513641` |

## 4. Header Construction

Headers are uniform across regions but values change.

- **Appid**: Region's AID.
- **Appvr**: `5.8.0` (Constant `VERSION_CODE`)
- **Pf**: `7` (Constant `PLATFORM_CODE`)
- **Sign**: MD5 of `9e2c|{uri_suffix}|7|5.8.0|{time}||11ac`
  - `uri_suffix`: The last 7 characters of the endpoint URL.
- **Device-Time**: Unix timestamp (seconds).
- **Cookie**: domain-specific cookies.

## 5. URL Query Parameters

Critical query parameters to append to every POST request:

```json
{
  "aid": "{Region AID}",
  "device_platform": "web",
  "region": "{Region Code}", // e.g., "US", "cn"
  "da_version": "3.3.2",
  "web_version": "7.5.0",
  "aigc_features": "app_lip_sync"
}
```

## 6. Implementation Checklist for Fix

1.  **Update `consts.js`**: Add `BASE_URL_DREAMINA_US` = `https://dreamina-api.us.capcut.com`.
2.  **Update `background.js` -> `detectRegion()`**:
    - Should return an object containing ALL possible base URLs for that region, not just one.
    - Example: `{ code: "US", urls: { normal: "...", commerce: "..." }, ... }`
3.  **Update `background.js` -> `apiRequest()`**:
    - Implement the routing logic: `if (endpoint.startsWith('/commerce/')) use commerceUrl else use normalUrl`.
4.  **Verify MD5 Sign**: Ensure `sign` uses the correct URI suffix.
