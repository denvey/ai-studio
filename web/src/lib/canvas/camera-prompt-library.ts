
import { translate } from "@/i18n";
/**
 * Professional cinematography prompt library for the Camera Control panel.
 *
 * Ported from open-storyboard-canvas, simplified for the web project.
 * The output prompt is a comma-joinable fragment appended to the user's
 * generation prompt so the image model treats it as camera direction.
 */

export interface CameraProfile {
    id: string;
    label: string;
    zhName: string;
    shortTag: string;
    profilePrompt: string;
    bodyColor: string;
    accentColor: string;
    useCase: string;
    description: string;
}

export interface LensProfile {
    id: string;
    label: string;
    zhName: string;
    shortTag: string;
    profilePrompt: string;
    lensColor: string;
    ringColor: string;
    useCase: string;
    description: string;
}

export interface CameraControlOptions {
    enabled: boolean;
    camera: string;
    lens: string;
    focalLength: number;
    aperture: number;
}

export const CAMERA_PROFILES: CameraProfile[] = [
    {
        id: "panavision_dxl2",
        label: "Panavision DXL2",
        zhName: translate("shared.canvas.cameraPromptLibrary.panavisionDXL2"),
        shortTag: "Panavision DXL2",
        profilePrompt: "shot on Panavision DXL2 with Panavision DXL color science, large-format Monstro 8K VV sensor, signature organic highlight rolloff, rich filmic texture, premium modern cinema look",
        bodyColor: "#2a2a2a",
        accentColor: "#e2a84f",
        description: translate("shared.canvas.cameraPromptLibrary.premiumHollywoodCinemaCameraWithAn8KLargeFormatSensor"),
        useCase: translate("shared.canvas.cameraPromptLibrary.featureFilmsLuxuryAdvertisingPremiumCommercialProductions"),
    },
    {
        id: "arri_alexa_mini_lf",
        label: "ARRI Alexa Mini LF",
        zhName: translate("shared.canvas.cameraPromptLibrary.aRRIMiniLF"),
        shortTag: "ARRI Alexa Mini LF",
        profilePrompt: "shot on ARRI Alexa Mini LF with ARRI Wide Gamut color science, ALEV III large-format sensor, gorgeous skin-tone rendering, buttery highlight rolloff, industry-standard feature-film look",
        bodyColor: "#3a3a3a",
        accentColor: "#d4d4d4",
        description: translate("shared.canvas.cameraPromptLibrary.anIndustryStandardCinemaCameraRenownedForItsSkinTone"),
        useCase: translate("shared.canvas.cameraPromptLibrary.narrativeFilmsCharacterStoriesBrandAdvertising"),
    },
    {
        id: "red_komodo_6k",
        label: "RED Komodo 6K",
        zhName: translate("shared.canvas.cameraPromptLibrary.rEDKOMODO6K"),
        shortTag: "RED Komodo 6K",
        profilePrompt: "shot on RED Komodo 6K with RED IPP2 color pipeline, Super35 global-shutter sensor, crisp modern digital detail, clean shadows, crisp action-movie look",
        bodyColor: "#8b2b2b",
        accentColor: "#ff3b3b",
        description: translate("shared.canvas.cameraPromptLibrary.compact6KGlobalShutterCameraWithoutRollingShutterDistortionIdeal"),
        useCase: translate("shared.canvas.cameraPromptLibrary.actionFilmsFPVRacingDronesAerialFootage"),
    },
    {
        id: "red_v_raptor_8k",
        label: "RED V-Raptor 8K",
        zhName: "RED V-Raptor 8K",
        shortTag: "RED V-Raptor 8K",
        profilePrompt: "shot on RED V-Raptor 8K VV, RED IPP2 color pipeline, 8K Vista Vision sensor, razor-sharp resolution, vivid yet natural color",
        bodyColor: "#701f1f",
        accentColor: "#ff5555",
        description: translate("shared.canvas.cameraPromptLibrary.rEDSFlagship8KVistaVisionCameraForExceptionalClarity"),
        useCase: translate("shared.canvas.cameraPromptLibrary.scienceFictionBlockbustersHighResolutionVFXScenes"),
    },
    {
        id: "sony_venice_2",
        label: "Sony Venice 2",
        zhName: translate("shared.canvas.cameraPromptLibrary.sonyVENICE2"),
        shortTag: "Sony Venice 2",
        profilePrompt: "shot on Sony Venice 2 with Sony S-Gamut3.Cine / S-Log3, dual native ISO full-frame cinema sensor, clean shadows, highly refined modern color science",
        bodyColor: "#2d3a4d",
        accentColor: "#4d90d0",
        description: translate("shared.canvas.cameraPromptLibrary.fullFrameDualNativeISOWithExcellentLowLightPerformance"),
        useCase: translate("shared.canvas.cameraPromptLibrary.premiumAdvertisingDocumentariesNighttimeDrama"),
    },
    {
        id: "sony_fx6",
        label: "Sony FX6",
        zhName: translate("shared.canvas.cameraPromptLibrary.sonyFX6"),
        shortTag: "Sony FX6",
        profilePrompt: "shot on Sony FX6, Sony Venice-derived color science, full-frame cinema sensor, clean low-light performance, documentary-friendly modern look",
        bodyColor: "#2d2d36",
        accentColor: "#ff9000",
        description: translate("shared.canvas.cameraPromptLibrary.lightweightFullFrameCinemaLineCameraPopularForHandheldDocumentaries"),
        useCase: translate("shared.canvas.cameraPromptLibrary.documentariesSoloInterviewsLightweightNarrativeProductions"),
    },
    {
        id: "blackmagic_ursa_12k",
        label: "Blackmagic URSA 12K",
        zhName: translate("shared.canvas.cameraPromptLibrary.blackmagicURSA12K"),
        shortTag: "Blackmagic URSA 12K",
        profilePrompt: "shot on Blackmagic URSA Cine 12K with Blackmagic Generation 5 color science, Super35 12K sensor, rich filmic tones, indie-cinema aesthetic",
        bodyColor: "#2e2e2e",
        accentColor: "#ffb820",
        description: translate("shared.canvas.cameraPromptLibrary.aFavoriteAmongIndependentFilmmakersOfferingAffordable12KResolution"),
        useCase: translate("shared.canvas.cameraPromptLibrary.independentFilmsMusicVideosExperimentalVisuals"),
    },
    {
        id: "canon_c500_mk2",
        label: "Canon C500 Mk II",
        zhName: translate("shared.canvas.cameraPromptLibrary.canonC500MkII"),
        shortTag: "Canon C500 Mk II",
        profilePrompt: "shot on Canon C500 Mark II with Canon Cinema Gamut, full-frame cinema sensor, warm natural skin tones, premium broadcast and feature-film character",
        bodyColor: "#332a22",
        accentColor: "#e8c070",
        description: translate("shared.canvas.cameraPromptLibrary.broadcastGradeCinemaCameraWithCanonColorScienceAndWarm"),
        useCase: translate("shared.canvas.cameraPromptLibrary.advertisingTelevisionDramaWeddingFilms"),
    },
];

