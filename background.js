import { md5 } from './lib/md5.js';
import { v4 as uuidv4 } from './lib/uuid.js';
import {
    BASE_URL_CN,
    BASE_URL_US_COMMERCE,
    BASE_URL_DREAMINA_US,
    BASE_URL_HK_COMMERCE,
    BASE_URL_HK,
    BASE_URL_IMAGEX_CN,
    BASE_URL_IMAGEX_US,
    BASE_URL_IMAGEX_HK,
    ASSISTANT_IDS,
    MODELS,
    getImageModels,
    PLATFORM_CODE,
    VERSION_CODE,
    REGION_CN,
    REGION_US,
    REGION_ASIA,
    getRegionConfig
} from './lib/consts.js';
import { resolveResolution, buildGeneratePayload, buildVideoGeneratePayload, extractVideoUrl } from './lib/payload.js';

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

    if (message.action === "GENERATE_VIDEO") {
        console.log("[BG] Received Video Generate Request:", message.payload);
        handleGenerateVideo(message.payload).then(response => {
            console.log("[BG] Sending Video Response back to Popup:", response);
            sendResponse(response);
        });
        return true; // Keep channel open for async response
    }

    if (message.action === "GENERATE_VIDEO_ASYNC") {
        console.log("[BG] Received Async Video Generate Request:", message.payload);
        handleGenerateVideoAsync(message.payload).then(response => {
            sendResponse(response);
        });
        return true;
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
        const regionType = userPayload.preferredRegion || REGION_CN;
        const imageModels = getImageModels(regionType);
        const mappedModel = imageModels[userModel] || MODELS["jimeng-4.5"];

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
        const regionType = userPayload.preferredRegion || REGION_CN;
        const imageModels = getImageModels(regionType);
        const mappedModel = imageModels[userModel] || MODELS["jimeng-4.5"];
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

// ==================== Video Generation Functions ====================

// Store pending video results for async polling
const pendingVideoResults = new Map();
const STORAGE_KEY_VIDEO = 'jimeng_pending_video_batch';

// Load pending video tasks from storage on startup
chrome.storage.local.get([STORAGE_KEY_VIDEO], (result) => {
    if (result[STORAGE_KEY_VIDEO]) {
        const tasks = result[STORAGE_KEY_VIDEO];
        console.log(`[BG] Loaded ${tasks.length} pending video tasks from storage`);
        tasks.forEach(task => {
            pendingVideoResults.set(task.historyId, {
                region: task.region,
                promptName: task.promptName,
                startTime: task.startTime || Date.now(),
                attempts: task.attempts || 0
            });
            // Resume polling
            pollSingleVideoResult(task.historyId);
        });
    }
});

// Save pending video tasks to storage
async function savePendingVideoTasks() {
    const tasks = [];
    pendingVideoResults.forEach((value, historyId) => {
        tasks.push({
            historyId,
            region: value.region,
            promptName: value.promptName,
            startTime: value.startTime,
            attempts: value.attempts
        });
    });
    await chrome.storage.local.set({ [STORAGE_KEY_VIDEO]: tasks });
}

// Helper: Sleep function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Upload frame image to ImageX using the full AWS signature flow
 * Based on jimeng-api/src/lib/image-uploader.ts
 */
async function uploadFrameImage(base64Data, region) {
    console.log(`[BG] Starting frame image upload for region: ${region.code}`);
    
    try {
        // Parse base64 data
        const match = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!match) {
            throw new Error("Invalid base64 image data");
        }
        
        const imageType = match[1];
        const base64Content = match[2];
        const imageBuffer = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));
        const fileSize = imageBuffer.length;
        const filename = `frame_${Date.now()}.${imageType}`;
        
        console.log(`[BG] Frame image: ${filename}, size: ${fileSize} bytes`);

        // Step 1: Get upload token using apiRequest
        const tokenResult = await apiRequest("/mweb/v1/get_upload_token", region, {
            data: { scene: 2 }
        });

        if (!tokenResult?.data?.access_key_id) {
            throw new Error("Failed to get upload token: " + JSON.stringify(tokenResult));
        }

        const { 
            access_key_id, 
            secret_access_key, 
            session_token,
            service_id,
            space_name 
        } = tokenResult.data;
        
        const actualServiceId = region.regionType === REGION_CN ? service_id : space_name;
        
        console.log(`[BG] Got upload token, service_id: ${actualServiceId}`);

        // Step 2: Calculate CRC32
        const crc32 = calculateCRC32(imageBuffer);
        
        // Step 3: Apply for upload permission (ApplyImageUpload)
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z');
        const randomStr = Math.random().toString(36).substring(2, 12);
        
        // Get ImageX base URL based on region
        let imagexBaseUrl;
        if (region.regionType === REGION_CN) {
            imagexBaseUrl = BASE_URL_IMAGEX_CN;
        } else if (region.regionType === REGION_US) {
            imagexBaseUrl = BASE_URL_IMAGEX_US;
        } else {
            imagexBaseUrl = BASE_URL_IMAGEX_HK;
        }
        
        const applyUrl = `${imagexBaseUrl}/?Action=ApplyImageUpload&Version=2018-08-01&ServiceId=${actualServiceId}&FileSize=${fileSize}&s=${randomStr}${region.regionType !== REGION_CN ? '&device_platform=web' : ''}`;
        
        // Create AWS Signature V4
        const awsRegion = region.awsRegion || 'cn-north-1';
        const authorization = await createAWSSignature('GET', applyUrl, {
            'x-amz-date': timestamp,
            'x-amz-security-token': session_token
        }, access_key_id, secret_access_key, session_token, '', awsRegion);
        
        console.log(`[BG] Applying for upload permission...`);
        
        const applyResponse = await fetch(applyUrl, {
            method: 'GET',
            headers: {
                'accept': '*/*',
                'authorization': authorization,
                'origin': region.origin,
                'referer': `${region.origin}/ai-tool/generate`,
                'x-amz-date': timestamp,
                'x-amz-security-token': session_token,
            }
        });
        
        const applyResult = await applyResponse.json();
        
        if (applyResult?.ResponseMetadata?.Error) {
            throw new Error(`Apply upload failed: ${JSON.stringify(applyResult.ResponseMetadata.Error)}`);
        }
        
        const uploadAddress = applyResult?.Result?.UploadAddress;
        if (!uploadAddress?.StoreInfos?.[0] || !uploadAddress?.UploadHosts?.[0]) {
            throw new Error(`Invalid upload address: ${JSON.stringify(applyResult)}`);
        }
        
        const storeInfo = uploadAddress.StoreInfos[0];
        const uploadHost = uploadAddress.UploadHosts[0];
        const uploadUrl = `https://${uploadHost}/upload/v1/${storeInfo.StoreUri}`;
        
        console.log(`[BG] Uploading to: ${uploadUrl}`);
        
        // Step 4: Upload the image
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': storeInfo.Auth,
                'Content-CRC32': crc32,
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
            body: imageBuffer
        });
        
        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
        }
        
        console.log(`[BG] Image uploaded successfully`);
        
        // Step 5: Commit the upload
        const commitUrl = `${imagexBaseUrl}/?Action=CommitImageUpload&Version=2018-08-01&ServiceId=${actualServiceId}`;
        const commitTimestamp = new Date().toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z');
        const commitPayload = JSON.stringify({ SessionKey: uploadAddress.SessionKey });
        
        const payloadHash = await sha256(commitPayload);
        
        const commitAuthorization = await createAWSSignature('POST', commitUrl, {
            'x-amz-date': commitTimestamp,
            'x-amz-security-token': session_token,
            'x-amz-content-sha256': payloadHash
        }, access_key_id, secret_access_key, session_token, commitPayload, awsRegion);
        
        const commitResponse = await fetch(commitUrl, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'authorization': commitAuthorization,
                'content-type': 'application/json',
                'x-amz-date': commitTimestamp,
                'x-amz-security-token': session_token,
                'x-amz-content-sha256': payloadHash,
            },
            body: commitPayload
        });
        
        const commitResult = await commitResponse.json();
        
        if (commitResult?.ResponseMetadata?.Error) {
            throw new Error(`Commit failed: ${JSON.stringify(commitResult.ResponseMetadata.Error)}`);
        }
        
        const uploadResult = commitResult?.Result?.Results?.[0];
        if (!uploadResult || uploadResult.UriStatus !== 2000) {
            throw new Error(`Commit returned invalid status: ${JSON.stringify(uploadResult)}`);
        }
        
        console.log(`[BG] Frame upload complete: ${uploadResult.Uri}`);
        return uploadResult.Uri;
        
    } catch (error) {
        console.error("[BG] Frame upload error:", error);
        throw error;
    }
}

