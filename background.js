import { md5 } from './lib/md5.js';
import { v4 as uuidv4 } from './lib/uuid.js';
import {
    BASE_URL_CN,
    BASE_URL_US_COMMERCE,
    BASE_URL_DREAMINA_US,
    BASE_URL_HK_COMMERCE,
    BASE_URL_HK,
    ASSISTANT_IDS,
    MODELS,
    PLATFORM_CODE,
    VERSION_CODE
} from './lib/consts.js';
import { resolveResolution, buildGeneratePayload } from './lib/payload.js';

/*
 * Detect Region and return Routing Info
 */

async function detectRegion(includeUserId = false, forceCode = null) {
    let userId = null;

    // Helper to find uid in cookie string (simple regex)
    const findUid = (details) => {
        return chrome.cookies.get(details).then(c => c ? c.value : null);
    };

    // Check for actual region in cookies for Dreamina
    const getCapCutRegion = async () => {
        try {
            // Try explicit URL matches first
            let c = await chrome.cookies.get({ url: "https://www.capcut.com", name: "store_region" });
            if (!c) c = await chrome.cookies.get({ url: "https://www.capcut.com", name: "region" });

            // Try domain scan if specific URL failed
            if (!c) {
                const allCookies = await chrome.cookies.getAll({ domain: "capcut.com" });
                c = allCookies.find(ck => ck.name === "store_region" || ck.name === "region" || ck.name === "sys_region");
            }

            if (c) {
                console.log(`[BG] Found Region Cookie: ${c.name}=${c.value}`);
                return c.value.toUpperCase();
            }

            console.warn("[BG] No region cookie found. Defaulting to SG (Asia) for safety.");
            return "SG"; // Changed default from US to SG to test if it fixes JP user issues
        } catch (e) {
            console.error("[BG] Failed to read region cookie:", e);
            return "SG";
        }
    };

    const detectedCode = await getCapCutRegion();

    // Define Region Configurations
    const usRegion = {
        code: "US",
        label: "US (Dreamina)",
        urls: {
            default: BASE_URL_DREAMINA_US,
            commerce: BASE_URL_US_COMMERCE
        },
        aid: ASSISTANT_IDS.US,
        cookieUrl: "https://www.capcut.com"
    };

    const asiaRegion = {
        code: detectedCode,
        label: `${detectedCode} (Dreamina SG)`,
        urls: {
            default: BASE_URL_HK, // mweb-api-sg.capcut.com
            commerce: BASE_URL_HK_COMMERCE
        },
        aid: ASSISTANT_IDS.SG,
        cookieUrl: "https://www.capcut.com"
    };

    // Auto-detect routing logic (Dreamina)
    let dreaminaRegionToUse = usRegion;
    if (["JP", "SG", "HK", "ID", "MY", "TH", "VN", "PH", "TW"].includes(detectedCode)) {
        dreaminaRegionToUse = asiaRegion;
    } else {
        // Fallback or genuine US
        usRegion.code = detectedCode; // Keep detected code for display
    }

    const cnRegion = {
        code: "CN",
        label: "CN (Jimeng)",
        urls: {
            default: BASE_URL_CN,
            commerce: BASE_URL_CN
        },
        aid: ASSISTANT_IDS.CN,
        cookieUrl: "https://jimeng.jianying.com"
    };

    // If forced, try that one first/only
    if (forceCode === "CN") {
        if (includeUserId) cnRegion.userId = await findUid({ url: cnRegion.cookieUrl, name: "uid_tt" });
        return cnRegion;
    }

    if (forceCode === "US") {
        if (includeUserId) dreaminaRegionToUse.userId = await findUid({ url: dreaminaRegionToUse.cookieUrl, name: "uid_tt" });
        return dreaminaRegionToUse;
    }

    // Default Auto-Detect Logic
    try {
        const usCookie = await chrome.cookies.get({ url: "https://www.capcut.com", name: "sessionid" });
        if (usCookie) {
            if (includeUserId) {
                dreaminaRegionToUse.userId = await findUid({ url: dreaminaRegionToUse.cookieUrl, name: "uid_tt" });
            }
            return dreaminaRegionToUse;
        }
    } catch (e) { }

    // Check CN (Default)
    if (includeUserId) {
        cnRegion.userId = await findUid({ url: cnRegion.cookieUrl, name: "uid_tt" });
    }
    return cnRegion;
}

