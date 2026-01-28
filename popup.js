const REGION_KEY = "jimeng_preferred_region";
let currentRegion = localStorage.getItem(REGION_KEY);

let isBatchProcessing = false;
let shouldStopBatch = false;

// Listen for batch results from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "BATCH_RESULT") {
        handleBatchResult(message.payload);
    }
});

// Clear batch history
async function clearBatchHistory() {
    await chrome.storage.local.remove(['jimeng_completed_results', 'jimeng_pending_batch', BATCH_QUEUE_KEY]);
    const progressContainer = document.getElementById('batchProgress');
    if (progressContainer) progressContainer.innerHTML = '';
    document.getElementById('gallery').innerHTML = '';
    document.getElementById('status').textContent = 'History cleared';
    document.getElementById('status').className = '';
    displayedImages.clear(); // Clear tracked images
    
    // Reset batch state
    window.isBatchMode = false;
    window.isResuming = false;
    window.batchPrompts = [];
    document.getElementById('generateBtn').textContent = 'Generate Image';
}

// Restore pending and completed tasks when popup opens
async function restoreBatchState() {
    const statusEl = document.getElementById('status');
    const gallery = document.getElementById('gallery');
    
    // Check for pending tasks
    const pendingResult = await chrome.storage.local.get(['jimeng_pending_batch']);
    const pendingTasks = pendingResult['jimeng_pending_batch'] || [];
    
    // Check for completed results
    const completedResult = await chrome.storage.local.get(['jimeng_completed_results']);
    const completedTasks = completedResult['jimeng_completed_results'] || [];
    
    if (pendingTasks.length > 0 || completedTasks.length > 0) {
        // Create progress container
        let progressContainer = document.getElementById('batchProgress');
        if (!progressContainer) {
            progressContainer = document.createElement('div');
            progressContainer.id = 'batchProgress';
            statusEl.parentNode.insertBefore(progressContainer, statusEl.nextSibling);
        }
        progressContainer.innerHTML = '';
        
        // Add clear button
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear History';
        clearBtn.style.cssText = 'width:auto; padding:4px 8px; font-size:11px; margin-bottom:8px;';
        clearBtn.onclick = clearBatchHistory;
        progressContainer.appendChild(clearBtn);
        
        // Show completed tasks first
        completedTasks.slice().reverse().forEach(task => {
            const progressItem = document.createElement('div');
            progressItem.className = 'progress-item';
            if (task.success && task.images && task.images.length > 0) {
                progressItem.innerHTML = `<span>${task.promptName}</span><span class="progress-success">✓ ${task.images.length} images</span>`;
                // Add images to gallery (track displayed to prevent duplicates)
                task.images.forEach(url => {
                    if (!displayedImages.has(url)) {
                        displayedImages.add(url);
                        const img = document.createElement('img');
                        img.src = url;
                        img.title = task.promptName;
                        img.onclick = () => window.open(url, '_blank');
                        gallery.appendChild(img);
                    }
                });
            } else {
                progressItem.innerHTML = `<span>${task.promptName}</span><span class="progress-error">✗ Failed</span>`;
            }
            progressContainer.appendChild(progressItem);
        });
        
        // Show pending tasks
        pendingTasks.forEach(task => {
            const progressItem = document.createElement('div');
            progressItem.className = 'progress-item';
            progressItem.innerHTML = `<span>${task.promptName}</span><span class="progress-pending">Processing... (${task.attempts || 0} checks)</span>`;
            progressContainer.appendChild(progressItem);
        });
        
        statusEl.textContent = `${completedTasks.length} completed, ${pendingTasks.length} pending`;
        statusEl.className = pendingTasks.length > 0 ? '' : 'success';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    updateToggleUI();
    checkStatus();
    restoreBatchState();
    
    // Check if there's a batch to resume
    await resumeBatchIfNeeded();

    document.getElementById('btn-cn').addEventListener('click', () => setRegion('CN'));
    document.getElementById('btn-us').addEventListener('click', () => setRegion('US'));
    
    // File upload handler
    document.getElementById('jsonFile').addEventListener('change', handleFileUpload);
});

function updateToggleUI() {
    const btnCn = document.getElementById('btn-cn');
    const btnUs = document.getElementById('btn-us');
    btnCn.classList.remove('active');
    btnUs.classList.remove('active');
    if (currentRegion === 'CN') btnCn.classList.add('active');
    else if (currentRegion === 'US') btnUs.classList.add('active');
}

function setRegion(code) {
    currentRegion = code;
    localStorage.setItem(REGION_KEY, code);
    updateToggleUI();
    checkStatus();
}

