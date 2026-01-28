import { v4 as uuidv4 } from './uuid.js';
import {
    DRAFT_MIN_VERSION,
    DRAFT_VERSION,
    RESOLUTIONS,
    VIDEO_MODELS_CN,
    VIDEO_MODELS_US,
    VIDEO_MODELS_ASIA,
    DEFAULT_VIDEO_MODEL,
    VIDEO_DURATIONS,
    REGION_CN,
    REGION_US,
    REGION_ASIA
} from './consts.js';

export function resolveResolution(userModel, regionInfo, resolutionStr, ratioStr) {
    // Logic from payload-builder.ts
    // Support simplified resolution lookup for now
    const resGroup = RESOLUTIONS[resolutionStr];
    if (!resGroup) throw new Error(`Invalid resolution: ${resolutionStr}`);

    const setting = resGroup[ratioStr];
    if (!setting) throw new Error(`Invalid ratio ${ratioStr} for resolution ${resolutionStr}`);

    return {
        width: setting.width,
        height: setting.height,
        imageRatio: setting.ratio,
        resolutionType: resolutionStr
    };
}

export function buildGeneratePayload({
    userModel, // e.g. "jimeng-4.5"
    model,     // e.g. "high_aes_general_v40l"
    prompt,
    negativePrompt,
    resolution,
    regionInfo,
    sampleStrength = 0.5
}) {
    const componentId = uuidv4();
    const submitId = uuidv4();

    // 1. Build Core Param
    const coreParam = {
        type: "",
        id: uuidv4(),
        model: model,
        prompt: prompt,
        sample_strength: sampleStrength,
        large_image_info: {
            type: "",
            id: uuidv4(),
            min_version: DRAFT_MIN_VERSION,
            height: resolution.height,
            width: resolution.width,
            resolution_type: resolution.resolutionType,
        },
        intelligent_ratio: false, // Defaulting to false for simplicity in V1
        image_ratio: resolution.imageRatio
    };

    if (negativePrompt) {
        coreParam.negative_prompt = negativePrompt;
    }

    coreParam.seed = Math.floor(Math.random() * 100000000) + 2500000000;

    // 2. Build Metrics Extra
    const metricsExtra = JSON.stringify({
        promptSource: "custom",
        generateCount: 1,
        enterFrom: "click",
        sceneOptions: JSON.stringify([{
            type: "image",
            scene: "ImageBasicGenerate",
            modelReqKey: userModel,
            resolutionType: resolution.resolutionType,
            abilityList: [],
            reportParams: {
                enterSource: "generate",
                vipSource: "generate",
                extraVipFunctionKey: `${userModel}-${resolution.resolutionType}`,
                useVipFunctionDetailsReporterHoc: true,
            }
        }]),
        generateId: submitId,
        isRegenerate: false
    });

    // 3. Build Draft Content
    const abilities = {
        type: "",
        id: uuidv4(),
        generate: {
            type: "",
            id: uuidv4(),
            core_param: coreParam,
            gen_option: {
                type: "",
                id: uuidv4(),
                generate_all: false
            }
        }
    };

    const draftContent = JSON.stringify({
        type: "draft",
        id: uuidv4(),
        min_version: DRAFT_MIN_VERSION,
        min_features: [],
        is_from_tsn: true,
        version: DRAFT_VERSION,
        main_component_id: componentId,
        component_list: [
            {
                type: "image_base_component",
                id: componentId,
                min_version: DRAFT_MIN_VERSION,
                aigc_mode: "workbench",
                metadata: {
                    type: "",
                    id: uuidv4(),
                    created_platform: 3,
                    created_platform_version: "",
                    created_time_in_ms: Date.now().toString(),
                    created_did: "",
                },
                generate_type: "generate",
                abilities: abilities,
            },
        ],
    });

    return {
        payload: {
            extend: { root_model: model },
            submit_id: submitId,
            metrics_extra: metricsExtra,
            draft_content: draftContent,
            http_common_info: {
                aid: regionInfo.aid
            }
        },
        submitId
    };
}

