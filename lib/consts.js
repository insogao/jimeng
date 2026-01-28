/**
 * Jimeng/Dreamina API Constants
 */

// API Base URLs
export const BASE_URL_CN = "https://jimeng.jianying.com";
export const BASE_URL_US_COMMERCE = "https://commerce.us.capcut.com";
export const BASE_URL_DREAMINA_US = "https://dreamina-api.us.capcut.com";
export const BASE_URL_HK_COMMERCE = "https://commerce-api-sg.capcut.com";
export const BASE_URL_HK = "https://mweb-api-sg.capcut.com";
export const BASE_URL_DREAMINA_HK = "https://mweb-api-sg.capcut.com";

// ImageX URLs for image upload
export const BASE_URL_IMAGEX_CN = "https://imagex.bytedanceapi.com";
export const BASE_URL_IMAGEX_US = "https://imagex16-normal-us-ttp.capcutapi.us";
export const BASE_URL_IMAGEX_HK = "https://imagex-normal-sg.capcutapi.com";

// Region Types
export const REGION_CN = "CN";      // 中国区 (Jimeng)
export const REGION_US = "US";      // 美国区 (Dreamina US)
export const REGION_ASIA = "ASIA";  // 亚洲区 (Dreamina SG - 包含 HK/JP/SG)

// Region Codes (从 cookie 中检测到的具体区域代码)
export const REGION_CODE_CN = "CN";
export const REGION_CODE_US = "US";
export const REGION_CODE_HK = "HK";
export const REGION_CODE_JP = "JP";
export const REGION_CODE_SG = "SG";

// Assistant IDs
export const ASSISTANT_IDS = {
    CN: 513695,
    US: 513641,
    HK: 513641,
    JP: 513641,
    SG: 513641
};

// Platform and Version
export const PLATFORM_CODE = "7";
export const VERSION_CODE = "5.8.0";
export const WEB_VERSION = "7.5.0";
export const DA_VERSION = "3.3.7";
export const DRAFT_MIN_VERSION = "3.0.2";
export const DRAFT_VERSION = "3.3.7";

// ==================== Region Utils ====================

/**
 * 将具体的区域代码转换为三大区类型
 * @param {string} regionCode - 从 cookie 检测到的区域代码 (CN, US, HK, JP, SG)
 * @returns {string} - 三大区类型 (CN, US, ASIA)
 */
export function getRegionType(regionCode) {
    const code = (regionCode || "CN").toUpperCase();
    if (code === REGION_CODE_CN) return REGION_CN;
    if (code === REGION_CODE_US) return REGION_US;
    // HK, JP, SG 都归类为亚洲区
    if ([REGION_CODE_HK, REGION_CODE_JP, REGION_CODE_SG].includes(code)) {
        return REGION_ASIA;
    }
    return REGION_CN; // 默认中国
}

/**
 * 根据区域类型获取对应的 API 配置
 * @param {string} regionType - 三大区类型 (CN, US, ASIA)
 * @param {string} specificCode - 具体的区域代码 (用于显示)
 * @returns {Object} - 区域配置
 */
export function getRegionConfig(regionType, specificCode = null) {
    const type = regionType || REGION_CN;
    const displayCode = specificCode || type;
    
    switch (type) {
        case REGION_US:
            return {
                code: REGION_US,
                label: `${displayCode} (Dreamina US)`,
                regionType: REGION_US,
                urls: {
                    default: BASE_URL_DREAMINA_US,
                    commerce: BASE_URL_US_COMMERCE,
                    imagex: BASE_URL_IMAGEX_US
                },
                aid: ASSISTANT_IDS.US,
                cookieUrl: "https://www.capcut.com",
                awsRegion: "us-east-1",
                origin: "https://dreamina.capcut.com"
            };
            
        case REGION_ASIA:
            return {
                code: displayCode, // 保留具体代码如 HK, JP, SG
                label: `${displayCode} (Dreamina Asia)`,
                regionType: REGION_ASIA,
                urls: {
                    default: BASE_URL_HK,
                    commerce: BASE_URL_HK_COMMERCE,
                    imagex: BASE_URL_IMAGEX_HK
                },
                aid: ASSISTANT_IDS.SG, // 亚洲区统一使用 SG 的 aid
                cookieUrl: "https://www.capcut.com",
                awsRegion: "ap-southeast-1",
                origin: "https://dreamina.capcut.com"
            };
            
        case REGION_CN:
        default:
            return {
                code: REGION_CN,
                label: "CN (Jimeng)",
                regionType: REGION_CN,
                urls: {
                    default: BASE_URL_CN,
                    commerce: BASE_URL_CN,
                    imagex: BASE_URL_IMAGEX_CN
                },
                aid: ASSISTANT_IDS.CN,
                cookieUrl: "https://jimeng.jianying.com",
                awsRegion: "cn-north-1",
                origin: "https://jimeng.jianying.com"
            };
    }
}

