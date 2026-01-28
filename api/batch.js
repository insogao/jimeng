// Jimeng Batch API Controller
const API_QUEUE_KEY = 'jimeng_api_queue';
const API_RESULTS_KEY = 'jimeng_api_results';
const API_SETTINGS_KEY = 'jimeng_api_settings';

let isRunning = false;
let shouldPause = false;
let currentTask = null;

// Logger
function log(message, type = 'info') {
    const container = document.getElementById('log-container');
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-${type}">${message}</span>`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}

// Load queue from storage
async function loadQueue() {
    const result = await chrome.storage.local.get([API_QUEUE_KEY]);
    return result[API_QUEUE_KEY] || [];
}

// Save queue to storage
async function saveQueue(queue) {
    await chrome.storage.local.set({ [API_QUEUE_KEY]: queue });
}

// Load results
async function loadResults() {
    const result = await chrome.storage.local.get([API_RESULTS_KEY]);
    return result[API_RESULTS_KEY] || [];
}

// Save result
async function saveResult(taskId, promptName, images, success = true, error = null) {
    const results = await loadResults();
    results.push({
        taskId,
        promptName,
        images: images || [],
        success,
        error,
        completedAt: Date.now()
    });
    // Keep only last 1000 results
    if (results.length > 1000) results.shift();
    await chrome.storage.local.set({ [API_RESULTS_KEY]: results });
}

// Update stats display
async function updateStats() {
    const queue = await loadQueue();
    const results = await loadResults();
    
    const pending = queue.filter(t => t.status === 'pending').length;
    const running = queue.filter(t => t.status === 'running').length;
    const completed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-running').textContent = running;
    document.getElementById('stat-completed').textContent = completed;
    document.getElementById('stat-failed').textContent = failed;
    
    // Update queue list
    renderQueueList(queue);
}

// Render queue list
function renderQueueList(queue) {
    const container = document.getElementById('queue-list');
    if (queue.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">暂无任务</p>';
        return;
    }
    
    container.innerHTML = queue.slice(0, 50).map(task => `
        <div class="queue-item">
            <span>${task.name || task.id}</span>
            <span class="queue-status status-${task.status}">${task.status}</span>
        </div>
    `).join('');
    
    if (queue.length > 50) {
        container.innerHTML += `<p style="color: #999; text-align: center; padding: 10px;">...还有 ${queue.length - 50} 个任务</p>`;
    }
}

// Extract prompts from JSON
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

// Add task to queue
async function addTask(jsonData, fileName) {
    const prompts = extractPrompts(jsonData);
    if (prompts.length === 0) {
        log('JSON 中没有找到 prompts', 'error');
        return false;
    }
    
    const settings = await loadSettings();
    const task = {
        id: `task-${Date.now()}`,
        fileName,
        name: jsonData.metadata?.title || fileName,
        prompts,
        model: settings.model,
        ratio: settings.ratio,
        interval: settings.interval,
        status: 'pending',
        createdAt: Date.now()
    };
    
    const queue = await loadQueue();
    queue.push(task);
    await saveQueue(queue);
    
    log(`添加任务: ${task.name} (${prompts.length} prompts)`);
    updateStats();
    return true;
}

// Load settings
async function loadSettings() {
    const result = await chrome.storage.local.get([API_SETTINGS_KEY]);
    return result[API_SETTINGS_KEY] || {
        model: 'jimeng-4.5',
        ratio: '16:9',
        interval: 1,
        downloadMode: 'ask',  // 默认仅生成，完成后手动下载
        downloadPath: 'jimeng'
    };
}

// Save settings
async function saveSettings() {
    const settings = {
        model: document.getElementById('setting-model').value,
        ratio: document.getElementById('setting-ratio').value,
        interval: parseInt(document.getElementById('setting-interval').value) || 1,
        downloadMode: document.getElementById('setting-download-mode').value,
        downloadPath: document.getElementById('setting-download-path').value || 'jimeng'
    };
    await chrome.storage.local.set({ [API_SETTINGS_KEY]: settings });
}

// Show/hide download path based on mode
function updateDownloadPathVisibility() {
    const mode = document.getElementById('setting-download-mode').value;
    const pathRow = document.getElementById('download-path-row');
    pathRow.style.display = (mode === 'auto') ? 'flex' : 'none';
}

// Sleep helper
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Send message to background
async function sendMessage(data) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(data, (res) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(res);
            }
        });
    });
}

