# Jimeng Chrome Extension Implementation Plan

## Overview
Build a standalone Chrome Extension that allows users to generate images using Jimeng AI directly from the browser. It leverages the user's existing logged-in session (cookies) to authenticate with Jimeng's API.

## Directory Structure
Root: `/Users/xiin/work/B7QS85DV/JimengChromeExt`

```text
JimengChromeExt/
├── manifest.json
├── popup.html          # Main UI
├── popup.js            # UI Logic
├── background.js       # Service worker for API requests
├── icons/              # App icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── lib/                # Shared libraries
    ├── consts.js       # Constants (Models, URLs, etc.)
    ├── crypto.js       # MD5 and Sign generation
    ├── payload.js      # Request payload construction
    └── utils.js        # Helper functions
```

## Step-by-Step Plan

### 1. Configuration (Manifest)
- Create `manifest.json` (MV3).
- **Core Permissions**: `cookies`, `storage`, `host_permissions` (for `jimeng.jianying.com` and `capcut.com`).

### 2. Core Libraries (`lib/`)
- **`consts.js`**: Port constants from `jimeng-api` (API URLs, Model IDs, Resolution options).
- **`crypto.js`**: Implement MD5 hashing (using a lightweight JS implementation since Node's `crypto` is unavailable) and the specific `Sign` generation logic required by Jimeng API.
- **`payload.js`**: Rewrite the payload builder logic from `payload-builder.ts` into plain JavaScript. This is the most complex part as it involves nested JSON structures for `draft_content`, `metrics_extra`, etc.

### 3. Background Service (`background.js`)
- Implement the `generateImage` message handler.
- Logic flow:
  1. Receive request from Popup.
  2. Get `sessionid` and `cookie` from Chrome Cookie Store for the target domain.
  3. Construct headers (including `Sign` and `Device-Time`).
  4. Send `POST` request to `aigc_draft/generate`.
  5. Poll `get_history_by_ids` until status is `10` (Success) or `30` (Failed).
  6. Return result URLs to Popup.

### 4. User Interface (`popup.html` & `popup.js`)
- A clean interface with:
  - **Prompt**: Textarea.
  - **Model**: Select (Jimeng 4.5, etc.).
  - **Ratio**: Select (1:1, 16:9, etc.).
  - **Generate Button**: Triggers the process.
  - **Status Area**: Shows "Generating...", progress, or errors.
  - **Gallery**: Displays generated images.

## Technical Details

### Authentication
Instead of asking users for tokens, we use `chrome.cookies.get({ url: "https://jimeng.jianying.com", name: "sessionid" })`.

### Networking
Use native `fetch` API in `background.js`. Since we have `host_permissions`, CORS should be bypassed automatically by the browser extension runtime.