// ============ Video Generation Functions ============

/**
 * Get the mapped video model name based on region type
 * @param {string} userModel - 用户选择的模型名称
 * @param {string} regionType - 三大区类型: CN, US, ASIA
 */
export function getVideoModel(userModel, regionType) {
    // Determine which model map to use based on region type
    let modelMap = VIDEO_MODELS_CN;
    if (regionType === REGION_US) {
        modelMap = VIDEO_MODELS_US;
    } else if (regionType === REGION_ASIA) {
        modelMap = VIDEO_MODELS_ASIA;
    }
    
    return modelMap[userModel] || modelMap[DEFAULT_VIDEO_MODEL] || VIDEO_MODELS_CN[DEFAULT_VIDEO_MODEL];
}

/**
 * Get video benefit type for the model (used in API request)
 */
function getVideoBenefitType(model) {
    if (model.includes("veo3.1")) {
        return "generate_video_veo3.1";
    }
    if (model.includes("veo3")) {
        return "generate_video_veo3";
    }
    if (model.includes("sora2")) {
        return "generate_video_sora2";
    }
    if (model.includes("3.5_pro")) {
        return "dreamina_video_seedance_15_pro";
    }
    if (model.includes("3.5")) {
        return "dreamina_video_seedance_15";
    }
    return "basic_video_operation_vgfm_v_three";
}

/**
 * Calculate duration in milliseconds and actual seconds based on model
 */
export function resolveVideoDuration(model, requestedDuration) {
    const isVeo3 = model.includes("veo3");
    const isSora2 = model.includes("sora2");
    const is35Pro = model.includes("3.5_pro");
    
    if (isVeo3) {
        return { durationMs: 8000, actualDuration: 8 };
    }
    
    if (isSora2) {
        if (requestedDuration === 12) return { durationMs: 12000, actualDuration: 12 };
        if (requestedDuration === 8) return { durationMs: 8000, actualDuration: 8 };
        return { durationMs: 4000, actualDuration: 4 };
    }
    
    if (is35Pro) {
        if (requestedDuration === 12) return { durationMs: 12000, actualDuration: 12 };
        if (requestedDuration === 10) return { durationMs: 10000, actualDuration: 10 };
        return { durationMs: 5000, actualDuration: 5 };
    }
    
    // Default: 5s or 10s
    return requestedDuration === 10 
        ? { durationMs: 10000, actualDuration: 10 }
        : { durationMs: 5000, actualDuration: 5 };
}

/**
 * Check if model supports resolution parameter
 */
export function supportsResolution(model) {
    // Only video-3.0 and video-3.0-fast support resolution (not pro versions)
    return (model.includes("vgfm_3.0") || model.includes("vgfm_3.0_fast")) && !model.includes("_pro");
}

/**
 * Build payload for video generation
 */