// Process single prompt
async function processPrompt(task, promptData, index) {
    log(`[${task.name}] 提交: ${promptData.name} (${index + 1}/${task.prompts.length})`);
    
    try {
        const response = await sendMessage({
            action: "GENERATE_IMAGE_ASYNC",
            payload: {
                prompt: promptData.prompt,
                promptName: promptData.name,
                model: task.model,
                ratio: task.ratio,
                resolution: "2k",
                preferredRegion: null
            }
        });
        
        if (response && response.success) {
            log(`[${task.name}] ${promptData.name} 提交成功`, 'success');
            return { success: true, historyId: response.historyId, promptName: promptData.name };
        } else {
            log(`[${task.name}] ${promptData.name} 提交失败: ${response?.error}`, 'error');
            return { success: false, error: response?.error };
        }
    } catch (err) {
        log(`[${task.name}] ${promptData.name} 错误: ${err.message}`, 'error');
        return { success: false, error: err.message };
    }
}

// Process batch
async function processBatch() {
    if (isRunning) return;
    isRunning = true;
    shouldPause = false;
    
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-pause').disabled = false;
    
    while (!shouldPause) {
        const queue = await loadQueue();
        const task = queue.find(t => t.status === 'pending');
        
        if (!task) {
            log('所有任务处理完成', 'success');
            break;
        }
        
        // Mark as running
        task.status = 'running';
        currentTask = task;
        await saveQueue(queue);
        updateStats();
        
        log(`开始处理任务: ${task.name} (${task.prompts.length} prompts)`);
        
        // Process each prompt
        for (let i = 0; i < task.prompts.length; i++) {
            if (shouldPause) {
                log('任务已暂停', 'warn');
                break;
            }
            
            const result = await processPrompt(task, task.prompts[i], i);
            await saveResult(task.id, task.prompts[i].name, null, result.success, result.error);
            
            // Wait interval
            if (i < task.prompts.length - 1 && !shouldPause) {
                await sleep(task.interval * 1000);
            }
        }
        
        if (!shouldPause) {
            task.status = 'completed';
            log(`任务完成: ${task.name}`, 'success');
        }
        
        await saveQueue(queue);
        updateStats();
    }
    
    isRunning = false;
    currentTask = null;
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-start').textContent = '开始处理';
    document.getElementById('btn-pause').disabled = true;
    
    // Show download button if there are completed images
    if (pendingDownloads.size > 0) {
        log('所有任务处理完成！请点击"📦 打包下载全部"按钮下载图片', 'success');
        updateDownloadPanel();
    }
}

// Listen for batch results from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "BATCH_RESULT") {
        handleBatchResult(message.payload);
    }
});

// Download image via background script with retry
async function downloadImage(url, filename, saveAs = false, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: "DOWNLOAD_IMAGE",
                    payload: { url, filename, saveAs }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response && response.success) {
                        resolve(response.downloadId);
                    } else {
                        reject(new Error(response?.error || 'Download failed'));
                    }
                });
            });
        } catch (err) {
            if (i === retries - 1) throw err;
            // Wait before retry
            await new Promise(r => setTimeout(r, 500));
        }
    }
}

// Alternative: Open images in new tabs for manual save
function openImagesInTabs(images, promptName) {
    images.forEach((url, index) => {
        setTimeout(() => {
            window.open(url, `_blank_${promptName}_${index}`);
        }, index * 200);
    });
}

// Pending downloads collection
const pendingDownloads = new Map(); // promptName -> {images, downloaded}

// Handle batch result
async function handleBatchResult(payload) {
    if (payload.success && payload.images && payload.images.length > 0) {
        log(`图片生成完成: ${payload.promptName} (${payload.images.length} 张)`, 'success');
        
        // Store for batch download
        pendingDownloads.set(payload.promptName, {
            images: payload.images,
            promptName: payload.promptName,
            timestamp: Date.now()
        });
        
        // Update download panel
        updateDownloadPanel();
        
        // Only auto-download if setting is enabled and it's the old behavior
        const settings = await loadSettings();
        if (settings.downloadMode === 'auto') {
            // Try auto download, but don't show errors
            for (const url of payload.images) {
                try {
                    const basePath = settings.downloadPath || 'jimeng';
                    const filename = `${basePath}/${payload.promptName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}/${Date.now()}.png`;
                    await downloadImage(url, filename, false);
                } catch (err) {
                    // Silent fail - user can use batch download
                }
            }
        }
    } else {
        log(`图片生成失败: ${payload.promptName}`, 'error');
    }
}