export const LENS_PROFILES: LensProfile[] = [
    {
        id: "arri_signature_prime",
        label: "ARRI Signature Prime",
        zhName: translate("shared.canvas.cameraPromptLibrary.aRRIMasterPrime"),
        shortTag: "ARRI Signature Prime",
        profilePrompt: "ARRI Signature Prime lens, large-format coverage, creamy organic bokeh, gentle contrast, smooth highlight rolloff, soft flattering flares",
        lensColor: "#2a2a2a",
        ringColor: "#c4a060",
        description: translate("shared.canvas.cameraPromptLibrary.premiumLargeFormatPrimeLensWithCreamyBokehAndGentle"),
        useCase: translate("shared.canvas.cameraPromptLibrary.characterStoriesPremiumCommercialProductions"),
    },
    {
        id: "cooke_s7i",
        label: "Cooke S7/i",
        zhName: translate("shared.canvas.cameraPromptLibrary.cookeS7I"),
        shortTag: "Cooke S7/i",
        profilePrompt: "Cooke S7/i lens, legendary \"Cooke Look\", warm color bias, gentle contrast, soft rounded bokeh, classic flattering skin rendering",
        lensColor: "#26231d",
        ringColor: "#d0a060",
        description: translate("shared.canvas.cameraPromptLibrary.theLegendaryCookeLookWarmSlightlyRedTonesWithFlattering"),
        useCase: translate("shared.canvas.cameraPromptLibrary.classicPortraitsPeriodNarratives"),
    },
    {
        id: "zeiss_supreme_prime",
        label: "Zeiss Supreme Prime",
        zhName: translate("shared.canvas.cameraPromptLibrary.zEISSSupremePrime"),
        shortTag: "Zeiss Supreme Prime",
        profilePrompt: "Zeiss Supreme Prime lens, neutral modern color, high micro-contrast, sharp yet refined detail, clean bokeh with subtle cat-eye near edges",
        lensColor: "#1e1e22",
        ringColor: "#4d90d0",
        description: translate("shared.canvas.cameraPromptLibrary.neutralModernColorsWithCrispMicrocontrastThatNeverFeelsHarsh"),
        useCase: translate("shared.canvas.cameraPromptLibrary.technologyAdvertisingContemporaryDrama"),
    },
    {
        id: "canon_sumire_prime",
        label: "Canon Sumire Prime",
        zhName: translate("shared.canvas.cameraPromptLibrary.canonSumirePrime"),
        shortTag: "Canon Sumire Prime",
        profilePrompt: "Canon Sumire Prime lens, soft organic character, warm gentle color rendering, dreamy rounded bokeh, cinematic softness for portraits",
        lensColor: "#2c241c",
        ringColor: "#e0b070",
        description: translate("shared.canvas.cameraPromptLibrary.softDreamySkinTonesWithWarmGentleFocus"),
        useCase: translate("shared.canvas.cameraPromptLibrary.romanceDreamSequencesCharacterCloseUps"),
    },
    {
        id: "anamorphic_cooke",
        label: "Anamorphic (Cooke)",
        zhName: translate("shared.canvas.cameraPromptLibrary.cookeAnamorphic"),
        shortTag: "Cooke Anamorphic",
        profilePrompt: "Cooke anamorphic lens, oval bokeh, horizontal blue streaks for flares, wide cinematic framing, subtle focus roll-off, 2.39:1 anamorphic cinematic feel",
        lensColor: "#1a1a24",
        ringColor: "#6a9ed6",
        description: translate("shared.canvas.cameraPromptLibrary.widescreenAnamorphicLensWithOvalBokehAndHorizontalBlueFlares"),
        useCase: translate("shared.canvas.cameraPromptLibrary.scienceFictionSpaceScenesNightScenes"),
    },
    {
        id: "anamorphic_atlas",
        label: "Anamorphic (Atlas)",
        zhName: translate("shared.canvas.cameraPromptLibrary.atlasOrionAnamorphic"),
        shortTag: "Atlas Orion Anamorphic",
        profilePrompt: "Atlas Orion anamorphic lens, oval bokeh, cyan horizontal flares, modern anamorphic look with clean center and subtle edge blur",
        lensColor: "#1b2228",
        ringColor: "#40c0e0",
        description: translate("shared.canvas.cameraPromptLibrary.modernAnamorphicLensWithCyanFlaresASharpCenterAnd"),
        useCase: translate("shared.canvas.cameraPromptLibrary.musicVideosStylizedAdvertising"),
    },
    {
        id: "vintage_leica_r",
        label: "Vintage Leica R",
        zhName: translate("shared.canvas.cameraPromptLibrary.vintageLeicaR"),
        shortTag: "Vintage Leica R",
        profilePrompt: "vintage Leica R prime lens, rich color saturation, slight glow on highlights, slightly soft edges, nostalgic 1970s-80s cinema character",
        lensColor: "#3a2f1f",
        ringColor: "#d04040",
        description: translate("shared.canvas.cameraPromptLibrary.vintageLensWithGentlyBloomingHighlightsAndANostalgicCharacter"),
        useCase: translate("shared.canvas.cameraPromptLibrary.periodDramaNostalgicMusicVideosArtFilms"),
    },
    {
        id: "macro_100mm",
        label: "Macro 100mm",
        zhName: translate("shared.canvas.cameraPromptLibrary.item100mmMacro"),
        shortTag: "Macro 100mm",
        profilePrompt: "macro 100mm prime lens, extremely shallow depth of field, razor-thin focus plane, smooth creamy bokeh, detail-rich close-up rendering",
        lensColor: "#1f1f1f",
        ringColor: "#60d090",
        description: translate("shared.canvas.cameraPromptLibrary.designedForMacroCloseUpsWithStrikingDetailAndExtremely"),
        useCase: translate("shared.canvas.cameraPromptLibrary.foodAdvertisingJewelryInsectsDetailShots"),
    },
];

