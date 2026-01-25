const REGION_KEY = "jimeng_preferred_region";
let currentRegion = localStorage.getItem(REGION_KEY);

document.addEventListener('DOMContentLoaded', () => {
    updateToggleUI();
    checkStatus();

    document.getElementById('btn-cn').addEventListener('click', () => setRegion('CN'));
    document.getElementById('btn-us').addEventListener('click', () => setRegion('US'));
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

document.getElementById('generateBtn').addEventListener('click', async () => {
    const prompt = document.getElementById('prompt').value;
    const model = document.getElementById('model').value;
    const ratio = document.getElementById('ratio').value;
    const statusEl = document.getElementById('status');
    const btn = document.getElementById('generateBtn');
    const gallery = document.getElementById('gallery');

    const preferredRegion = currentRegion; // Capture current choice

    if (!prompt) {
        statusEl.textContent = "Please enter a prompt.";
        statusEl.className = "error";
        return;
    }

    // UI State: Loading
    btn.disabled = true;
    btn.textContent = "Generating...";
    statusEl.textContent = "Sending request to Jimeng/Dreamina...";
    statusEl.className = "";
    gallery.innerHTML = ""; // Clear previous

    try {
        // Use Retry Mechanism
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

            // Render images
            response.images.forEach(url => {
                const img = document.createElement('img');
                img.src = url;
                img.onclick = () => window.open(url, '_blank'); // Click to view full
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