export function buildVideoGeneratePayload({
    userModel,
    prompt,
    ratio = "1:1",
    resolution = "720p",
    duration = 5,
    regionInfo,
    firstFrameImage = null,
    endFrameImage = null
}) {
    // 使用 regionType (CN/US/ASIA) 而不是 regionCode
    const regionType = regionInfo.regionType || REGION_CN;
    const model = getVideoModel(userModel, regionType);
    const isVeo3 = model.includes("veo3");
    const isSora2 = model.includes("sora2");
    const is35Pro = model.includes("3.5_pro");
    const modelSupportsResolution = supportsResolution(model);
    
    const { durationMs, actualDuration } = resolveVideoDuration(model, duration);
    
    const componentId = uuidv4();
    const submitId = uuidv4();
    const originSubmitId = uuidv4();
    
    // Build metrics extra
    const sceneOption = {
        type: "video",
        scene: "BasicVideoGenerateButton",
        ...(modelSupportsResolution ? { resolution: resolution } : {}),
        modelReqKey: model,
        videoDuration: actualDuration,
        reportParams: {
            enterSource: "generate",
            vipSource: "generate",
            extraVipFunctionKey: modelSupportsResolution ? `${model}-${resolution}` : model,
            useVipFunctionDetailsReporterHoc: true,
        },
    };
    
    const metricsExtra = JSON.stringify({
        promptSource: "custom",
        isDefaultSeed: 1,
        originSubmitId: originSubmitId,
        isRegenerate: false,
        enterFrom: "click",
        functionMode: "first_last_frames",
        sceneOptions: JSON.stringify([sceneOption]),
    });
    
    // Build frame images if provided
    const firstFrameObj = firstFrameImage ? {
        format: "",
        height: 0,
        id: uuidv4(),
        image_uri: firstFrameImage,
        name: "",
        platform_type: 1,
        source_from: "upload",
        type: "image",
        uri: firstFrameImage,
        width: 0,
    } : undefined;
    
    const endFrameObj = endFrameImage ? {
        format: "",
        height: 0,
        id: uuidv4(),
        image_uri: endFrameImage,
        name: "",
        platform_type: 1,
        source_from: "upload",
        type: "image",
        uri: endFrameImage,
        width: 0,
    } : undefined;
    
    // Build draft content
    const draftContent = JSON.stringify({
        type: "draft",
        id: uuidv4(),
        min_version: "3.0.5",
        min_features: [],
        is_from_tsn: true,
        version: DRAFT_VERSION,
        main_component_id: componentId,
        component_list: [{
            type: "video_base_component",
            id: componentId,
            min_version: "1.0.0",
            aigc_mode: "workbench",
            metadata: {
                type: "",
                id: uuidv4(),
                created_platform: 3,
                created_platform_version: "",
                created_time_in_ms: Date.now().toString(),
                created_did: ""
            },
            generate_type: "gen_video",
            abilities: {
                type: "",
                id: uuidv4(),
                gen_video: {
                    id: uuidv4(),
                    type: "",
                    text_to_video_params: {
                        type: "",
                        id: uuidv4(),
                        video_gen_inputs: [{
                            type: "",
                            id: uuidv4(),
                            min_version: "3.0.5",
                            prompt: prompt,
                            video_mode: 2,
                            fps: 24,
                            duration_ms: durationMs,
                            ...(modelSupportsResolution ? { resolution: resolution } : {}),
                            first_frame_image: firstFrameObj,
                            end_frame_image: endFrameObj,
                            idip_meta_list: []
                        }],
                        video_aspect_ratio: ratio,
                        seed: Math.floor(Math.random() * 100000000) + 2500000000,
                        model_req_key: model,
                        priority: 0
                    },
                    video_task_extra: metricsExtra,
                }
            },
            process_type: 1
        }],
    });
    
    return {
        payload: {
            extend: {
                root_model: model,
                m_video_commerce_info: {
                    benefit_type: getVideoBenefitType(model),
                    resource_id: "generate_video",
                    resource_id_type: "str",
                    resource_sub_type: "aigc"
                },
                m_video_commerce_info_list: [{
                    benefit_type: getVideoBenefitType(model),
                    resource_id: "generate_video",
                    resource_id_type: "str",
                    resource_sub_type: "aigc"
                }]
            },
            submit_id: submitId,
            metrics_extra: metricsExtra,
            draft_content: draftContent,
            http_common_info: {
                aid: regionInfo.aid
            }
        },
        submitId,
        historyId: null // Will be filled after API response
    };
}

/**
 * Extract video URL from API response item
 */
export function extractVideoUrl(item) {
    // Priority 1: transcoded_video.origin.video_url
    if (item?.video?.transcoded_video?.origin?.video_url) {
        return item.video.transcoded_video.origin.video_url;
    }
    // Priority 2: play_url
    if (item?.video?.play_url) {
        return item.video.play_url;
    }
    // Priority 3: download_url
    if (item?.video?.download_url) {
        return item.video.download_url;
    }
    // Priority 4: url
    if (item?.video?.url) {
        return item.video.url;
    }
    return null;
}