export const FOCAL_LENGTHS = [14, 18, 24, 35, 40, 50, 65, 85, 100, 135, 200] as const;
export const APERTURES = [1.2, 1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16] as const;

export const FOCAL_LENGTH_META: Record<number, { zhName: string; description: string; useCase: string }> = {
    14: { zhName: translate("shared.canvas.cameraPromptLibrary.ultraWide"), description: translate("shared.canvas.cameraPromptLibrary.item14mmUltraWideAngleWithDramaticallyExpandedSpace"), useCase: translate("shared.canvas.cameraPromptLibrary.architecturalInteriorsPanoramicLandscapesImmersiveViewpoints") },
    18: { zhName: translate("shared.canvas.cameraPromptLibrary.ultraWide"), description: translate("shared.canvas.cameraPromptLibrary.item18mmUltraWideAngleWithStrongSpatialDepth"), useCase: translate("shared.canvas.cameraPromptLibrary.streetPhotographyInteriorsArchitecture") },
    24: { zhName: translate("shared.canvas.cameraPromptLibrary.wideAngle"), description: translate("shared.canvas.cameraPromptLibrary.item24mmWideAngleWithAStrongSenseOfEnvironment"), useCase: translate("shared.canvas.cameraPromptLibrary.landscapesLargeScenesPhotojournalism") },
    35: { zhName: translate("shared.canvas.cameraPromptLibrary.moderateWideAngle"), description: translate("shared.canvas.cameraPromptLibrary.item35mmClassicNarrativeFocalLengthCloseToHumanVision"), useCase: translate("shared.canvas.cameraPromptLibrary.documentaryEnvironmentalPortraitsAndStories") },
    40: { zhName: translate("shared.canvas.cameraPromptLibrary.nearNormal"), description: translate("shared.canvas.cameraPromptLibrary.item40mmNearNormalPerspectiveWithBalancedComposition"), useCase: translate("shared.canvas.cameraPromptLibrary.portraitNarrativesArtFilms") },
    50: { zhName: translate("library.assets.density.standard"), description: translate("shared.canvas.cameraPromptLibrary.item50mmNormalPerspectiveWithNaturalSpatialRendering"), useCase: translate("shared.canvas.cameraPromptLibrary.portraitsEverydayLifeStreetPhotography") },
    65: { zhName: translate("shared.canvas.cameraPromptLibrary.mediumFocalLength"), description: translate("shared.canvas.cameraPromptLibrary.item65mmMediumFocalLengthWithMildCompressionAndFlatteringSkin"), useCase: translate("shared.canvas.cameraPromptLibrary.halfBodyPortraitsDialogueScenes") },
    85: { zhName: translate("shared.canvas.cameraPromptLibrary.shortTelephoto"), description: translate("shared.canvas.cameraPromptLibrary.item85mmClassicPortraitFocalLength"), useCase: translate("shared.canvas.cameraPromptLibrary.portraitCloseUpsWeddings") },
    100: { zhName: translate("shared.canvas.cameraPromptLibrary.telephoto"), description: translate("shared.canvas.cameraPromptLibrary.item100mmTelephotoWithPronouncedBackgroundCompression"), useCase: translate("shared.canvas.cameraPromptLibrary.closeUpsMacroSports") },
    135: { zhName: translate("shared.canvas.cameraPromptLibrary.telephoto"), description: translate("shared.canvas.cameraPromptLibrary.item135mmCinemaTelephoto"), useCase: translate("shared.canvas.cameraPromptLibrary.dramaticCloseUpsStageProductions") },
    200: { zhName: translate("shared.canvas.cameraPromptLibrary.superTelephoto"), description: translate("shared.canvas.cameraPromptLibrary.item200mmSuperTelephotoWithExtremeBackgroundCompression"), useCase: translate("shared.canvas.cameraPromptLibrary.sportsWildlifeDramaticCloseUps") },
};