/**
 * Calculate CRC32 checksum
 */
function calculateCRC32(buffer) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }
    
    let crc = -1;
    for (let i = 0; i < buffer.length; i++) {
        crc = table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
    }
    
    return ((crc ^ -1) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Calculate SHA256 hash
 */
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create AWS Signature V4
 * Async implementation using crypto.subtle for ImageX
 */
async function createAWSSignature(method, url, headers, accessKey, secretKey, sessionToken, payload, region) {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname;
    const path = parsedUrl.pathname;
    const query = parsedUrl.search.slice(1); // Remove leading ?
    
    // Get timestamp from headers
    const amzDate = headers['x-amz-date'];
    const dateStamp = amzDate.slice(0, 8);
    
    // Calculate payload hash
    const payloadHash = headers['x-amz-content-sha256'] || await sha256('');
    
    // Create canonical request
    const canonicalHeaders = `host:${host}\n` +
        `x-amz-content-sha256:${payloadHash}\n` +
        `x-amz-date:${amzDate}\n` +
        `x-amz-security-token:${sessionToken}\n`;
    
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date;x-amz-security-token';
    
    const canonicalRequest = [
        method,
        path,
        query,
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n');
    
    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/iam/aws4_request`;
    
    // Calculate SHA256 of canonical request
    const canonicalRequestHash = await sha256(canonicalRequest);
    
    const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        canonicalRequestHash
    ].join('\n');
    
    // Calculate signature
    const signingKey = await getSignatureKey(secretKey, dateStamp, region, 'iam');
    const signature = await hmacSHA256Hex(signingKey, stringToSign);
    
    return `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/**
 * Get AWS Signature Key
 */
async function getSignatureKey(key, dateStamp, regionName, serviceName) {
    const kDate = await hmacSHA256(('AWS4' + key), dateStamp);
    const kRegion = await hmacSHA256(kDate, regionName);
    const kService = await hmacSHA256(kRegion, serviceName);
    const kSigning = await hmacSHA256(kService, 'aws4_request');
    return kSigning;
}

/**
 * HMAC SHA256 using crypto.subtle
 */
async function hmacSHA256(key, message) {
    const encoder = new TextEncoder();
    
    let keyData;
    if (typeof key === 'string') {
        keyData = encoder.encode(key);
    } else {
        keyData = key;
    }
    
    const messageData = encoder.encode(message);
    
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    return new Uint8Array(signature);
}

/**
 * HMAC SHA256 and return hex string
 */
async function hmacSHA256Hex(key, message) {
    const signature = await hmacSHA256(key, message);
    return Array.from(signature)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Handle video generation request
 */
async function handleGenerateVideo(userPayload) {
    try {
        console.log("[BG] Video Generation - Step 1: Getting region config...");
        
        // Get region config using the new three-region system
        const regionType = userPayload.preferredRegion || REGION_CN;
        const region = getRegionConfig(regionType);
        
        console.log(`[BG] Region: ${region.code}, aid: ${region.aid}, URL: ${region.urls.default}`);

        // Upload frame images if provided
        let firstFrameUri = null;
        let endFrameUri = null;
        
        if (userPayload.firstFrameImage) {
            console.log("[BG] Uploading first frame image...");
            try {
                firstFrameUri = await uploadFrameImage(userPayload.firstFrameImage, region);
                console.log(`[BG] First frame uploaded: ${firstFrameUri}`);
            } catch (err) {
                console.error("[BG] First frame upload failed:", err);
                // Continue without first frame
            }
        }
        
        if (userPayload.endFrameImage) {
            console.log("[BG] Uploading end frame image...");
            try {
                endFrameUri = await uploadFrameImage(userPayload.endFrameImage, region);
                console.log(`[BG] End frame uploaded: ${endFrameUri}`);
            } catch (err) {
                console.error("[BG] End frame upload failed:", err);
                // Continue without end frame
            }
        }

        // Build video generation payload
        console.log("[BG] Building video generation payload...");
        const buildResult = buildVideoGeneratePayload({
            userModel: userPayload.model,
            prompt: userPayload.prompt,
            ratio: userPayload.ratio,
            resolution: userPayload.resolution,
            duration: userPayload.duration,
            regionInfo: { aid: region.aid, regionType: region.regionType },
            firstFrameImage: firstFrameUri,
            endFrameImage: endFrameUri
        });
        
        console.log("[BG] Submitting video generation request...");
        const genRes = await apiRequest("/mweb/v1/aigc_draft/generate", region, {
            data: buildResult.payload
        });
        
        console.log("[BG] Video generation response:", JSON.stringify(genRes));
        
        if (!genRes?.data?.aigc_data?.history_record_id) {
            return { 
                success: false, 
                error: genRes?.errmsg || "API Error: Failed to start video generation." 
            };
        }
        
        const historyId = genRes.data.aigc_data.history_record_id;
        console.log(`[BG] Video generation started! History ID: ${historyId}`);
        
        // Poll for video result
        return await pollVideoResult(historyId, region);
        
    } catch (err) {
        console.error("[BG] Video Generation Error:", err);
        return { success: false, error: err.message };
    }
}

/**
 * Handle async video generation (fire-and-forget)
 */
async function handleGenerateVideoAsync(userPayload) {
    try {
        const regionType = userPayload.preferredRegion || REGION_CN;
        const region = getRegionConfig(regionType);
        
        // Upload frame images if provided
        let firstFrameUri = null;
        let endFrameUri = null;
        
        if (userPayload.firstFrameImage) {
            try {
                firstFrameUri = await uploadFrameImage(userPayload.firstFrameImage, region);
            } catch (err) {
                console.error("[BG] First frame upload failed:", err);
            }
        }
        
        if (userPayload.endFrameImage) {
            try {
                endFrameUri = await uploadFrameImage(userPayload.endFrameImage, region);
            } catch (err) {
                console.error("[BG] End frame upload failed:", err);
            }
        }

        const buildResult = buildVideoGeneratePayload({
            userModel: userPayload.model,
            prompt: userPayload.prompt,
            ratio: userPayload.ratio,
            resolution: userPayload.resolution,
            duration: userPayload.duration,
            regionInfo: { aid: region.aid, regionType: region.regionType },
            firstFrameImage: firstFrameUri,
            endFrameImage: endFrameUri
        });
        
        const genRes = await apiRequest("/mweb/v1/aigc_draft/generate", region, {
            data: buildResult.payload
        });
        
        if (!genRes?.data?.aigc_data?.history_record_id) {
            return { 
                success: false, 
                error: genRes?.errmsg || "Failed to start video generation." 
            };
        }
        
        const historyId = genRes.data.aigc_data.history_record_id;
        const promptName = userPayload.promptName || 'Unnamed';
        
        // Store for background polling
        pendingVideoResults.set(historyId, {
            region,
            promptName,
            startTime: Date.now(),
            attempts: 0
        });
        
        await savePendingVideoTasks();
        startKeepAlive();
        pollSingleVideoResult(historyId);
        
        return { success: true, historyId, promptName, submitted: true };
        
    } catch (err) {
        console.error("[BG] Async Video Generation Error:", err);
        return { success: false, error: err.message };
    }
}

/**
 * Poll for video generation result (blocking)
 */
async function pollVideoResult(historyId, region) {
    console.log(`[BG] Polling for video result: ${historyId}`);
    
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes (5s * 120)
    
    while (attempts < maxAttempts) {
        await sleep(5000);
        attempts++;
        
        console.log(`[BG] Video poll attempt ${attempts}...`);
        
        try {
            const pollRes = await apiRequest("/mweb/v1/get_history_by_ids", region, {
                data: {
                    history_ids: [historyId],
                    image_info: { width: 2048, height: 2048, format: "webp" }
                }
            });
            
            const record = pollRes.data?.[historyId];
            if (!record) {
                console.log(`[BG] No record found for ${historyId}, continuing...`);
                continue;
            }
            
            console.log(`[BG] Video status: ${record.status}`);
            
            // Status 10 = Success, 50 = Completed
            if (record.status === 10 || record.status === 50) {
                const items = record.item_list || [];
                
                // Extract video URL from the first item
                for (const item of items) {
                    const videoUrl = extractVideoUrl(item);
                    if (videoUrl) {
                        console.log(`[BG] Video generation complete! URL: ${videoUrl}`);
                        return { success: true, videoUrl };
                    }
                }
                
                console.log("[BG] Status is success but no video URL found, waiting...");
            } else if (record.status === 30) {
                console.error("[BG] Video generation failed on server side.");
                return { success: false, error: "Video generation failed server-side." };
            }
            // Status 20 = Processing, continue polling
            
        } catch (err) {
            console.error(`[BG] Poll error:`, err);
        }
    }
    
    return { success: false, error: "Timeout waiting for video generation." };
}

/**
 * Background polling for single video result
 */
async function pollSingleVideoResult(historyId) {
    const pending = pendingVideoResults.get(historyId);
    if (!pending) return;
    
    if (pending.attempts >= 120) {
        console.log(`[BG] Video polling timeout for ${historyId}`);
        pendingVideoResults.delete(historyId);
        await savePendingVideoTasks();
        return;
    }
    
    await sleep(5000);
    pending.attempts++;
    await savePendingVideoTasks();
    
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
                // Success
                const items = record.item_list || [];
                let videoUrl = null;
                
                for (const item of items) {
                    videoUrl = extractVideoUrl(item);
                    if (videoUrl) break;
                }
                
                // Store completed result
                const completedKey = 'jimeng_completed_video_results';
                const stored = await chrome.storage.local.get([completedKey]);
                const completed = stored[completedKey] || [];
                completed.push({
                    historyId,
                    promptName: pending.promptName,
                    videoUrl,
                    success: !!videoUrl,
                    completedAt: Date.now()
                });
                if (completed.length > 100) completed.shift();
                await chrome.storage.local.set({ [completedKey]: completed });
                
                // Send message to popup
                chrome.runtime.sendMessage({
                    action: "BATCH_VIDEO_RESULT",
                    payload: {
                        historyId,
                        promptName: pending.promptName,
                        videoUrl,
                        success: !!videoUrl
                    }
                }).catch(() => {});
                
                pendingVideoResults.delete(historyId);
                await savePendingVideoTasks();
                return;
                
            } else if (record.status === 30) {
                // Failed
                const completedKey = 'jimeng_completed_video_results';
                const stored = await chrome.storage.local.get([completedKey]);
                const completed = stored[completedKey] || [];
                completed.push({
                    historyId,
                    promptName: pending.promptName,
                    videoUrl: null,
                    success: false,
                    error: "Generation failed",
                    completedAt: Date.now()
                });
                await chrome.storage.local.set({ [completedKey]: completed });
                
                chrome.runtime.sendMessage({
                    action: "BATCH_VIDEO_RESULT",
                    payload: {
                        historyId,
                        promptName: pending.promptName,
                        videoUrl: null,
                        success: false
                    }
                }).catch(() => {});
                
                pendingVideoResults.delete(historyId);
                await savePendingVideoTasks();
                return;
            }
        }
        
        // Continue polling
        pollSingleVideoResult(historyId);
        
    } catch (err) {
        console.error(`[BG] Video poll error for ${historyId}:`, err);
        pollSingleVideoResult(historyId);
    }
}