// Update download panel UI
function updateDownloadPanel() {
    const panel = document.getElementById('download-panel');
    const btnDownloadAll = document.getElementById('btn-download-all');
    const downloadList = document.getElementById('download-list');
    const countSpan = document.getElementById('download-count');
    const totalSpan = document.getElementById('download-total');
    
    if (!btnDownloadAll) {
        console.error('Download button not found');
        return;
    }
    
    if (pendingDownloads.size === 0) {
        panel.style.display = 'none';
        btnDownloadAll.style.cssText = 'display: none; background: #4caf50;';
        return;
    }
    
    // Show button - use cssText to ensure it overrides initial display:none
    btnDownloadAll.style.cssText = 'display: inline-block; background: #4caf50;';
    
    // Count total images
    let totalImages = 0;
    downloadList.innerHTML = '';
    
    pendingDownloads.forEach((item, name) => {
        totalImages += item.images.length;
        const div = document.createElement('div');
        div.style.cssText = 'padding: 5px; border-bottom: 1px solid #ddd;';
        div.innerHTML = `
            <span style="color: #333;">${name}</span>
            <span style="color: #666; float: right;">${item.images.length} 张</span>
        `;
        downloadList.appendChild(div);
    });
    
    countSpan.textContent = pendingDownloads.size;
    totalSpan.textContent = totalImages;
    
    console.log(`[Download Panel] Updated: ${pendingDownloads.size} groups, ${totalImages} images`);
}

// Show download panel
function showDownloadPanel() {
    console.log('[Download Panel] Showing panel...');
    const panel = document.getElementById('download-panel');
    const btnDownloadAll = document.getElementById('btn-download-all');
    
    if (!panel) {
        console.error('Download panel element not found');
        return;
    }
    
    // Make sure button stays visible
    if (btnDownloadAll) {
        btnDownloadAll.style.cssText = 'display: inline-block; background: #4caf50;';
    }
    
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth' });
    
    log('下载面板已展开，请选择下载方式');
}

// Download all images one by one
async function downloadAllImages() {
    console.log('[Download] Starting individual download...');
    
    if (pendingDownloads.size === 0) {
        log('没有可下载的图片', 'error');
        return;
    }
    
    const settings = await loadSettings();
    const basePath = settings.downloadPath || 'jimeng';
    
    let totalCount = 0;
    let successCount = 0;
    let failCount = 0;
    const failedImages = []; // Track failed images for fallback
    
    // Count total
    pendingDownloads.forEach(item => {
        totalCount += item.images.length;
    });
    
    log(`开始逐个下载 ${totalCount} 张图片...`);
    startDownloadKeepAlive(); // Start keep-alive for batch download
    
    for (const [promptName, item] of pendingDownloads) {
        for (let i = 0; i < item.images.length; i++) {
            const url = item.images[i];
            const filename = `${basePath}/${promptName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}/${Date.now()}_${i}.png`;
            
            try {
                await downloadImage(url, filename, false);
                successCount++;
                // Small delay between downloads
                await sleep(200);
            } catch (err) {
                failCount++;
                failedImages.push({ url, name: `${promptName}_${i}.png` });
                if (failCount <= 3) {
                    log(`下载失败: ${promptName} - 图片${i + 1}`, 'error');
                }
            }
        }
    }
    
    stopDownloadKeepAlive(); // Stop keep-alive when done
    
    if (successCount === totalCount) {
        log(`✓ 全部下载完成: ${successCount}/${totalCount}`, 'success');
    } else {
        log(`下载完成: ${successCount} 成功, ${failCount} 失败`, 'warn');
        // Offer fallback
        if (failCount > 0) {
            log(`失败图片已收集，准备打开备用下载方式...`, 'info');
            openImagesInNewTab(failedImages);
        }
    }
}