export const APERTURE_META: Record<number, { zhName: string; description: string; useCase: string }> = {
    1.2: { zhName: translate("shared.canvas.cameraPromptLibrary.veryWideAperture"), description: translate("shared.canvas.cameraPromptLibrary.f12ExtremeBokehWithRazorThinDepthOf"), useCase: translate("shared.canvas.cameraPromptLibrary.dreamyPortraitsBloomingHighlights") },
    1.4: { zhName: translate("shared.canvas.cameraPromptLibrary.wideAperture"), description: translate("shared.canvas.cameraPromptLibrary.f14StrongBokehWithACinematicFeel"), useCase: translate("shared.canvas.cameraPromptLibrary.nightPortraitsLowLight") },
    1.8: { zhName: translate("shared.canvas.cameraPromptLibrary.wideAperture"), description: translate("shared.canvas.cameraPromptLibrary.f18PronouncedBackgroundBlur"), useCase: translate("shared.canvas.cameraPromptLibrary.halfBodyPortraitsLowLightStreetPhotography") },
    2: { zhName: translate("shared.canvas.cameraPromptLibrary.wideAperture"), description: translate("shared.canvas.cameraPromptLibrary.f2SoftBokehWithAmpleSharpness"), useCase: translate("shared.canvas.cameraPromptLibrary.portraitsArtisticEverydayScenes") },
    2.8: { zhName: translate("shared.canvas.cameraPromptLibrary.standardWideAperture"), description: translate("shared.canvas.cameraPromptLibrary.f28ModerateDepthOfFieldWithSoftBokeh"), useCase: translate("shared.canvas.cameraPromptLibrary.groupPortraitsStorytelling") },
    4: { zhName: translate("shared.canvas.cameraPromptLibrary.mediumAperture"), description: translate("shared.canvas.cameraPromptLibrary.f4SharpSubjectsWithMildBackgroundBlur"), useCase: translate("shared.canvas.cameraPromptLibrary.groupPortraitsWeddingsTelevisionDrama") },
    5.6: { zhName: translate("shared.canvas.cameraPromptLibrary.mediumAperture"), description: translate("shared.canvas.cameraPromptLibrary.f56RecognizableBackgroundsWithClearEnvironmentalContext"), useCase: translate("shared.canvas.cameraPromptLibrary.documentaryEverydayScenesVignettes") },
    8: { zhName: translate("shared.canvas.cameraPromptLibrary.smallAperture"), description: translate("shared.canvas.cameraPromptLibrary.f8OpticalSweetSpotWithSharpForegroundsAndBackgrounds"), useCase: translate("shared.canvas.cameraPromptLibrary.landscapesArchitectureWideShots") },
    11: { zhName: translate("shared.canvas.cameraPromptLibrary.smallAperture"), description: translate("shared.canvas.cameraPromptLibrary.f11VeryDeepFocusWithNearlyEverythingSharp"), useCase: translate("shared.canvas.cameraPromptLibrary.largeScenesStagedProductShots") },
    16: { zhName: translate("shared.canvas.cameraPromptLibrary.verySmallAperture"), description: translate("shared.canvas.cameraPromptLibrary.f16StarburstsAroundBrightLightSources"), useCase: translate("shared.canvas.cameraPromptLibrary.daylightLandscapesStarburstEffects") },
};