async function getCookies(url) {
    const cookies = await chrome.cookies.getAll({ url });
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

async function apiRequest(endpoint, region, data = null) {
    const cookies = await getCookies(region.cookieUrl);
    const deviceTime = Math.floor(Date.now() / 1000);

    // Routing Logic: Select Base URL
    let baseUrl = region.urls.default;
    if (endpoint.startsWith("/commerce/")) {
        baseUrl = region.urls.commerce;
    }

    // Sign Logic
    const uriSuffix = endpoint.slice(-7);
    const signString = `9e2c|${uriSuffix}|${PLATFORM_CODE}|${VERSION_CODE}|${deviceTime}||11ac`;
    const sign = md5(signString);

    const fullUrl = `${baseUrl}${endpoint}`;

    const headers = {
        "Content-Type": "application/json",
        "Cookie": cookies,
        "Device-Time": deviceTime.toString(),
        "Sign": sign,
        "Sign-Ver": "1",
        "Appid": region.aid.toString(),
        "Appvr": VERSION_CODE,
        "Pf": PLATFORM_CODE
    };

    // Add search params for context
    const params = new URLSearchParams({
        aid: region.aid,
        device_platform: "web",
        region: region.code,
        da_version: "3.3.2",
        web_version: "7.5.0",
        aigc_features: "app_lip_sync"
    });

    const response = await fetch(`${fullUrl}?${params.toString()}`, {
        method: "POST",
        headers,
        body: JSON.stringify(data.data || {}) // Some endpoints wrap in 'data' 
    });

    let text;
    try {
        text = await response.text(); // Read text first
        const json = JSON.parse(text);
        return json;
    } catch (e) {
        console.error("[BG] Failed to parse JSON response. Status:", response.status);
        console.error("[BG] Raw Response Body:", text);
        throw new Error(`Server returned invalid JSON. Status: ${response.status}`);
    }
}

// Handler for incoming messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "GENERATE_IMAGE") {
        console.log("[BG] Received Generate Request:", message.payload);
        handleGenerate(message.payload).then(response => {
            console.log("[BG] Sending Response back to Popup:", response);
            sendResponse(response);
        });
        return true; // Keep channel open for async response
    }

    if (message.action === "CHECK_STATUS") {
        const preferred = message.payload?.preferredRegion; // "CN" or "US" or null
        detectRegion(true, preferred).then(region => {
            sendResponse({ region: region.label || region.code, userId: region.userId || "Unknown", code: region.code });
        });
        return true;
    }

    if (message.action === "SET_REGION") {
        // Just a signal, can be enhanced to clear cache if any
        sendResponse({ success: true });
    }
});