// Helper to send message with auto-retry (handles SW wake-up issues)
async function sendMessageWithRetry(data, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(data, (res) => {
                    if (chrome.runtime.lastError) {
                        if (chrome.runtime.lastError.message.includes("Could not establish connection")) {
                            reject(chrome.runtime.lastError);
                        } else {
                            console.error("Runtime Error:", chrome.runtime.lastError);
                            resolve(null);
                        }
                    } else {
                        resolve(res);
                    }
                });
            });
        } catch (err) {
            if (i === maxRetries - 1) throw err;
            await new Promise(r => setTimeout(r, 500));
        }
    }
}

async function checkStatus() {
    const badge = document.getElementById('region-badge');
    const userIdEl = document.getElementById('user-id');

    try {
        const res = await sendMessageWithRetry({
            action: "CHECK_STATUS",
            payload: { preferredRegion: currentRegion }
        });

        if (res) {
            badge.textContent = `Connected: ${res.region}`;
            badge.style.fontWeight = "bold";
            badge.style.color = "#2196f3"; // Blue

            if (res.userId && res.userId !== "Unknown") {
                userIdEl.textContent = `UID: ${res.userId}`;
            } else {
                userIdEl.textContent = "Not Logged In";
                badge.style.color = "#f44336"; // Red
            }
            // Auto-set UI if not set
            if (!currentRegion && res.code) {
                if (res.code === "CN") currentRegion = "CN";
                if (res.code === "US") currentRegion = "US";
                updateToggleUI();
            }
        } else {
            badge.textContent = "Error: Check Console";
            badge.style.color = "red";
        }
    } catch (e) {
        badge.textContent = "Connection Failed";
        badge.style.color = "red";
    }
}

// Extract all prompts from JSON object recursively
function extractPrompts(obj, prompts = []) {
    if (typeof obj === 'object' && obj !== null) {
        if (obj.prompt && typeof obj.prompt === 'string') {
            prompts.push({
                name: obj.name || 'Unnamed',
                description: obj.description || '',
                prompt: obj.prompt
            });
        }
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                extractPrompts(obj[key], prompts);
            }
        }
    }
    return prompts;
}

// Parse and load prompts from JSON object
async function loadPromptsFromJson(json, sourceName) {
    const batchStatusEl = document.getElementById('batchStatus');
    const statusEl = document.getElementById('status');
    
    const prompts = extractPrompts(json);
    
    if (prompts.length === 0) {
        batchStatusEl.textContent = 'No prompts found in JSON';
        batchStatusEl.style.color = '#d32f2f';
        return false;
    }
    
    // Clear any previous batch queue
    await clearBatchQueue();
    
    batchStatusEl.textContent = `Found ${prompts.length} prompts. Click "Generate Image" to start batch processing.`;
    batchStatusEl.style.color = '#388e3c';
    
    // Store prompts for batch processing
    window.batchPrompts = prompts;
    window.isBatchMode = true;
    window.isResuming = false;
    window.batchCurrentIndex = 0;
    
    // Update button text
    const btn = document.getElementById('generateBtn');
    btn.textContent = `Start Batch (${prompts.length})`;
    
    statusEl.textContent = `Ready to process ${prompts.length} prompts from "${sourceName}"`;
    statusEl.className = 'success';
    
    return true;
}

// Handle file upload
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const batchStatusEl = document.getElementById('batchStatus');
    
    try {
        const text = await file.text();
        const json = JSON.parse(text);
        await loadPromptsFromJson(json, file.name);
    } catch (err) {
        batchStatusEl.textContent = 'Error parsing JSON file';
        batchStatusEl.style.color = '#d32f2f';
        console.error('JSON parse error:', err);
    }
}

// Handle pasted JSON
async function handlePastedJson() {
    const jsonPaste = document.getElementById('jsonPaste');
    const batchStatusEl = document.getElementById('batchStatus');
    const text = jsonPaste.value.trim();
    
    if (!text) {
        batchStatusEl.textContent = 'Please paste JSON content first';
        batchStatusEl.style.color = '#d32f2f';
        return;
    }
    
    try {
        const json = JSON.parse(text);
        const success = await loadPromptsFromJson(json, 'pasted-json');
        if (success) {
            jsonPaste.value = ''; // Clear after successful parse
        }
    } catch (err) {
        batchStatusEl.textContent = `JSON parse error: ${err.message}`;
        batchStatusEl.style.color = '#d32f2f';
        console.error('JSON parse error:', err);
    }
}