const CAMERA_PROMPT_TEMPLATE = [
    "the following parameters describe the virtual camera, lens, and exposure used to render this image",
    "they are camera direction, NOT objects to add inside the frame",
    "do not add any physical camera, lens, tripod, viewfinder, or photography equipment into the image",
    "{{cameraProfilePrompt}}, {{lensProfilePrompt}}, {{focalLengthPrompt}}, {{aperturePrompt}}",
    "keep the subjects, scene, and action unchanged — apply these as optical and sensor characteristics only",
    "[camera body: {{cameraBody}} · lens: {{lens}} · focal: {{focalLengthMm}}mm · aperture: f/{{apertureF}}]",
].join(", ");

export function describeFocalLength(mm: number): string {
    if (mm <= 16) return `${mm}mm ultra-wide-angle perspective, strong spatial depth, pronounced edge distortion, immersive wide coverage`;
    if (mm <= 24) return `${mm}mm wide-angle perspective, exaggerated depth, strong foreground/background separation, environment-forward framing`;
    if (mm <= 35) return `${mm}mm slight-wide cinematic perspective, natural environmental context, balanced depth, classic story-telling framing`;
    if (mm <= 50) return `${mm}mm standard/normal perspective, close to natural human eye perspective, neutral spatial compression, flattering portrait framing`;
    if (mm <= 85) return `${mm}mm short-telephoto portrait perspective, mild background compression, flattering facial rendering, subject isolation`;
    if (mm <= 135) return `${mm}mm telephoto perspective, moderate compression, strong subject isolation from background, cinematic close-up`;
    return `${mm}mm long-telephoto perspective, strong background compression, highly isolated subject on compressed flat background, powerful dramatic framing`;
}

