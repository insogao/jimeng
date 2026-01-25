/**
 * Jimeng/Dreamina API Constants
 */

export const BASE_URL_CN = "https://jimeng.jianying.com";
export const BASE_URL_US_COMMERCE = "https://commerce.us.capcut.com";
export const BASE_URL_DREAMINA_US = "https://dreamina-api.us.capcut.com";
export const BASE_URL_HK_COMMERCE = "https://commerce-api-sg.capcut.com";
export const BASE_URL_HK = "https://mweb-api-sg.capcut.com";

// Assistant IDs
export const ASSISTANT_IDS = {
    CN: 513695,
    US: 513641,
    HK: 513641,
    JP: 513641,
    SG: 513641
};

export const PLATFORM_CODE = "7";
export const VERSION_CODE = "5.8.0";
export const DRAFT_MIN_VERSION = "3.0.2";
export const DRAFT_VERSION = "3.3.7";

// Model Mappings
export const MODELS = {
    "jimeng-4.5": "high_aes_general_v40l",
    "jimeng-4.1": "high_aes_general_v41",
    "jimeng-4.0": "high_aes_general_v40",
    "jimeng-3.0": "high_aes_general_v30l:general_v3.0_18b",
    // International only
    "nanobanana": "external_model_gemini_flash_image_v25",
    "nanobananapro": "dreamina_image_lib_1"
};

// Resolution Options
export const RESOLUTIONS = {
    "1k": {
        "1:1": { width: 1024, height: 1024, ratio: 1 },
        "4:3": { width: 768, height: 1024, ratio: 4 },
        "3:4": { width: 1024, height: 768, ratio: 2 },
        "16:9": { width: 1024, height: 576, ratio: 3 },
        "9:16": { width: 576, height: 1024, ratio: 5 }
    },
    "2k": {
        "1:1": { width: 2048, height: 2048, ratio: 1 },
        "4:3": { width: 2304, height: 1728, ratio: 4 },
        "3:4": { width: 1728, height: 2304, ratio: 2 },
        "16:9": { width: 2560, height: 1440, ratio: 3 },
        "9:16": { width: 1440, height: 2560, ratio: 5 }
    },
    "4k": {
        "1:1": { width: 4096, height: 4096, ratio: 101 },
        "16:9": { width: 5120, height: 2880, ratio: 103 }
    }
};
