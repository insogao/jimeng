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

    if (message.action === "GENERATE_IMAGE_ASYNC") {
        // Fire-and-forget mode: submit and return immediately, don't wait for result
        console.log("[BG] Received Async Generate Request:", message.payload);
        handleGenerateAsync(message.payload).then(response => {
            sendResponse(response);
        });
        return true;
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

    if (message.action === "DOWNLOAD_IMAGE") {
        // Ensure keep-alive is running
        startKeepAlive();
        
        const { url, filename, saveAs } = message.payload;
        
        (async () => {
            try {
                console.log("[BG] Downloading:", filename);
                const downloadId = await chrome.downloads.download({
                    url: url,
                    filename: filename,
                    saveAs: saveAs || false
                });
                console.log("[BG] Download started:", downloadId);
                sendResponse({ success: true, downloadId });
            } catch (err) {
                console.error("[BG] Download failed:", err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        
        return true; // Keep message channel open
    }

    if (message.action === "PING") {
        // Keep-alive ping, just respond
        sendResponse({ pong: true, timestamp: Date.now() });
    }
});

// Store pending results for async polling
const pendingResults = new Map();
const STORAGE_KEY = 'jimeng_pending_batch';

// Load pending tasks from storage on startup
chrome.storage.local.get([STORAGE_KEY], (result) => {
    if (result[STORAGE_KEY]) {
        const tasks = result[STORAGE_KEY];
        console.log(`[BG] Loaded ${tasks.length} pending tasks from storage`);
        tasks.forEach(task => {
            pendingResults.set(task.historyId, {
                region: task.region,
                promptName: task.promptName,
                startTime: task.startTime || Date.now(),
                attempts: task.attempts || 0
            });
            // Resume polling
            pollSingleResult(task.historyId);
        });
    }
});

// Save pending tasks to storage
async function savePendingTasks() {
    const tasks = [];
    pendingResults.forEach((value, historyId) => {
        tasks.push({
            historyId,
            region: value.region,
            promptName: value.promptName,
            startTime: value.startTime,
            attempts: value.attempts
        });
    });
    await chrome.storage.local.set({ [STORAGE_KEY]: tasks });
}

// Keep service worker alive during batch processing
let keepAliveInterval = null;
function startKeepAlive() {
    if (!keepAliveInterval) {
        keepAliveInterval = setInterval(() => {
            if (pendingResults.size === 0) {
                stopKeepAlive();
            } else {
                console.log('[BG] Keep alive, pending tasks:', pendingResults.size);
            }
        }, 20000); // Every 20 seconds
    }
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

async function handleGenerateAsync(userPayload) {
    // Fire-and-forget mode: submit request and return immediately
    try {
        const region = await detectRegion(false, userPayload.preferredRegion);
        const userModel = userPayload.model || "jimeng-4.5";
        const mappedModel = MODELS[userModel] || MODELS["jimeng-4.5"];

        const resolution = resolveResolution(
            userModel,
            null,
            userPayload.resolution || "2k",
            userPayload.ratio || "1:1"
        );

        const buildResult = buildGeneratePayload({
            userModel,
            model: mappedModel,
            prompt: userPayload.prompt,
            negativePrompt: userPayload.negativePrompt,
            resolution,
            regionInfo: { aid: region.aid }
        });

        const genRes = await apiRequest("/mweb/v1/aigc_draft/generate", region, {
            data: buildResult.payload
        });

        if (!genRes?.data?.aigc_data?.history_record_id) {
            return { success: false, error: genRes?.errmsg || "API Error: Failed to start generation." };
        }

        const historyId = genRes.data.aigc_data.history_record_id;
        const promptName = userPayload.promptName || 'Unnamed';
        
        // Store for background polling
        pendingResults.set(historyId, {
            region,
            promptName,
            startTime: Date.now(),
            attempts: 0
        });
        
        // Save to storage for persistence
        await savePendingTasks();
        
        // Start keep-alive to prevent service worker from sleeping
        startKeepAlive();
        
        // Start background polling for this request
        pollSingleResult(historyId);
        
        return { success: true, historyId, promptName, submitted: true };
    } catch (err) {
        console.error("[BG] Async Generate Error:", err);
        return { success: false, error: err.message };
    }
}

// Background polling for single result
async function pollSingleResult(historyId) {
    const pending = pendingResults.get(historyId);
    if (!pending) return;
    
    if (pending.attempts >= 60) {
        console.log(`[BG] Polling timeout for ${historyId}`);
        pendingResults.delete(historyId);
        await savePendingTasks();
        return;
    }
    
    await new Promise(r => setTimeout(r, 5000));
    pending.attempts++;
    
    // Save updated attempts count
    await savePendingTasks();
    
    try {
        const pollRes = await apiRequest("/mweb/v1/get_history_by_ids", pending.region, {
            data: {
                history_ids: [historyId],
                image_info: { width: 2048, height: 2048, format: "webp" }
            }
        });
        
        const record = pollRes.data?.[historyId];
        if (record) {
            if (record.status === 10 || record.status === 50) {
                // Success - extract images
                const items = record.item_list || [];
                let images = items.map(item => {
                    if (item.image?.large_images?.[0]?.image_url) {
                        return item.image.large_images[0].image_url;
                    }
                    if (item.common_attr?.cover_url) {
                        return item.common_attr.cover_url;
                    }
                    return item.url || item.image_url || item.cover_url || null;
                }).filter(Boolean);
                
                if (images.length === 0 && record.origin_item_list) {
                    images = record.origin_item_list.map(item => item.image_url || item.url).filter(Boolean);
                }
                
                // Store completed result for popup to retrieve
                const completedKey = 'jimeng_completed_results';
                const stored = await chrome.storage.local.get([completedKey]);
                const completed = stored[completedKey] || [];
                completed.push({
                    historyId,
                    promptName: pending.promptName,
                    images,
                    success: images.length > 0,
                    completedAt: Date.now()
                });
                // Keep only last 100 results
                if (completed.length > 100) completed.shift();
                await chrome.storage.local.set({ [completedKey]: completed });
                
                // Send message to popup with results (if popup is open)
                chrome.runtime.sendMessage({
                    action: "BATCH_RESULT",
                    payload: {
                        historyId,
                        promptName: pending.promptName,
                        images,
                        success: images.length > 0
                    }
                }).catch(() => {});
                
                pendingResults.delete(historyId);
                await savePendingTasks();
                return;
            } else if (record.status === 30) {
                // Failed
                const completedKey = 'jimeng_completed_results';
                const stored = await chrome.storage.local.get([completedKey]);
                const completed = stored[completedKey] || [];
                completed.push({
                    historyId,
                    promptName: pending.promptName,
                    images: [],
                    success: false,
                    error: "Generation failed",
                    completedAt: Date.now()
                });
                await chrome.storage.local.set({ [completedKey]: completed });
                
                chrome.runtime.sendMessage({
                    action: "BATCH_RESULT",
                    payload: {
                        historyId,
                        promptName: pending.promptName,
                        images: [],
                        success: false,
                        error: "Generation failed"
                    }
                }).catch(() => {});
                
                pendingResults.delete(historyId);
                await savePendingTasks();
                return;
            }
        }
        
        // Continue polling
        pollSingleResult(historyId);
    } catch (err) {
        console.error(`[BG] Poll error for ${historyId}:`, err);
        pollSingleResult(historyId);
    }
}

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


// ==================== Native Messaging File IPC ====================
// 通过文件系统与外部程序通信，无需启动服务器

const NATIVE_MSG_DIR = 'jimeng/native-messaging';

// Check for new tasks every 2 seconds
setInterval(checkNativeTasks, 2000);

async function checkNativeTasks() {
    try {
        const dir = await getNativeMsgDir();
        if (!dir) return;
        
        // Find pending tasks
        const tasks = await dir.list();
        for (const entry of tasks) {
            if (entry.name.startsWith('task_') && entry.name.endsWith('.json')) {
                await processNativeTask(dir, entry.name);
            }
        }
    } catch (err) {
        // Silent fail - directory might not exist
    }
}

async function getNativeMsgDir() {
    // Use chrome.downloads to get the default download directory
    // and check for .jimeng/native-messaging folder
    return {
        list: async () => {
            // We can't directly list filesystem, so we use a different approach
            // Check via chrome.storage if there are pending tasks
            const result = await chrome.storage.local.get(['native_tasks']);
            const tasks = result.native_tasks || [];
            return tasks.map(t => ({ name: `task_${t.id}.json` }));
        }
    };
}

async function processNativeTask(dir, filename) {
    console.log(`[Native] Processing task: ${filename}`);
    
    try {
        // In a real implementation, we would read from the file
        // For now, we rely on the storage-based approach
        // This is a simplified version
    } catch (err) {
        console.error(`[Native] Error processing task: ${err}`);
    }
}

// Listen for external messages (from native host or other extensions)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    console.log('[External Message]', message);
    
    if (message.action === 'batch_generate') {
        handleExternalBatchGenerate(message.payload).then(result => {
            sendResponse(result);
        });
        return true; // Keep channel open
    }
    
    if (message.action === 'get_status') {
        getExternalStatus().then(status => {
            sendResponse(status);
        });
        return true;
    }
    
    sendResponse({ error: 'Unknown action' });
});

async function handleExternalBatchGenerate(payload) {
    try {
        const prompts = payload.prompts || [];
        const model = payload.model || 'jimeng-4.5';
        const ratio = payload.ratio || '16:9';
        const interval = payload.interval || 1;
        
        console.log(`[External] Batch generate: ${prompts.length} prompts`);
        
        // Submit all prompts
        const results = [];
        for (let i = 0; i < prompts.length; i++) {
            const promptData = prompts[i];
            const response = await handleGenerateAsync({
                prompt: promptData.prompt,
                promptName: promptData.name || `prompt_${i}`,
                model: model,
                ratio: ratio,
                resolution: '2k',
                preferredRegion: null
            });
            
            results.push({
                name: promptData.name,
                success: response.success,
                historyId: response.historyId
            });
            
            if (i < prompts.length - 1) {
                await sleep(interval * 1000);
            }
        }
        
        return {
            success: true,
            submitted: results.length,
            results: results
        };
        
    } catch (err) {
        console.error('[External] Batch error:', err);
        return { success: false, error: err.message };
    }
}

async function getExternalStatus() {
    const pending = await chrome.storage.local.get(['jimeng_pending_batch']);
    const completed = await chrome.storage.local.get(['jimeng_completed_results']);
    
    return {
        pending: pending.jimeng_pending_batch || [],
        completed: completed.jimeng_completed_results || []
    };
}

console.log('[BG] Native Messaging IPC initialized');