export function describeAperture(f: number): string {
    if (f <= 1.4) return `shot wide open at f/${f}, extremely shallow depth of field, strong creamy bokeh, razor-thin focus plane, dreamy background separation`;
    if (f <= 2) return `shot at f/${f}, very shallow depth of field, smooth cinematic bokeh, clear subject-from-background separation`;
    if (f <= 2.8) return `shot at f/${f}, shallow depth of field, soft bokeh, natural subject isolation`;
    if (f <= 4) return `shot at f/${f}, moderate depth of field, gentle falloff, clean background blur without over-smoothing`;
    if (f <= 5.6) return `shot at f/${f}, balanced depth of field, background retains context while subject remains clearly in focus`;
    if (f <= 8) return `shot at f/${f}, wide depth of field, environment and subject both sharp, documentary / landscape style`;
    return `shot at f/${f}, very wide depth of field, extensive sharpness from foreground to background, wide-open environmental feel`;
}

function applyTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(", ");
}

export interface CameraPromptInput {
    cameraId: string;
    lensId: string;
    focalLengthMm: number;
    apertureF: number;
}

export function buildCameraPrompt(input: CameraPromptInput): string {
    // 镜头参数会进入图片生成写路径，未知枚举不能静默退回首项，否则持久化配置与实际生成语义会不一致。
    const camera = CAMERA_PROFILES.find((item) => item.id === input.cameraId);
    if (!camera) throw new Error(translate("shared.canvas.cameraPromptLibrary.unsupportedCameraConfiguration", { v0: String(input.cameraId) }));
    const lens = LENS_PROFILES.find((item) => item.id === input.lensId);
    if (!lens) throw new Error(translate("shared.canvas.cameraPromptLibrary.unsupportedLensConfiguration", { v0: String(input.lensId) }));
    if (!FOCAL_LENGTHS.includes(input.focalLengthMm as (typeof FOCAL_LENGTHS)[number])) throw new Error(translate("shared.canvas.cameraPromptLibrary.unsupportedFocalLengthMm", { v0: String(input.focalLengthMm) }));
    if (!APERTURES.includes(input.apertureF as (typeof APERTURES)[number])) throw new Error(translate("shared.canvas.cameraPromptLibrary.unsupportedApertureF", { v0: String(input.apertureF) }));
    return applyTemplate(CAMERA_PROMPT_TEMPLATE, {
        cameraProfilePrompt: camera.profilePrompt,
        lensProfilePrompt: lens.profilePrompt,
        focalLengthPrompt: describeFocalLength(input.focalLengthMm),
        aperturePrompt: describeAperture(input.apertureF),
        cameraBody: camera.shortTag,
        lens: lens.shortTag,
        focalLengthMm: String(input.focalLengthMm),
        apertureF: String(input.apertureF),
    });
}