// Sleep helper
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Track already displayed images to prevent duplicates
const displayedImages = new Set();

const BATCH_QUEUE_KEY = 'jimeng_batch_queue';

// Save remaining prompts to storage
async function saveBatchQueue(prompts, currentIndex, model, ratio, preferredRegion) {
    await chrome.storage.local.set({
        [BATCH_QUEUE_KEY]: {
            prompts,
            currentIndex,
            model,
            ratio,
            preferredRegion,
            timestamp: Date.now()
        }
    });
}

// Clear batch queue
async function clearBatchQueue() {
    await chrome.storage.local.remove([BATCH_QUEUE_KEY]);
}

// Resume batch if there's a pending queue
async function resumeBatchIfNeeded() {
    const result = await chrome.storage.local.get([BATCH_QUEUE_KEY]);
    const queue = result[BATCH_QUEUE_KEY];
    
    if (!queue || queue.currentIndex >= queue.prompts.length) {
        return false;
    }
    
    const statusEl = document.getElementById('status');
    const remaining = queue.prompts.length - queue.currentIndex;
    
    statusEl.textContent = `Resuming batch: ${remaining} prompts remaining. Click button to continue.`;
    statusEl.className = 'success';
    
    // Store for button to use
    window.batchPrompts = queue.prompts;
    window.batchCurrentIndex = queue.currentIndex;
    window.batchModel = queue.model;
    window.batchRatio = queue.ratio;
    window.batchPreferredRegion = queue.preferredRegion;
    window.isBatchMode = true;
    window.isResuming = true;
    
    // Update button
    const btn = document.getElementById('generateBtn');
    btn.textContent = `Continue Batch (${remaining})`;
    
    return true;
}

// Handle batch result from background
function handleBatchResult(payload) {
    const gallery = document.getElementById('gallery');
    const progressContainer = document.getElementById('batchProgress');
    
    // Find the progress item for this prompt
    const items = progressContainer?.querySelectorAll('.progress-item') || [];
    items.forEach(item => {
        const nameSpan = item.querySelector('span:first-child');
        if (nameSpan && nameSpan.textContent.includes(payload.promptName)) {
            const statusSpan = item.querySelector('span:last-child');
            if (payload.success && payload.images && payload.images.length > 0) {
                statusSpan.textContent = `✓ ${payload.images.length} images`;
                statusSpan.className = 'progress-success';
                
                // Add images to gallery (check for duplicates)
                payload.images.forEach(url => {
                    if (!displayedImages.has(url)) {
                        displayedImages.add(url);
                        const img = document.createElement('img');
                        img.src = url;
                        img.title = payload.promptName;
                        img.onclick = () => window.open(url, '_blank');
                        gallery.appendChild(img);
                    }
                });
            } else {
                statusSpan.textContent = '✗ Failed';
                statusSpan.className = 'progress-error';
            }
        }
    });
}

// Generate single image - ASYNC mode (submit and return immediately)
async function generateSingleImage(promptData, model, ratio, preferredRegion) {
    const response = await sendMessageWithRetry({
        action: "GENERATE_IMAGE_ASYNC",
        payload: {
            prompt: promptData.prompt,
            promptName: promptData.name,
            model,
            ratio,
            resolution: "2k",
            preferredRegion
        }
    });
    return response;
}

