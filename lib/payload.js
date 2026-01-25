import { v4 as uuidv4 } from './uuid.js';
import {
    DRAFT_MIN_VERSION,
    DRAFT_VERSION,
    RESOLUTIONS,
    MODELS
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