// Fallback: Open images in new tab for manual download
function openImagesInNewTab(images) {
    if (!images || images.length === 0) return;
    
    log(`正在打开 ${images.length} 张图片到新标签页...`, 'info');
    
    // Create a simple HTML page with all failed images
    let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>备用下载 - 失败图片</title>
    <style>
        body { font-family: sans-serif; padding: 20px; background: #f5f5f5; }
        .header { background: #ff9800; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px; }
        .image-card { background: white; padding: 10px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .image-card img { width: 100%; border-radius: 4px; }
        .image-card button { width: 100%; margin-top: 8px; padding: 8px; background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .image-card button:hover { background: #1976d2; }
    </style>
</head>
<body>
    <div class="header">
        <h2>⚠️ 部分图片下载失败</h2>
        <p>请右键点击图片 → "图片另存为" 手动保存</p>
    </div>
    <div class="image-grid">
`;
    
    images.forEach((img, i) => {
        html += `
        <div class="image-card">
            <img src="${img.url}" alt="${img.name}" loading="lazy">
            <p style="font-size: 12px; color: #666; margin: 5px 0;">${img.name}</p>
            <button onclick="downloadImage('${img.url}', '${img.name}')">下载</button>
        </div>
`;
    });
    
    html += `
    </div>
    <script>
        function downloadImage(url, filename) {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
        }
    </script>
</body>
</html>`;
    
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
}

// Keep alive for batch downloads
let downloadKeepAliveInterval = null;
function startDownloadKeepAlive() {
    if (downloadKeepAliveInterval) return;
    downloadKeepAliveInterval = setInterval(() => {
        chrome.runtime.sendMessage({ action: "PING" }).catch(() => {});
    }, 5000);
}
function stopDownloadKeepAlive() {
    if (downloadKeepAliveInterval) {
        clearInterval(downloadKeepAliveInterval);
        downloadKeepAliveInterval = null;
    }
}

// Download via background script with batch keep-alive
async function downloadViaBackground(url, filename) {
    // Ensure keep-alive is running during downloads
    startDownloadKeepAlive();
    
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "DOWNLOAD_IMAGE",
            payload: { url, filename, saveAs: false }
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.success) {
                resolve(response.downloadId);
            } else {
                reject(new Error(response?.error || 'Download failed'));
            }
        });
    });
}

// Download as ZIP (using Blob and URL.createObjectURL for simple approach)
async function downloadAsZip() {
    console.log('[Download] Starting ZIP download...');
    
    if (pendingDownloads.size === 0) {
        log('没有可下载的图片', 'error');
        return;
    }
    
    log('正在生成下载页面...');
    startDownloadKeepAlive();
    
    // Create a simple HTML page with all image links
    let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Jimeng 批量下载</title>
    <style>
        body { font-family: sans-serif; padding: 20px; }
        .group { margin-bottom: 30px; }
        .group h3 { color: #333; }
        .images { display: flex; flex-wrap: wrap; gap: 10px; }
        .images img { width: 200px; border-radius: 4px; cursor: pointer; }
        .images a { display: block; margin: 5px; }
        .btn { padding: 10px 20px; background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 5px; }
        .btn:hover { background: #1976d2; }
    </style>
</head>
<body>
    <h1>Jimeng 批量图片下载页</h1>
    <p>点击下方按钮下载所有图片，或右键点击图片 → "图片另存为"</p>
    <button class="btn" onclick="downloadAll()">一键下载全部</button>
    <button class="btn" onclick="openAll()">打开所有原图</button>
    <hr>
`;
    
    for (const [promptName, item] of pendingDownloads) {
        html += `
    <div class="group">
        <h3>${promptName}</h3>
        <div class="images">
`;
        item.images.forEach((url, i) => {
            html += `            <a href="${url}" target="_blank" class="img-link" data-url="${url}" data-name="${promptName}_${i}.png">
                <img src="${url}" title="${promptName} - ${i + 1}" loading="lazy">
            </a>
`;
        });
        html += `        </div>
    </div>
`;
    }
    
    html += `
<script>
function downloadAll() {
    const links = document.querySelectorAll('.img-link');
    links.forEach((link, i) => {
        setTimeout(() => {
            const a = document.createElement('a');
            a.href = link.dataset.url;
            a.download = link.dataset.name;
            a.click();
        }, i * 500);
    });
}
function openAll() {
    const links = document.querySelectorAll('.img-link');
    links.forEach(link => window.open(link.dataset.url, '_blank'));
}
</script>
</body>
</html>`;
    
    try {
        // Create blob and download via background
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        await downloadViaBackground(url, `jimeng_download_${Date.now()}.html`);
        
        stopDownloadKeepAlive();
        log('已生成下载页面，请打开该文件查看所有图片', 'success');
        log('提示: 打开下载的HTML文件，点击"一键下载全部"按钮');
    } catch (err) {
        stopDownloadKeepAlive();
        log(`生成下载页面失败: ${err.message}`, 'error');
        // Fallback: open directly
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        log('已直接打开下载页面', 'info');
    }
}

// Add manual download links to log
function addManualDownloadLinks(promptName, images) {
    const container = document.getElementById('log-container');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.style.background = '#2d2d2d';
    entry.style.padding = '8px';
    entry.style.marginTop = '4px';
    
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-info">${promptName} - 手动下载:</span>`;
    
    images.forEach((url, i) => {
        const link = document.createElement('a');
        link.href = url;
        link.textContent = ` [图片${i + 1}] `;
        link.style.color = '#4fc1ff';
        link.style.textDecoration = 'underline';
        link.target = '_blank';
        entry.appendChild(link);
    });
    
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}

// Export results
async function exportResults() {
    try {
        const results = await loadResults();
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        await downloadViaBackground(url, `jimeng-results-${Date.now()}.json`);
        log('结果已导出');
    } catch (err) {
        log(`导出失败: ${err.message}`, 'error');
    }
}

// Clear all
async function clearAll() {
    await chrome.storage.local.remove([API_QUEUE_KEY, API_RESULTS_KEY]);
    log('记录已清空');
    updateStats();
}

// File drop handling
function setupDropZone() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileSelect = document.getElementById('file-select');
    const jsonPaste = document.getElementById('json-paste');
    const btnParseJson = document.getElementById('btn-parse-json');
    
    fileSelect.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) await handleFile(file);
    });
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        for (const file of files) {
            if (file.name.endsWith('.json')) {
                await handleFile(file);
            }
        }
    });
    
    // Parse pasted JSON
    btnParseJson.addEventListener('click', async () => {
        const jsonText = jsonPaste.value.trim();
        if (!jsonText) {
            log('请输入 JSON 内容', 'error');
            return;
        }
        
        try {
            const json = JSON.parse(jsonText);
            const success = await addTask(json, 'pasted-task.json');
            if (success) {
                jsonPaste.value = ''; // Clear after successful add
                log('JSON 解析成功，任务已添加');
            }
        } catch (err) {
            log(`JSON 解析失败: ${err.message}`, 'error');
        }
    });
}