// Batch processing - ASYNC mode: submit all without waiting for results
async function processBatch(prompts, model, ratio, preferredRegion, startIndex = 0) {
    const statusEl = document.getElementById('status');
    const btn = document.getElementById('generateBtn');
    
    isBatchProcessing = true;
    shouldStopBatch = false;
    
    // Create progress container
    let progressContainer = document.getElementById('batchProgress');
    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'batchProgress';
        statusEl.parentNode.insertBefore(progressContainer, statusEl.nextSibling);
    }
    if (startIndex === 0) {
        progressContainer.innerHTML = '';
    }
    
    const submitted = [];
    const total = prompts.length;
    
    for (let i = startIndex; i < prompts.length; i++) {
        if (shouldStopBatch) {
            // Save remaining prompts to resume later
            await saveBatchQueue(prompts, i, model, ratio, preferredRegion);
            statusEl.textContent = `Batch paused. ${i}/${total} submitted. Click button to continue.`;
            statusEl.className = 'error';
            isBatchProcessing = false;
            window.isBatchMode = true;
            window.isResuming = true;
            btn.textContent = `Continue Batch (${total - i})`;
            return submitted;
        }
        
        const promptData = prompts[i];
        
        // Create progress item immediately
        const progressItem = document.createElement('div');
        progressItem.className = 'progress-item';
        progressItem.id = `progress-${i}`;
        progressItem.innerHTML = `<span>[${i + 1}/${total}] ${promptData.name}</span><span class="progress-pending">Submitting...</span>`;
        progressContainer.prepend(progressItem);
        
        statusEl.textContent = `Submitting ${i + 1}/${total}: ${promptData.name}`;
        btn.textContent = `Stop Batch (${i + 1}/${total})`;
        
        try {
            // Submit request (async - don't wait for generation)
            const response = await generateSingleImage(promptData, model, ratio, preferredRegion);
            
            if (response && response.success && response.submitted) {
                progressItem.querySelector('span:last-child').textContent = 'Submitted ✓ (waiting...)';
                submitted.push({ ...promptData, historyId: response.historyId });
            } else {
                progressItem.querySelector('span:last-child').textContent = `✗ ${response?.error || 'Submit failed'}`;
                progressItem.querySelector('span:last-child').className = 'progress-error';
            }
        } catch (err) {
            progressItem.querySelector('span:last-child').textContent = '✗ Error';
            progressItem.querySelector('span:last-child').className = 'progress-error';
        }
        
        // Save progress after each submission
        if (i < prompts.length - 1) {
            await saveBatchQueue(prompts, i + 1, model, ratio, preferredRegion);
        }
        
        // Sleep 1 second before next submission (except for the last one)
        if (i < prompts.length - 1 && !shouldStopBatch) {
            await sleep(1000);
        }
    }
    
    // All done - clear queue
    await clearBatchQueue();
    
    isBatchProcessing = false;
    window.isBatchMode = false;
    window.isResuming = false;
    window.batchPrompts = [];
    btn.textContent = 'Generate Image';
    
    statusEl.textContent = `All ${submitted.length + startIndex}/${total} submitted! Results will appear as they complete.`;
    statusEl.className = 'success';
    
    return submitted;
}

document.getElementById('generateBtn').addEventListener('click', async () => {
    const prompt = document.getElementById('prompt').value;
    const model = document.getElementById('model').value;
    const ratio = document.getElementById('ratio').value;
    const statusEl = document.getElementById('status');
    const btn = document.getElementById('generateBtn');
    const gallery = document.getElementById('gallery');
    const preferredRegion = currentRegion;

    // Handle stop batch
    if (isBatchProcessing) {
        shouldStopBatch = true;
        statusEl.textContent = 'Stopping batch...';
        return;
    }

    // Handle batch mode (new or resume)
    if (window.isBatchMode && window.batchPrompts && window.batchPrompts.length > 0) {
        if (window.isResuming) {
            // Resume from where we left off
            await processBatch(
                window.batchPrompts, 
                window.batchModel || model, 
                window.batchRatio || ratio, 
                window.batchPreferredRegion || preferredRegion,
                window.batchCurrentIndex || 0
            );
        } else {
            // Fresh start
            gallery.innerHTML = '';
            displayedImages.clear();
            await processBatch(window.batchPrompts, model, ratio, preferredRegion);
        }
        return;
    }

    // Normal single generation
    if (!prompt) {
        statusEl.textContent = "Please enter a prompt.";
        statusEl.className = "error";
        return;
    }

    btn.disabled = true;
    btn.textContent = "Generating...";
    statusEl.textContent = "Sending request to Jimeng/Dreamina...";
    statusEl.className = "";
    gallery.innerHTML = "";

    try {
        const response = await sendMessageWithRetry({
            action: "GENERATE_IMAGE",
            payload: {
                prompt,
                model,
                ratio,
                resolution: "2k",
                preferredRegion
            }
        });

        if (response && response.success) {
            statusEl.textContent = "Generation complete!";
            statusEl.className = "success";

            response.images.forEach(url => {
                const img = document.createElement('img');
                img.src = url;
                img.onclick = () => window.open(url, '_blank');
                gallery.appendChild(img);
            });
        } else {
            statusEl.textContent = `Error: ${response?.error || 'Unknown error'}`;
            statusEl.className = "error";
        }

    } catch (err) {
        statusEl.textContent = `Extension Connection Error. Please retry.`;
        statusEl.className = "error";
    } finally {
        btn.disabled = false;
        btn.textContent = "Generate Image";
    }
});

// API Panel link
document.getElementById('api-panel-link').addEventListener('click', (e) => {
    e.preventDefault();
    const url = chrome.runtime.getURL('api/batch.html');
    chrome.tabs.create({ url });
});

// Parse JSON button
document.getElementById('btnParseJson').addEventListener('click', handlePastedJson);