async function handleGenerate(userPayload) {
    try {
        console.log("[BG] Step 1: Detecting Region...");
        const region = await detectRegion(false, userPayload.preferredRegion);
        console.log(`[BG] Region detected: ${region.code} (${region.urls.default})`);

        // Resolve Resolution
        const userModel = userPayload.model || "jimeng-4.5";
        const mappedModel = MODELS[userModel] || MODELS["jimeng-4.5"];
        console.log(`[BG] Locking model: ${userModel} -> ${mappedModel}`);

        const resolution = resolveResolution(
            userModel,
            null, // regionInfo, not deeply used in simple resolve 
            userPayload.resolution || "2k",
            userPayload.ratio || "1:1"
        );

        // Build Request Payload
        const buildResult = buildGeneratePayload({
            userModel,
            model: mappedModel,
            prompt: userPayload.prompt,
            negativePrompt: userPayload.negativePrompt,
            resolution,
            regionInfo: { aid: region.aid }
        });
        console.log("[BG] Payload built successfully. Submit ID:", buildResult.submitId);

        // 1. Send Generate Request
        console.log("[BG] Sending API request to /mweb/v1/aigc_draft/generate...");
        const genRes = await apiRequest("/mweb/v1/aigc_draft/generate", region, {
            data: buildResult.payload
        });
        console.log("[BG] Generate API Response:", JSON.stringify(genRes));

        if (!genRes?.data?.aigc_data?.history_record_id) {
            console.error("[BG] Generate failed!", genRes);
            return { success: false, error: genRes?.errmsg || "API Error: Failed to start generation." };
        }

        const historyId = genRes.data.aigc_data.history_record_id;
        console.log(`[BG] Generation started! History ID: ${historyId}. Starting poll...`);

        // 2. Poll for Result
        let attempts = 0;
        while (attempts < 60) { // 5 minutes max
            await new Promise(r => setTimeout(r, 5000)); // Wait 5s
            console.log(`[BG] Polling attempt ${attempts + 1}...`);

            const pollRes = await apiRequest("/mweb/v1/get_history_by_ids", region, {
                data: {
                    history_ids: [historyId],
                    image_info: { width: 2048, height: 2048, format: "webp" } // Default stub
                }
            });

            const record = pollRes.data?.[historyId];
            if (record) {
                console.log(`[BG] Poll Status: ${record.status} (10/50=Success, 30=Fail)`);
                // Status 10 = Success, Status 50 = Completed (often needing moderation or just done)
                if (record.status === 10 || record.status === 50) {
                    // Extract images
                    // Strategy 1: record.item_list
                    const items = record.item_list || [];

                    // Debug: Log the first item structure to see where the URL is
                    if (items.length > 0 && attempts === 0) {
                        try {
                            console.log("[BG] First Item Structure:", JSON.stringify(items[0]));
                        } catch (e) { }
                    }

                    let images = items.map(item => {
                        // Priority 1: High res image in image.large_images
                        if (item.image?.large_images?.[0]?.image_url) {
                            return item.image.large_images[0].image_url;
                        }
                        // Priority 2: Cover URL in common_attr
                        if (item.common_attr?.cover_url) {
                            return item.common_attr.cover_url;
                        }

                        // Fallbacks for other potential structures
                        return item.url ||
                            item.image_url ||
                            item.cover_url ||
                            (item.url_list && item.url_list[0]?.url) ||
                            null;
                    }).filter(Boolean);

                    // Strategy 2: record.draft_content (JSON string parsing)
                    if (images.length === 0 && record.draft_content) {
                        try {
                            const draft = JSON.parse(record.draft_content);
                            const components = draft.component_list || [];
                            // Find components that look like images
                            components.forEach(comp => {
                                // Usually type "image_base_component"
                                if (comp.type === "image_base_component") {
                                    // Try various deep paths
                                    // No straightforward path known without inspecting 'comp'
                                }
                            });

                            // Backup Strategy 3: origin_item_list
                            const originItems = record.origin_item_list || [];
                            const originImages = originItems.map(item => item.image_url || item.url).filter(Boolean);
                            images = images.concat(originImages);

                        } catch (e) { console.error("Error parsing draft_content", e); }
                    }


                    // Special Handling for "Status 50" (Completed but maybe masked)
                    // If still no images, we might be looking at a raw task result.
                    // Let's try to grab ANY url we can find in the record log for debugging if we fail.

                    if (images.length > 0) {
                        console.log("[BG] Success! Images found:", images.length);
                        return { success: true, images: images };
                    } else {
                        console.log("[BG] Status is Success/Completed but no images found yet. Waiting... (Check origin_item_list or draft_content)");

                        // Debug: Print full record to help user find the path
                        if (attempts % 5 === 0) console.log("Full Record Dump:", record);
                    }
                } else if (record.status === 30) {
                    console.error("[BG] Generation failed on server side.");
                    return { success: false, error: "Generation failed server-side." };
                }
            } else {
                console.warn("[BG] Poll response did not contain record for history ID.");
            }
            attempts++;
        }

        return { success: false, error: "Timeout waiting for generation." };

    } catch (err) {
        console.error("[BG] Critical Exception:", err);
        return { success: false, error: err.message };
    }
}