async function handleFile(file) {
    try {
        const text = await file.text();
        const json = JSON.parse(text);
        await addTask(json, file.name);
    } catch (err) {
        log(`文件解析失败: ${err.message}`, 'error');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Load settings
    loadSettings().then(settings => {
        document.getElementById('setting-model').value = settings.model || 'jimeng-4.5';
        document.getElementById('setting-ratio').value = settings.ratio || '16:9';
        document.getElementById('setting-interval').value = settings.interval || 1;
        document.getElementById('setting-download-mode').value = settings.downloadMode || 'auto';
        document.getElementById('setting-download-path').value = settings.downloadPath || 'jimeng';
        updateDownloadPathVisibility();
    });
    
    // Event listeners
    document.getElementById('btn-start').addEventListener('click', processBatch);
    document.getElementById('btn-pause').addEventListener('click', () => {
        shouldPause = true;
        document.getElementById('btn-start').textContent = '继续处理';
        document.getElementById('btn-start').disabled = false;
    });
    document.getElementById('btn-clear').addEventListener('click', () => {
        pendingDownloads.clear();
        updateDownloadPanel();
        clearAll();
    });
    document.getElementById('btn-export').addEventListener('click', exportResults);
    document.getElementById('btn-download-all').addEventListener('click', showDownloadPanel);
    document.getElementById('btn-download-zip').addEventListener('click', downloadAsZip);
    document.getElementById('btn-download-single').addEventListener('click', downloadAllImages);
    
    // Settings auto-save
    document.getElementById('setting-model').addEventListener('change', saveSettings);
    document.getElementById('setting-ratio').addEventListener('change', saveSettings);
    document.getElementById('setting-interval').addEventListener('change', saveSettings);
    document.getElementById('setting-download-mode').addEventListener('change', () => {
        updateDownloadPathVisibility();
        saveSettings();
    });
    document.getElementById('setting-download-path').addEventListener('change', saveSettings);
    
    // Setup drop zone
    setupDropZone();
    
    // Initial stats
    updateStats();
    
    // Auto-refresh stats every 2 seconds
    setInterval(updateStats, 2000);
    
    log('控制面板已就绪');
    log('提示: 可以拖拽 JSON 文件或直接粘贴 JSON 内容');
    log('新功能: 任务完成后点击"📦 打包下载全部"批量下载图片');
});