/**
 * 根据具体区域代码获取配置
 * @param {string} regionCode - 具体区域代码 (CN, US, HK, JP, SG)
 * @returns {Object} - 区域配置
 */
export function getRegionConfigByCode(regionCode) {
    const type = getRegionType(regionCode);
    return getRegionConfig(type, regionCode);
}

// ==================== Image Models ====================

// Model Mappings - CN (中国)
export const MODELS_CN = {
    "jimeng-4.5": "high_aes_general_v40l",
    "jimeng-4.1": "high_aes_general_v41",
    "jimeng-4.0": "high_aes_general_v40",
    "jimeng-3.0": "high_aes_general_v30l:general_v3.0_18b"
};

// Model Mappings - US/Asia (国际)
export const MODELS_INTL = {
    "jimeng-4.5": "high_aes_general_v40l",
    "jimeng-4.1": "high_aes_general_v41",
    "jimeng-4.0": "high_aes_general_v40",
    "jimeng-3.0": "high_aes_general_v30l:general_v3.0_18b",
    "nanobanana": "external_model_gemini_flash_image_v25",
    "nanobananapro": "dreamina_image_lib_1"
};

/**
 * 根据区域类型获取图片模型映射
 * @param {string} regionType - CN, US, ASIA
 * @returns {Object} - 模型映射
 */
export function getImageModels(regionType) {
    return regionType === REGION_CN ? MODELS_CN : MODELS_INTL;
}

// Backward compatible MODELS (defaults to CN models)
export const MODELS = MODELS_CN;

// ==================== Video Models ====================

// Video Model Mappings - CN (国内站)
export const VIDEO_MODELS_CN = {
    "jimeng-video-3.5-pro": "dreamina_ic_generate_video_model_vgfm_3.5_pro",
    "jimeng-video-3.0-pro": "dreamina_ic_generate_video_model_vgfm_3.0_pro",
    "jimeng-video-3.0": "dreamina_ic_generate_video_model_vgfm_3.0",
    "jimeng-video-3.0-fast": "dreamina_ic_generate_video_model_vgfm_3.0_fast",
    "jimeng-video-2.0": "dreamina_ic_generate_video_model_vgfm_lite",
    "jimeng-video-2.0-pro": "dreamina_ic_generate_video_model_vgfm1.0"
};

// Video Model Mappings - US (美国站)
export const VIDEO_MODELS_US = {
    "jimeng-video-3.5-pro": "dreamina_ic_generate_video_model_vgfm_3.5_pro",
    "jimeng-video-3.0": "dreamina_ic_generate_video_model_vgfm_3.0"
};

// Video Model Mappings - Asia (亚洲站)
export const VIDEO_MODELS_ASIA = {
    "jimeng-video-veo3": "dreamina_veo3_generate_video",
    "jimeng-video-veo3.1": "dreamina_veo3.1_generate_video",
    "jimeng-video-sora2": "dreamina_sora2_generate_video",
    "jimeng-video-3.5-pro": "dreamina_ic_generate_video_model_vgfm_3.5_pro",
    "jimeng-video-3.0-pro": "dreamina_ic_generate_video_model_vgfm_3.0_pro",
    "jimeng-video-3.0": "dreamina_ic_generate_video_model_vgfm_3.0",
    "jimeng-video-3.0-fast": "dreamina_ic_generate_video_model_vgfm_3.0_fast",
    "jimeng-video-2.0": "dreamina_ic_generate_video_model_vgfm_lite",
    "jimeng-video-2.0-pro": "dreamina_ic_generate_video_model_vgfm1.0"
};

/**
 * 根据区域类型获取视频模型映射
 * @param {string} regionType - CN, US, ASIA
 * @returns {Object} - 视频模型映射
 */
export function getVideoModels(regionType) {
    switch (regionType) {
        case REGION_US:
            return VIDEO_MODELS_US;
        case REGION_ASIA:
            return VIDEO_MODELS_ASIA;
        case REGION_CN:
        default:
            return VIDEO_MODELS_CN;
    }
}

// Default video model
export const DEFAULT_VIDEO_MODEL = "jimeng-video-3.5-pro";

// Video duration options (in seconds)
export const VIDEO_DURATIONS = {
    "sora2": [4, 8, 12],      // sora2 supports 4s, 8s, 12s
    "3.5-pro": [5, 10, 12],   // 3.5-pro supports 5s, 10s, 12s
    "veo3": [8],              // veo3 fixed 8s
    "default": [5, 10]        // others support 5s, 10s
};

// Video aspect ratios
export const VIDEO_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];

// Video resolutions (only some models support this)
export const VIDEO_RESOLUTIONS = ["720p", "1080p"];

// Status codes
export const STATUS_CODES = {
    PROCESSING: 20,
    SUCCESS: 10,
    FAILED: 30,
    POST_PROCESSING: 42,
    FINALIZING: 45,
    COMPLETED: 50
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
