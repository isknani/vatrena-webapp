/* =========================================================================
   1. IMPORTS & DEPENDENCIES
   ========================================================================= */

// إخفاء رسائل الكونسول في الإنتاج (المستخدمون لا يرون أي logs)
if (!import.meta.env.DEV) {
    const noop = () => {};
    console.log  = noop;
    console.warn = noop;
    console.info = noop;
    console.debug = noop;
    // console.error يبقى لتسجيل الأخطاء الحقيقية فقط
}
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { initRenderSystem } from './render-engine.js';
import { SketchShader, SharpenShader } from './shaders-config.js';
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import {
    heightException88,
    heightException110,
    vatrenaCabinets,
    middleVatrenaCabinets,
    receptionCabinets,
    electricalAppliances,
    accessoriesList,
} from './glb-models-data.js';
import { setupScene } from './scene-setup.js';
import { init2DBlueprint } from './blueprint-2d.js';
import {
    createWallMeshStructure,
    rebuildWallGeometry,
    createFloorMesh,
    createCeilingMesh,
    buildCustomWalls,
    createCustomFloorMesh,
    createCustomCeilingMesh
} from './room-builder.js';

/* =========================================================================
   2. GLOBAL VARIABLES & STATE MANAGEMENT
   ========================================================================= */
// استبدل هذا الرابط لاحقاً برابط الـ Endpoint الخاص بك من RunPod
const RUNPOD_ENDPOINT_URL = ""; 
// استبدل هذا بالمفتاح الخاص بك (API Key)
const RUNPOD_API_KEY = "";



// --- Scene Dimensions & State ---
const sizes = { width: window.innerWidth, height: window.innerHeight };
let currentRoomLength = 400;
let currentRoomWidth = 300;
let currentRoomHeight = 280;
let currentRoomPolygon = null;
let snappingAndCollisionEnabled = true;
let isAnimating = false;
let autoRotationEnabled = true;

// --- متغير لتتبع حالة الحركة العمودية ---
let isVerticalMode = false;

// --- Undo System ---
const undoStack = [];
const MAX_UNDO_HISTORY = 20;

// --- Textures State ---
const DEFAULT_FLOOR_CABINET_TEXTURE = 'Kester';
let currentFloorTexturePath = 'texture_vatrena/floor.webp';
let currentWallTexturePath = 'texture_vatrena/wall/Ozigo.webp';
let currentFloorCabinetTexture = DEFAULT_FLOOR_CABINET_TEXTURE;
let currentAttachedCabinetTexture = null;
let currentDoubleAttachedCabinetTexture = null;
let currentCountertopTexture = null;
const loadedTextures = {};

// --- Interaction State ---
let selectedObject = null;
let selectedWall = null;
let floor = null;
let ceiling = null;
let walls = [];
let isDragging = false;
let doubleClickTimeout = null;
let cabinetBeingEdited = null;
let sceneTextScaleEditing = null;
let originalBackgroundTexture = null;
// --- متغيرات نظام السحب الدقيق (الجديدة) ---
const dragPlane = new THREE.Plane();
const dragOffset = new THREE.Vector3();
const intersectionPoint = new THREE.Vector3();



// --- Custom Room Builder State ---
const crbState = {
    points: [],        // [{x, z}] بالمتر
    isComplete: false,
    mouseX: 0,         // موضع المؤشر المقيّد (بالمتر)
    mouseZ: 0,
    snapToStart: false,
    scale: 100,        // بيكسل / متر
    offsetX: 0,        // إزاحة العرض (بيكسل CSS)
    offsetZ: 0,
    canvas: null,
    ctx: null,
    isPanning: false,
    panStartX: 0,
    panStartZ: 0,
    // تجميد اتجاه الحائط عند التركيز على حقل الإدخال
    frozenDir: null,  // { isHorizontal, signX, signZ } | null
    // Named pan handlers stored here so they can be removed and don't accumulate
    _onPanMouseDown: null,
    _onPanMouseMove: null,
    _onPanMouseUp: null,
};

// --- Constants ---
const fixed90DegRotation = THREE.MathUtils.degToRad(90);
const snapTolerance = 0.05;
const CT_DEPTH_M = 0.60;
const CT_THICK_M = 0.03;
const CT_CENTER_Y = 0.87 - (CT_THICK_M / 2);

// --- Tools ---
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./draco_vatrena/'); 
dracoLoader.preload();

loader.setDRACOLoader(dracoLoader);
const textureLoader = new THREE.TextureLoader();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const previousClientPosition = new THREE.Vector2();

/* =========================================================================
   3. DOM ELEMENTS SELECTIONS
   ========================================================================= */

// أضف هذا السطر مع باقي تعريفات الأزرار (Advanced Settings)
const panelDeleteBtn = document.getElementById('panelDeleteBtn');

   // --- Bottom Panel Elements ---
const toggleBottomPanelBtn = document.getElementById('toggle-bottom-panel-btn');
const bottomTogglesContent = document.getElementById('bottom-toggles-content');

   // --- Floating Toolbar Elements ---
const floatingToolbar = document.getElementById('floating-toolbar');
const ftUndoBtn = document.getElementById('ft-undo-btn');
const ftDeleteBtn = document.getElementById('ft-delete-btn');
const ftVerticalBtn = document.getElementById('ft-vertical-btn');
const ftRotateBtn = document.getElementById('ft-rotate-btn');
const ftMirrorBtn = document.getElementById('ft-mirror-btn');
const ftColorBtn = document.getElementById('ft-color-btn');
const ftColorMenu = document.getElementById('ft-color-menu');
if (ftColorBtn && ftColorMenu) {
    ftColorBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // يمنع إغلاق القائمة فوراً
        if (selectedObject?.name === 'scene-text') return; // النص له ألوان ثابتة من لوحة الإضافة
        ftColorMenu.classList.toggle('show');
    });
}

const ftMainToggleBtn = document.getElementById('ft-main-toggle-btn');
if (ftMainToggleBtn) {
    ftMainToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // يمنع إفلات الكابينة المحددة
        floatingToolbar.classList.toggle('expanded');
        
        // تغيير الأيقونة بين (الأدوات) و (علامة الإغلاق)
        const icon = ftMainToggleBtn.querySelector('i');
        if (floatingToolbar.classList.contains('expanded')) {
            icon.className = 'fas fa-times'; 
        } else {
            icon.className = 'fas fa-tools'; 
            if (ftColorMenu) ftColorMenu.classList.remove('show'); // غلق قائمة الألوان إن كانت مفتوحة
        }
    });
}

// إغلاق القائمة عند النقر في أي مكان آخر (تم تحديثه)
window.addEventListener('click', (e) => {
    if (ftColorMenu && ftColorMenu.classList.contains('show')) {
        // إذا كان النقر ليس على زر الألوان والقائمة
        if (!e.target.closest('.color-btn-wrapper')) {
            ftColorMenu.classList.remove('show');
        }
    }
});
// --- Panels & Canvas ---
const canvas = document.querySelector('canvas.webgl');
const setupPanel = document.getElementById('setup-panel');
const webglContainer = document.getElementById('webgl-container');
const controlsPanel = document.querySelector('.controls-panel');
const loadingOverlay = document.getElementById('loading-overlay');
const selectionIndicator = document.getElementById('selection-indicator');
const rotationToggleCheckbox = document.getElementById('rotation-toggle-checkbox');

// --- Main Buttons ---
const startDesignBtn = document.getElementById('start-design-btn');
const customRoomBtn  = document.getElementById('custom-room-btn');
const togglePanelBtn = document.getElementById('toggle-panel-btn');
const saveImageBtn = document.getElementById('saveImageBtn');
const toggleSketchBtn = document.getElementById('toggleSketchBtn');
const snappingToggleCheckbox = document.getElementById('snapping-toggle-checkbox');
const saveDesignBtn = document.getElementById('saveDesignBtn');
const refreshDesignsListBtn = document.getElementById('refreshDesignsListBtn');

// --- Advanced Settings (إعدادات متقدمة) ---
const toggleHandlesBtn = document.getElementById('toggleHandlesBtn');
let handlesVisible = true; // حالة ظهور اليدات الافتراضية
const popupVerticalToggleBtn = document.getElementById('popupVerticalToggleBtn');

// --- Cabinet Dimensions Popup ---
const dimensionsPopup = document.getElementById('dimensions-popup');
const cabinetWidthInput = document.getElementById('cabinet-width');
const cabinetDepthInput = document.getElementById('cabinet-depth');
const cabinetHeightInput = document.getElementById('cabinet-height');
const applyDimensionsBtn = document.getElementById('apply-dimensions');
const cancelDimensionsBtn = document.getElementById('cancel-dimensions');
const sceneTextScalePopup = document.getElementById('scene-text-scale-popup');
const sceneTextScaleInput = document.getElementById('scene-text-scale-input');
const applySceneTextScaleBtn = document.getElementById('apply-scene-text-scale');
const cancelSceneTextScaleBtn = document.getElementById('cancel-scene-text-scale');
const newRoomHeightInput = document.getElementById('new-room-height');

// --- Room Dimensions Popup ---
const editRoomDimensionsBtn = document.getElementById('editRoomDimensionsBtn');
const roomDimensionsPopup = document.getElementById('room-dimensions-popup');
const newRoomLengthInput = document.getElementById('new-room-length');
const newRoomWidthInput = document.getElementById('new-room-width');
const applyRoomDimensionsBtn = document.getElementById('apply-room-dimensions');
const cancelRoomDimensionsBtn = document.getElementById('cancel-room-dimensions');

// --- Texture Buttons Groups ---
const wallColorButtons = document.querySelectorAll('#wall-color-buttons .color-button');
const floorCabinetTextureButtons = document.querySelectorAll('#floor-cabinet-texture-buttons .texture-button');
const attachedCabinetTextureButtons = document.querySelectorAll('#attached-cabinet-texture-buttons .texture-button');
const doubleAttachedCabinetTextureButtons = document.querySelectorAll('#double-attached-cabinet-texture-buttons .texture-button');

// --- Reporting ---
const reportBtn = document.getElementById('reportBtn');
const reportModal = document.getElementById('report-modal');
const closeReportSpan = document.querySelector('.close-report');
const reportBody = document.getElementById('report-body');
const printReportBtn = document.getElementById('printReportBtn');



   /* =========================================================================
   5. THREE.JS SCENE SETUP (مستوردة من الملف المنفصل)
   ========================================================================= */
// نستخرج المتغيرات الجديدة من الدالة (نستخدم canvas المعرّف مسبقاً في القسم 3)
const { 
    scene, 
    camera, 
    renderer, 
    controls, 
    ambientLight, 
    directionalLight,
    originalBackgroundTexture: bgTexture // استخراجها باسم مؤقت لتجنب التضارب
} = setupScene(canvas, sizes);


originalBackgroundTexture = bgTexture;

/* =========================================================================
   6. POST-PROCESSING (COMPOSER)
   ========================================================================= */
let composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const sketchPass = new ShaderPass(SketchShader);
sketchPass.enabled = false;
composer.addPass(sketchPass);

const sharpenPass = new ShaderPass(SharpenShader);
composer.addPass(sharpenPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

function recomputeCanvasSize() {
    const panelVisible = controlsPanel?.classList.contains('show');
    if (panelVisible) {
        sizes.width = window.innerWidth - 280;
    } else {
        sizes.width = window.innerWidth;
    }
    sizes.height = window.innerHeight;
    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();
    renderer.setSize(sizes.width, sizes.height);
    composer.setSize(sizes.width, sizes.height);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    
    
    if (typeof sharpenPass !== 'undefined') sharpenPass.uniforms.resolution.value.set(sizes.width, sizes.height);
    if (typeof sketchPass !== 'undefined') sketchPass.uniforms.resolution.value.set(sizes.width, sizes.height);
}
recomputeCanvasSize();

/* =========================================================================
   7. ASSETS & MATERIALS (DATA)
   ========================================================================= */
const availableTextures = {
    white: { map: 'texture_vatrena/cabinet/white.webp'},
    creem: { map: 'texture_vatrena/cabinet/creem.webp' },
    gri: { map: 'texture_vatrena/cabinet/gri.webp' },
    dark_gri: { map: 'texture_vatrena/cabinet/dark-gri.webp' },
    cappuccino: { map: 'texture_vatrena/cabinet/cappuccino.webp' },
    pistasio: { map: 'texture_vatrena/cabinet/pistasio.webp' },
    sky: { map: 'texture_vatrena/cabinet/sky.webp' },
    Lareks: { map: 'texture_vatrena/cabinet/Lareks.webp' },
    Apple: { map: 'texture_vatrena/cabinet/Apple.webp' },
    zbvqxnaz: { map: 'texture_vatrena/cabinet/zbvqxnaz.webp' },
    Plum: { map: 'texture_vatrena/cabinet/Plum.webp' },
    Ozigo: { map: 'texture_vatrena/cabinet/Ozigo.webp' },
    Nilanilo: { map: 'texture_vatrena/cabinet/Nilanilo.webp' },
    Sonoma: { map: 'texture_vatrena/cabinet/Sonoma.webp' },
    Uludag: { map: 'texture_vatrena/cabinet/Uludag.webp' },
    green: { map: 'texture_vatrena/cabinet/green.webp' },
    Natural: { map: 'texture_vatrena/cabinet/Natural.webp' },
    Rustikal: { map: 'texture_vatrena/cabinet/Rustikal.webp' },
    Monsoon: { map: 'texture_vatrena/cabinet/Monsoon.webp' },
    Alacati: { map: 'texture_vatrena/cabinet/Alacati.webp' },
    Darko: { map: 'texture_vatrena/cabinet/Darko.webp' },
    Light_: { map: 'texture_vatrena/cabinet/Light_.webp' },
    yjlzdmlo: { map: 'texture_vatrena/cabinet/yjlzdmlo.webp' },
    psuvhl: { map: 'texture_vatrena/cabinet/psuvhl.webp' },
    _ikycio: { map: 'texture_vatrena/cabinet/_ikycio.webp' },
    fzvwpjyir: { map: 'texture_vatrena/cabinet/fzvwpjyir.webp' },
    Walnuts: { map: 'texture_vatrena/cabinet/Walnuts.webp' },
    skwtq: { map: 'texture_vatrena/cabinet/skwtq.webp' },
    hekto: { map: 'texture_vatrena/cabinet/hekto.webp' },
    gpdtncafgo: { map: 'texture_vatrena/cabinet/gpdtncafgo.webp' },
    bnjgrt: { map: 'texture_vatrena/cabinet/bnjgrt.webp' },
    djjwazxen: { map: 'texture_vatrena/cabinet/djjwazxen.webp' },
    yccmjv: { map: 'texture_vatrena/cabinet/yccmjv.webp' },
    Caucasian: { map: 'texture_vatrena/cabinet/Caucasian.webp' },
    Zebrano: { map: 'texture_vatrena/cabinet/Zebrano.webp' },
    Phoenix: { map: 'texture_vatrena/cabinet/Phoenix.webp' },
    Navaro: { map: 'texture_vatrena/cabinet/Navaro.webp' },
    Karina: { map: 'texture_vatrena/cabinet/Karina.webp' },
    Artemis: { map: 'texture_vatrena/cabinet/Artemis.webp' },
    Kester: { map: 'texture_vatrena/cabinet/Kester.webp' },
    Pablo: { map: 'texture_vatrena/cabinet/Pablo.webp' },
    neerOak: { map: 'texture_vatrena/cabinet/neerOak.webp' },
    cev: { map: 'texture_vatrena/cabinet/cev.webp' },
    Fabric: { map: 'texture_vatrena/cabinet/Fabric.webp' },
    Fabricdark: { map: 'texture_vatrena/cabinet/Fabricdark.webp' },
    StoneQur: { map: 'texture_vatrena/top/StoneQur.webp', },
    black: { map: 'texture_vatrena/top/black.webp', },
    topgri: { map: 'texture_vatrena/top/topgri.webp', },
    topcreem: { map: 'texture_vatrena/top/topcreem.webp', },
    topzan: { map: 'texture_vatrena/top/topzan.webp', },
    WoodFlor: { map: 'texture_vatrena/top/WoodFlor.webp', },
    
};



/* GLB model catalog: ./glb-models-data.js */

/* =========================================================================
   8. CORE FUNCTIONS: TEXTURES & HELPERS
   ========================================================================= */
function loadTexture(textureName) {
    if (loadedTextures[textureName]) return loadedTextures[textureName];
    const textureData = availableTextures[textureName];
    if (textureData.color) {
        const material = new THREE.MeshStandardMaterial({
            color: textureData.color,
            roughness: textureData.roughness || 0.5,
            metalness: textureData.metalness || 0.0
        });
        loadedTextures[textureName] = material;
        return material;
    } else {
        const material = new THREE.MeshStandardMaterial();
        if (textureData.map) {
            const diffuseTexture = textureLoader.load(textureData.map);
            diffuseTexture.wrapS = THREE.RepeatWrapping;
            diffuseTexture.wrapT = THREE.RepeatWrapping;
            diffuseTexture.encoding = THREE.sRGBEncoding;
            material.map = diffuseTexture;
        }
        if (textureData.normalMap) {
            const normalTexture = textureLoader.load(textureData.normalMap);
            normalTexture.wrapS = THREE.RepeatWrapping;
            normalTexture.wrapT = THREE.RepeatWrapping;
            material.normalMap = normalTexture;
        }
        if (textureData.roughnessMap) {
            const roughnessTexture = textureLoader.load(textureData.roughnessMap);
            roughnessTexture.wrapS = THREE.RepeatWrapping;
            roughnessTexture.wrapT = THREE.RepeatWrapping;
            material.roughnessMap = roughnessTexture;
        }
        material.roughness = textureData.roughness || 0.7;
        material.metalness = textureData.metalness || 0.0;
        loadedTextures[textureName] = material;
        return material;
    }
}

function applyTextureToMaterial(root, matName, textureName) {
    const target = (matName || '').toLowerCase();
    const newMaterial = loadTexture(textureName);
    root.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        let changed = false;
        const newMats = mats.map((m) => {
            if (!m) return m;
            const mName = (m.name || '').toLowerCase();
            if (mName === target || mName.includes(target)) {
                changed = true;
                const clonedMat = newMaterial.clone();
                clonedMat.name = m.name;
                return clonedMat;
            }
            return m;
        });
        if (changed) {
            child.material = Array.isArray(child.material) ? newMats : newMats[0];
        }
    });
}

/** تفريغ موديل بعد التحميل التجريبي فقط (لا يُضاف للمشهد) */
function disposeWarmupGltf(gltf) {
    gltf.scene.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose?.();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
            if (!mat) return;
            Object.keys(mat).forEach((key) => {
                const v = mat[key];
                if (v && typeof v === 'object' && v.isTexture) v.dispose();
            });
            mat.dispose?.();
        });
    });
}

/**
 * تسخين مسار التحميل: أول GLB يفعّل Draco decoder + كاش المتصفح؛
 * خامة Kester تُحمَّل مبكرًا حتى لا يتأخر ظهور اللون على أول كابينة.
 * يُستدعى عند فتح المشهد (وليس عند كل موديل).
 */
function warmUpModelPipeline() {
    try {
        void loadTexture(DEFAULT_FLOOR_CABINET_TEXTURE);
    } catch (_) { /* ignore */ }

    const entry = vatrenaCabinets.find((m) => m.path && m.path !== 'PROCEDURAL_SLAT');
    if (!entry?.path) return;

    const cleanPath = entry.path.split('?')[0];
    const url = 'get_model.php?file=' + encodeURIComponent(cleanPath);

    loader.load(
        url,
        (gltf) => { disposeWarmupGltf(gltf); },
        undefined,
        () => { /* فشل اختياري — لا نوقف التطبيق */ }
    );
}

function changeFloorTexture(texturePath) {
    currentFloorTexturePath = texturePath;
    if (floor && floor.material) {
        const tex = textureLoader.load(texturePath, (t) => {
            t.wrapS = THREE.RepeatWrapping; 
            t.wrapT = THREE.RepeatWrapping;
            
            // دعم الأرضية المخصصة (مضلع) وكذلك الأرضية المستطيلة
            let lengthM, widthM;
            if (floor.userData?.isCustomFloor && floor.userData?.bounds) {
                lengthM = floor.userData.bounds.sizeX;
                widthM  = floor.userData.bounds.sizeZ;
            } else {
                lengthM = currentRoomLength / 100;
                widthM  = currentRoomWidth  / 100;
            }
            const floorDensityFactor = 1.5;
            t.repeat.set(lengthM * floorDensityFactor, widthM * floorDensityFactor); 
            t.encoding = THREE.sRGBEncoding;
        });
        floor.material.map = tex; 
        floor.material.needsUpdate = true;
    }
    // تحديث الكابينات المرتبطة بلون الأرضية
    scene.traverse((object) => {
        if (isCabinet(object) && object.userData.customColorGroup === 'room-floor') {
            applyPathToCabinetMaterial(object, texturePath, 'room-floor');
        }
    });
}

function changeWallTexture(texturePath) {
    currentWallTexturePath = texturePath;
    
    // تحميل الصورة الأساسية مرة واحدة
    textureLoader.load(texturePath, (baseTex) => {
        baseTex.wrapS = THREE.RepeatWrapping; 
        baseTex.wrapT = THREE.RepeatWrapping;
        baseTex.encoding = THREE.sRGBEncoding;
        
        // حساب التكرار العمودي (الارتفاع) - أبقيناه كما هو في كودك
        const repeatY = 6 * (currentRoomHeight / 280); 

        // المرور على كل حائط لضبط التكرار الأفقي الخاص به بناءً على طوله
        walls.forEach(w => {
            // استنساخ الخامة لكل حائط لتجنب تأثير الحوائط على بعضها
            const wallTex = baseTex.clone(); 
            wallTex.needsUpdate = true;

            // w.userData.width هو طول الحائط بالمتر.
            // نضربه في معامل (1.5). يمكنك تكبير هذا الرقم إذا أردت النقشة أصغر، أو تصغيره إذا أردتها أكبر.
            const textureDensityFactor = 1.5; 
            const repeatX = w.userData.width * textureDensityFactor;

            wallTex.repeat.set(repeatX, repeatY);
            w.material.map = wallTex; 
            w.material.needsUpdate = true; 
        });
    });
    
    // تحديث الكابينات المرتبطة بلون الحوائط (باقي كودك الأصلي)
    scene.traverse((object) => {
        if (isCabinet(object) && object.userData.customColorGroup === 'room-wall') {
            applyPathToCabinetMaterial(object, texturePath, 'room-wall');
        }
    });
}

function changeWallColor(color) { walls.forEach(w => w.material.color?.set?.(color)); }

function applyCabinetTexture(object, targetName, textureName) {
    object.traverse((child) => {
        if (child.isMesh && child.material) {
            const oldMaterials = Array.isArray(child.material) ? child.material : [child.material];
            const newMaterial = loadTexture(textureName);
            const newMats = oldMaterials.map(mat => {
                if (!mat) return mat;
                const mName = (mat.name || '').toLowerCase();
                if (mName.includes(targetName)) {
                    // 👇 تم إزالة أسطر الـ dispose من هنا لأنها تدمر الخامات وتمنع التراجع
                    const clonedMat = newMaterial.clone(); 
                    clonedMat.name = mName;
                    if (clonedMat.map) { 
                        clonedMat.map.repeat.set(2, 2); 
                        clonedMat.map.wrapS = THREE.RepeatWrapping; 
                        clonedMat.map.wrapT = THREE.RepeatWrapping; 
                    }
                    return clonedMat;
                }
                return mat;
            });
            child.material = Array.isArray(child.material) ? newMats : newMats[0]; 
            child.material.needsUpdate = true;
        }
    });
}

// دالة لتطبيق خامات الأرضية والحوائط (التي تستخدم مسار الصورة المباشر) على الكابينة
function applyPathToCabinetMaterial(object, texturePath, customGroup = null) {
    const targetMat = cabinetBodyMaterialSlot(object);
    
    // >>> التعديل السحري: قراءة الأبعاد الأصلية للكابينة لمنع تخريب النقشة عند التدوير <<<
    let cabW = 0.6, cabH = 0.8;
    if (object.userData && object.userData.originalDimensions) {
        cabW = object.userData.originalDimensions.width / 100; // العرض الحقيقي الثابت
        cabH = object.userData.originalDimensions.height / 100; // الطول الحقيقي الثابت
    } else {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        cabW = size.x;
        cabH = size.y;
    }

    const newTex = textureLoader.load(texturePath, (t) => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        
        // ضبط التكرار (UWV) بناءً على العرض والطول الحقيقي للعنصر (غير المتأثر بالتدوير)
        if (customGroup === 'room-wall') {
            t.repeat.set(cabW * 1.5, cabH * (6 / 2.8)); 
        } else if (customGroup === 'room-floor') {
            t.repeat.set(cabW * 1.0, cabH * 1.0);
        } else {
            t.repeat.set(2, 2);
        }
        t.encoding = THREE.sRGBEncoding;
    });

    object.traverse((child) => {
        if (child.isMesh && child.material) {
            const oldMaterials = Array.isArray(child.material) ? child.material : [child.material];
            let changed = false;
            const newMats = oldMaterials.map(mat => {
                if (!mat) return mat;
                const mName = (mat.name || '').toLowerCase();
                if (mName.includes(targetMat)) {
                    changed = true;
                    const clonedMat = mat.clone();
                    
                    clonedMat.map = newTex;
                    
                    // ضبط السطوع واللمعان ليطابق الحائط أو الأرضية تماماً
                    if (customGroup === 'room-wall') {
                        clonedMat.color.setHex(0xcccccc); 
                        clonedMat.roughness = 0.9; 
                        clonedMat.metalness = 0.0;
                    } else if (customGroup === 'room-floor') {
                        clonedMat.color.setHex(0xffffff); 
                        clonedMat.roughness = 0.8;
                    }
                    
                    clonedMat.needsUpdate = true;
                    return clonedMat;
                }
                return mat;
            });
            if (changed) child.material = Array.isArray(child.material) ? newMats : newMats[0];
        }
    });
}


function changeAllFloorCabinetsTexture(textureName) { 
    const affected = []; 
    scene.traverse((object) => { 
        // 🌟 شمول الإزارة في عملية البحث وتغيير اللون
        if (isCabinet(object) || object.name === 'baseboard') {
            const group = object.userData.customColorGroup || object.name;
            if (group === 'floor-cabinet' || group === 'pantry-cabinet' || group === 'floor' || group === 'baseboard' ||
                isReceptionCabinetGroup(object)) {
                affected.push(object);
            } 
        }
    }); 
    
    if (affected.length > 0) saveUndoState('groupColor', affected);
    
    currentFloorCabinetTexture = textureName; 
    affected.forEach((object) => {
        applyCabinetTexture(object, cabinetBodyMaterialSlot(object), textureName); 
    });
}


function changeAllAttachedCabinetsTexture(textureName) { 
    const affected = [];
    scene.traverse((object) => { 
        if (isCabinet(object)) {
            const group = object.userData.customColorGroup || object.name;
            if ((group === 'attached-cabinet' || group === 'attached') && !isReceptionCabinetGroup(object)) {
                affected.push(object);
            } 
        }
    }); 
    
    if (affected.length > 0) saveUndoState('groupColor', affected);
    
    currentAttachedCabinetTexture = textureName; 
    affected.forEach((object) => {
        applyCabinetTexture(object, cabinetBodyMaterialSlot(object), textureName); 
    });
}

function changeAllDoubleAttachedCabinetsTexture(textureName) { 
    const affected = [];
    scene.traverse((object) => { 
        if (isCabinet(object)) {
            const group = object.userData.customColorGroup || object.name;
            if (group === 'double-attached-cabinet' || group === 'double') { 
                affected.push(object);
            } 
        }
    }); 
    
    if (affected.length > 0) saveUndoState('groupColor', affected);
    
    currentDoubleAttachedCabinetTexture = textureName; 
    affected.forEach((object) => {
        applyCabinetTexture(object, cabinetBodyMaterialSlot(object), textureName); 
    });
}

function changeAllCountertopsTexture(textureName) {
    const affected = [];
    scene.traverse((object) => {
        if (object.name === 'countertop') {
            affected.push(object);
        }
    });
    
    // شملنا المرمر أيضاً بعملية التراجع!
    if (affected.length > 0) saveUndoState('groupColor', affected);
    
    currentCountertopTexture = textureName;
    affected.forEach((object) => {
        applyTextureToMaterial(object, 'countertop', textureName);
    });
}

function isCabinet(object) {
    return object && (
        object.name === 'floor-cabinet' ||
        object.name === 'attached-cabinet' ||
        object.name === 'pantry-cabinet' ||
        object.name === 'double-attached-cabinet' ||
        object.name === 'appliance' // ⚡ تم إضافة الأجهزة هنا
    );
}

/** رسبشن (static/resption/): نفس خامة ولون الفاترينات الأرضية على مادة ground وليس ملحق up */
function isReceptionCabinetGroup(object) {
    if (!object || object.name !== 'attached-cabinet') return false;
    const p = (object.userData?.modelPath || '').toString().split('?')[0];
    return p.includes('resption/');
}

function cabinetBodyMaterialSlot(object) {
    if (isReceptionCabinetGroup(object)) return 'ground';
    if (object.name.includes('attached') || object.name === 'double-attached-cabinet') return 'up';
    return 'ground';
}

/** علامة حفظ/تراجع لنص المشهد (ليس ملف GLB) */
const SCENE_TEXT_MODEL_PATH = 'SCENE_TEXT_LABEL';

function isSceneLayoutObject(object) {
    return Boolean(object && (isCabinet(object) || object.name === 'scene-text'));
}

function sceneTextFillCss(colorKey) {
    if (colorKey === 'gold') return '#c9a227';
    if (colorKey === 'steel') return '#9aa5b0';
    return '#121212';
}

function sceneTextPbrForColorKey(colorKey) {
    const metal = colorKey === 'steel' ? 0.35 : 0.05;
    const rough = colorKey === 'steel' ? 0.4 : 0.55;
    return {
        color: new THREE.Color(sceneTextFillCss(colorKey)),
        roughness: rough,
        metalness: metal,
    };
}

/** تحديث لون خامة نص المشهد (بدون إعادة بناء الهندسة) + حفظ colorKey للتصدير */
function applySceneTextMaterialColor(group, colorKey) {
    if (!group || group.name !== 'scene-text') return;
    const key = colorKey === 'gold' || colorKey === 'steel' ? colorKey : 'black';
    const { color, roughness, metalness } = sceneTextPbrForColorKey(key);
    group.traverse((ch) => {
        if (ch.isMesh && ch.material && !Array.isArray(ch.material)) {
            ch.material.color.copy(color);
            ch.material.roughness = roughness;
            ch.material.metalness = metalness;
            ch.material.needsUpdate = true;
        }
    });
    if (!group.userData.sceneTextPayload) group.userData.sceneTextPayload = { text: '', colorKey: key };
    else group.userData.sceneTextPayload.colorKey = key;
}

/** عند تحديد نص مشهد: تعبئة حقل النص ومربعات اللون من البيانات المحفوظة */
function syncAddTextPanelFromSelection() {
    const input = document.getElementById('scene-text-input');
    if (!input) return;
    const grp = selectedObject?.name === 'scene-text' ? selectedObject : null;
    if (grp?.userData?.sceneTextPayload) {
        const pl = grp.userData.sceneTextPayload;
        input.value = pl.text != null ? String(pl.text) : '';
        const ck = pl.colorKey === 'gold' || pl.colorKey === 'steel' ? pl.colorKey : 'black';
        document.querySelectorAll('input[name="scene-text-color"]').forEach((inp) => {
            inp.checked = inp.value === ck;
        });
    }
}

const SCENE_TEXT_FONT_URL = `${import.meta.env.BASE_URL}fonts/Cairo-Variable.ttf`;
let sceneTextFontPromise = null;

async function loadSceneTextFont() {
    if (sceneTextFontPromise) return sceneTextFontPromise;
    sceneTextFontPromise = (async () => {
        const res = await fetch(SCENE_TEXT_FONT_URL);
        if (!res.ok) throw new Error(`فشل تحميل خط النص (${res.status})`);
        const buf = await res.arrayBuffer();
        const ttfLoader = new TTFLoader();
        const json = ttfLoader.parse(buf);
        return new Font(json);
    })();
    return sceneTextFontPromise;
}

/** ترتيب الحروف لـ TextGeometry (Three يبني من اليسار؛ العربية نعكس تسلسل الكودات للقراءة المرئية) */
function prepareTextForSceneFont(text) {
    const hasArabic = /[\u0600-\u06FF\u0750-\u077F]/.test(text);
    if (!hasArabic) return text;
    return Array.from(text).reverse().join('');
}

/** نص ثلاثي الأبعاد: بروز الحروف فقط بسمك 2 سم (بدون مستطيل/لوحة) عبر TextGeometry وخط Cairo */
async function createSceneTextGroup(textRaw, colorKey) {
    const text = (textRaw || '').trim().slice(0, 40);
    if (!text) return null;

    const { color: inkColor, roughness: rough, metalness: metal } = sceneTextPbrForColorKey(colorKey);

    let font;
    try {
        font = await loadSceneTextFont();
    } catch (e) {
        console.error(e);
        alert('تعذر تحميل خط النص ثلاثي الأبعاد. تأكد من وجود الملف fonts/Cairo-Variable.ttf في المشروع.');
        return null;
    }

    const shaped = prepareTextForSceneFont(text);
    const TARGET_H = 0.22;
    const TARGET_D = 0.02;
    const curveSegments = 6;

    let measureGeo;
    try {
        measureGeo = new TextGeometry(shaped, {
            font,
            size: 1,
            depth: 0.001,
            curveSegments,
            bevelEnabled: false,
        });
    } catch (e) {
        console.error(e);
        alert('حرف أو أكثر غير مدعوم في خط النص ثلاثي الأبعاد.');
        return null;
    }
    measureGeo.computeBoundingBox();
    const mb = measureGeo.boundingBox;
    const h = mb.max.y - mb.min.y;
    measureGeo.dispose();
    if (h < 1e-6) {
        alert('تعذر إنشاء شكل النص (ارتفاع الصفر). جرّب نصاً آخر أو أحرفاً أخرى.');
        return null;
    }
    const s = TARGET_H / h;
    const depthForExtrude = TARGET_D / s;

    let geo;
    try {
        geo = new TextGeometry(shaped, {
            font,
            size: 1,
            depth: depthForExtrude,
            curveSegments,
            bevelEnabled: false,
        });
    } catch (e) {
        console.error(e);
        return null;
    }
    geo.scale(s, s, s);
    geo.center();

    const mat = new THREE.MeshStandardMaterial({
        color: inkColor,
        roughness: rough,
        metalness: metal,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'scene-text-mesh';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const group = new THREE.Group();
    group.name = 'scene-text';
    group.add(mesh);

    const box = new THREE.Box3().setFromObject(group);
    const lift = -box.min.y;
    mesh.position.y += lift;

    const box2 = new THREE.Box3().setFromObject(group);
    const size = box2.getSize(new THREE.Vector3());
    group.userData.modelPath = SCENE_TEXT_MODEL_PATH;
    group.userData.sceneTextPayload = { text, colorKey };
    group.userData.sceneTextScale = 1;
    group.userData.originalDimensions = {
        width: Math.round(size.x * 100),
        depth: Math.round(size.z * 100),
        height: Math.round(size.y * 100),
    };

    return group;
}

async function addSceneTextFromUI() {
    if (typeof window !== 'undefined' && window.isGuestUser) {
        document.getElementById('guestRestrictedModal').style.display = 'flex';
        return;
    }
    if (!floor) {
        alert('يرجى بدء التصميم وإنشاء المحل أولاً.');
        return;
    }
    const input = document.getElementById('scene-text-input');
    const colorRadio = document.querySelector('input[name="scene-text-color"]:checked');
    const colorKey = (colorRadio && colorRadio.value) || 'black';
    const raw = (input?.value || '').trim();
    if (!raw) {
        alert('يرجى كتابة نص قبل الإضافة.');
        return;
    }
    const group = await createSceneTextGroup(raw, colorKey);
    if (!group) return;
    group.position.set(0, 0.92, 0);
    autoAlignToNearestWall(group, true);
    scene.add(group);
    selectedObject = group;
    selectedWall = null;
    updateDeleteButtonState();
    updateTransformButtonsState();
    updateSelectionIndicator();
    if (typeof updateFloatingToolbarPosition === 'function') {
        updateFloatingToolbarPosition();
    }
}

document.getElementById('scene-text-add-btn')?.addEventListener('click', async () => {
    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (_) { /* ignore */ }
    await addSceneTextFromUI();
});

document.querySelectorAll('input[name="scene-text-color"]').forEach((radio) => {
    radio.addEventListener('change', () => {
        if (selectedObject?.name !== 'scene-text' || !radio.checked) return;
        const newKey = radio.value;
        const prev = selectedObject.userData?.sceneTextPayload?.colorKey || 'black';
        if (prev === newKey) return;
        saveUndoState('sceneTextColor', { ref: selectedObject, previousColorKey: prev });
        applySceneTextMaterialColor(selectedObject, newKey);
    });
});

function getObjectWorldBoundingBox(object) { return new THREE.Box3().setFromObject(object); }
function checkIntersection(a, b) {
    if (!a || !b) return false;
    return getObjectWorldBoundingBox(a).intersectsBox(getObjectWorldBoundingBox(b));
}

function isPointInsidePolygonXZ(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, zi = polygon[i].z;
        const xj = polygon[j].x, zj = polygon[j].z;
        const intersects = ((zi > point.z) !== (zj > point.z)) &&
            (point.x < ((xj - xi) * (point.z - zi)) / ((zj - zi) || 1e-9) + xi);
        if (intersects) inside = !inside;
    }
    return inside;
}

function isBoxInsideCustomRoomPolygon(box, polygon, margin = 0.01) {
    if (!Array.isArray(polygon) || polygon.length < 3) return true;
    const corners = [
        { x: box.min.x + margin, z: box.min.z + margin },
        { x: box.min.x + margin, z: box.max.z - margin },
        { x: box.max.x - margin, z: box.min.z + margin },
        { x: box.max.x - margin, z: box.max.z - margin }
    ];
    return corners.every(corner => isPointInsidePolygonXZ(corner, polygon));
}

function clampObjectInsideCustomRoom(object, desiredPos) {
    if (!object || !Array.isArray(currentRoomPolygon) || currentRoomPolygon.length < 3) return desiredPos;

    const originalPos = object.position.clone();
    const step = 0.01;
    const nextPos = desiredPos.clone();

    const isValidAt = (pos) => {
        object.position.copy(pos);
        object.updateMatrixWorld(true);
        const testBox = getObjectWorldBoundingBox(object);
        return isBoxInsideCustomRoomPolygon(testBox, currentRoomPolygon);
    };

    const clampAxis = (axis, targetValue, fixedValue) => {
        const pos = originalPos.clone();
        pos[axis] = targetValue;
        pos[axis === 'x' ? 'z' : 'x'] = fixedValue;

        if (isValidAt(pos)) return pos[axis];

        const sign = Math.sign(targetValue - originalPos[axis]);
        while (Math.abs(pos[axis] - originalPos[axis]) > 1e-6) {
            pos[axis] -= sign * Math.min(step, Math.abs(pos[axis] - originalPos[axis]));
            if (isValidAt(pos)) return pos[axis];
        }
        return originalPos[axis];
    };

    if (isValidAt(nextPos)) {
        object.position.copy(originalPos);
        object.updateMatrixWorld(true);
        return nextPos;
    }

    // نقيّد كل محور بشكل مستقل، لكن باستخدام نتيجة المحور الأول عند حساب الثاني
    // حتى لا نلغي السلايد الموازي للجدار بسبب اعتمادنا على الإحداثي القديم.
    nextPos.x = clampAxis('x', desiredPos.x, originalPos.z);
    nextPos.z = clampAxis('z', desiredPos.z, nextPos.x);

    // بعد تثبيت Z قد نحتاج إعادة ضبط X مرة أخرى على الوضع النهائي الجديد.
    if (!isValidAt(nextPos)) {
        nextPos.x = clampAxis('x', nextPos.x, nextPos.z);
    }

    // لو كانت الزاوية الداخلية ما تزال تسبب خروجاً بسيطاً، نعيد آخر محور تدريجياً فقط.
    if (!isValidAt(nextPos)) {
        const tryPos = nextPos.clone();
        const dz = tryPos.z - originalPos.z;
        if (Math.abs(dz) > 1e-6) {
            const signZ = Math.sign(dz);
            while (Math.abs(tryPos.z - originalPos.z) > 1e-6) {
                tryPos.z -= signZ * Math.min(step, Math.abs(tryPos.z - originalPos.z));
                if (isValidAt(tryPos)) { nextPos.copy(tryPos); break; }
            }
        }
    }

    // محاولة أخيرة بالعكس: نُبقي Z الجديد ونخفف X فقط، وهذا يفيد عند السحب على حائط رأسي.
    if (!isValidAt(nextPos)) {
        const tryPos = nextPos.clone();
        const dx = tryPos.x - originalPos.x;
        if (Math.abs(dx) > 1e-6) {
            const signX = Math.sign(dx);
            while (Math.abs(tryPos.x - originalPos.x) > 1e-6) {
                tryPos.x -= signX * Math.min(step, Math.abs(tryPos.x - originalPos.x));
                if (isValidAt(tryPos)) { nextPos.copy(tryPos); break; }
            }
        }
    }

    object.position.copy(originalPos);
    object.updateMatrixWorld(true);
    return nextPos;
}


// استبدل دالة applyObjectSnappingAndPreventCollision القديمة بهذه الدالة المعدلة
function applyObjectSnappingAndPreventCollision(object) {
    if (!object) return;

    const isCountertop = (object.name === 'countertop');

    let currentBox = getObjectWorldBoundingBox(object);
    let bottomY = currentBox.min.y;

    if (bottomY < -0.001) {
        object.position.y += (0 - bottomY);
    } 
    else if (!isCountertop && bottomY < snapTolerance) {
        object.position.y -= bottomY;
    }

    object.updateMatrixWorld();

    // 🌟 التعديل الثاني: استثناء الإزارة (baseboard) من التصادم لكي لا تعيق حركة الكابينات
    const snapTargets = scene.children.filter(obj => {
       if (obj === object || obj === floor || obj === ceiling || obj === ambientLight || obj === directionalLight || obj === camera || obj.name === 'baseboard' || (!obj.isMesh && !obj.isGroup) || walls.includes(obj)) {
            return false;
        }
        return true;
    });

    const allCollidables = [...snapTargets, ...walls];
    
    let collisionDetected = false;
    let pushAdjustment = new THREE.Vector3();
    
    allCollidables.forEach(other => {
        if (checkIntersection(object, other)) {
            
            const currentBox = getObjectWorldBoundingBox(object);
            const otherBox = getObjectWorldBoundingBox(other);
            const currentCenter = new THREE.Vector3(); currentBox.getCenter(currentCenter);
            const otherCenter = new THREE.Vector3(); otherBox.getCenter(otherCenter);

            const overlap = new THREE.Vector3(
                Math.max(0, Math.min(currentBox.max.x, otherBox.max.x) - Math.max(currentBox.min.x, otherBox.min.x)),
                Math.max(0, Math.min(currentBox.max.y, otherBox.max.y) - Math.max(currentBox.min.y, otherBox.min.y)),
                Math.max(0, Math.min(currentBox.max.z, otherBox.max.z) - Math.max(currentBox.min.z, otherBox.min.z))
            );

            if (overlap.x > 0 && overlap.y > 0 && overlap.z > 0) {
                collisionDetected = true; 

                if (other.name === 'wall' || walls.includes(other)) {
                    // للجدران: ندفع فقط عمودياً على الحائط كي تبقى الكابينة قادرة على الانزلاق بمحاذاته.
                    const wallAxis = other.userData?.axis;
                    if (wallAxis === 'z') {
                        pushAdjustment.x += (currentCenter.x < otherCenter.x) ? -overlap.x : overlap.x;
                    } else if (wallAxis === 'x') {
                        pushAdjustment.z += (currentCenter.z < otherCenter.z) ? -overlap.z : overlap.z;
                    } else if (overlap.x <= overlap.z) {
                        pushAdjustment.x += (currentCenter.x < otherCenter.x) ? -overlap.x : overlap.x;
                    } else {
                        pushAdjustment.z += (currentCenter.z < otherCenter.z) ? -overlap.z : overlap.z;
                    }
                }
                else if (other.name === 'pantry-cabinet') {
                    if (overlap.x <= overlap.z) {
                        pushAdjustment.x += (currentCenter.x < otherCenter.x) ? -overlap.x : overlap.x;
                    } else {
                        pushAdjustment.z += (currentCenter.z < otherCenter.z) ? -overlap.z : overlap.z;
                    }
                }
                else if (isCountertop && other.name === 'floor-cabinet') {
                    // لا شيء
                }
                else {
                    if (overlap.y <= overlap.x && overlap.y <= overlap.z) {
                        pushAdjustment.y += (currentCenter.y < otherCenter.y) ? -overlap.y : overlap.y;
                    } else if (overlap.x <= overlap.y && overlap.x <= overlap.z) {
                        pushAdjustment.x += (currentCenter.x < otherCenter.x) ? -overlap.x : overlap.x;
                    } else {
                        pushAdjustment.z += (currentCenter.z < otherCenter.z) ? -overlap.z : overlap.z;
                    }
                }
            }
        }
    });
    
    if (collisionDetected) object.position.add(pushAdjustment);
    
    const targetsForSnapping = isCountertop 
        ? [...walls, ...scene.children.filter(o => o.name === 'pantry-cabinet')] 
        : [...snapTargets, ...walls];

    currentBox = getObjectWorldBoundingBox(object);
    const currentSize = new THREE.Vector3(); currentBox.getSize(currentSize);
    const currentCenter = new THREE.Vector3(); currentBox.getCenter(currentCenter);

    const directionsXZ = [
        { dir: new THREE.Vector3(1, 0, 0), axis: 'x' }, { dir: new THREE.Vector3(-1, 0, 0), axis: 'x' },
        { dir: new THREE.Vector3(0, 0, 1), axis: 'z' }, { dir: new THREE.Vector3(0, 0, -1), axis: 'z' }
    ];

    directionsXZ.forEach(({ dir, axis }) => {
        const originOffset = dir.clone().multiply(currentSize.clone().divideScalar(2).addScalar(0.01));
        const origin = currentCenter.clone().add(originOffset);
        raycaster.set(origin, dir);
        const intersects = raycaster.intersectObjects(targetsForSnapping, true);
        for (const intersect of intersects) {
            let obj = intersect.object;
            while (obj.parent && !targetsForSnapping.includes(obj)) obj = obj.parent;
            if (!targetsForSnapping.includes(obj)) continue;
            const intersectedBox = getObjectWorldBoundingBox(obj);
            const delta = intersect.distance;
            if (Math.abs(delta) < snapTolerance) {
                if (axis === 'x') {
                    object.position.x += (dir.x > 0) ? (intersectedBox.min.x - currentBox.max.x) : (intersectedBox.max.x - currentBox.min.x);
                } else {
                    object.position.z += (dir.z > 0) ? (intersectedBox.min.z - currentBox.max.z) : (intersectedBox.max.z - currentBox.min.z);
                }
                break;
            }
        }
    });
}


/** @param {boolean} [forceInitialRotation] لو true: يطبّق الدوران نحو أقرب حائط حتى لو كان العنصر بعيداً (وسط الغرفة)، لأن حد 1.2م كان يترك أول إنزال بدون دوران */
function autoAlignToNearestWall(object, forceInitialRotation = false) {
    if (!autoRotationEnabled || !object || walls.length === 0) return;
    let minDistance = Infinity;
    let closestWall = null;
    const objPos = object.position;
    const activationDistance = 1.2;

    walls.forEach(wall => {
        let dist = Infinity;
        const axis = wall.userData?.axis;
        if (axis === 'z') {
            // حائط عمودي يمتد على محور Z — المسافة تُقاس على X
            dist = Math.abs(objPos.x - wall.position.x);
        } else if (axis === 'x') {
            // حائط أفقي يمتد على محور X — المسافة تُقاس على Z
            dist = Math.abs(objPos.z - wall.position.z);
        } else {
            // احتياطي للجدران القديمة التي لا تحمل axis
            if (Math.abs(wall.position.x) > Math.abs(wall.position.z)) {
                dist = Math.abs(objPos.x - wall.position.x);
            } else {
                dist = Math.abs(objPos.z - wall.position.z);
            }
        }
        if (dist < minDistance) { minDistance = dist; closestWall = wall; }
    });

    if (closestWall && (forceInitialRotation || minDistance < activationDistance)) {
        const axis = closestWall.userData?.axis;
        const inwardNormal = closestWall.userData?.inwardNormal;
        if (inwardNormal && (Math.abs(inwardNormal.x) > 0.5 || Math.abs(inwardNormal.z) > 0.5)) {
            if (Math.abs(inwardNormal.x) >= Math.abs(inwardNormal.z)) {
                object.rotation.y = inwardNormal.x > 0 ? Math.PI / 2 : -Math.PI / 2;
            } else {
                object.rotation.y = inwardNormal.z > 0 ? 0 : Math.PI;
            }
        } else if (axis === 'z') {
            object.rotation.y = closestWall.position.x > 0 ? -Math.PI / 2 : Math.PI / 2;
        } else if (axis === 'x') {
            object.rotation.y = closestWall.position.z > 0 ? Math.PI : 0;
        } else {
            if (Math.abs(closestWall.position.x) > Math.abs(closestWall.position.z)) {
                object.rotation.y = closestWall.position.x > 0 ? -Math.PI / 2 : Math.PI / 2;
            } else {
                object.rotation.y = closestWall.position.z > 0 ? Math.PI : 0;
            }
        }
        // رسبشن (resption): الموديلات مصممة بمحور مختلف عن الفاترينات — +90° حتى يلاصق الظهر الحائط وليس الجانب
        const alignPath = (object.userData?.modelPath || '').toString();
        if (alignPath.includes('resption/')) {
            object.rotation.y += Math.PI / 2;
        }
    }
}

function populateModelList(listElementId, modelsArray) {
    const listElement = document.getElementById(listElementId);
    listElement.innerHTML = '';
    modelsArray.forEach(model => {
        const li = document.createElement('li');
        li.className = 'model-item';
        li.dataset.modelPath = model.path;
        
        // حفظ الارتفاع المخصص إن وجد
        if (model.customY !== undefined) {
            li.dataset.customY = model.customY;
        }

        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = model.thumbnail;
        img.alt = model.name;
        const span = document.createElement('span');
        span.textContent = model.name;
        li.appendChild(img);
        li.appendChild(span);
        listElement.appendChild(li);
        
        const isDoubleAttached = listElementId === 'electricalAppliancesList';
      // تمرير الـ customY عند الضغط مع فحص الزائر
        li.addEventListener('click', () => {
            if (window.isGuestUser) {
                document.getElementById('guestRestrictedModal').style.display = 'flex';
                return;
            }
            addCabinetToScene(model.path, isDoubleAttached, model.customY);
        });
        
    });
}
/* =========================================================================
   9. SCENE CONSTRUCTION FUNCTIONS
   ========================================================================= */
// دالة إنشاء الستربات الخشبية برمجياً (تمنع التمطط)
function createProceduralSlatGeometry(widthCm, heightCm) {
    const widthM = widthCm / 100;
    const heightM = heightCm / 100;
    const slatWidth = 0.01; // 1 سم (بروز)
    const gapWidth = 0.01;  // 1 سم (خسفة)
    const depth = 0.02;     // 2 سم (السمك الكلي)
    const backDepth = 0.01; // 1 سم (سمك الخلفية)

    const shape = new THREE.Shape();
    shape.moveTo(-widthM / 2, 0); 

    let currentX = -widthM / 2;
    const numSlats = Math.floor(widthM / (slatWidth + gapWidth));

    for (let i = 0; i < numSlats; i++) {
        // رسم الخسفة
        shape.lineTo(currentX, 0);
        shape.lineTo(currentX + gapWidth, 0);
        currentX += gapWidth;
        // رسم البروز (السترب)
        shape.lineTo(currentX, depth - backDepth); 
        shape.lineTo(currentX + slatWidth, depth - backDepth); 
        shape.lineTo(currentX + slatWidth, 0); 
        currentX += slatWidth;
    }

    // إغلاق الشكل الهندسي (الظهر)
    shape.lineTo(currentX, 0);
    shape.lineTo(widthM / 2, 0); 
    shape.lineTo(widthM / 2, -backDepth); 
    shape.lineTo(-widthM / 2, -backDepth); 
    shape.lineTo(-widthM / 2, 0); 

    const extrudeSettings = { depth: heightM, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
// تعديل الاتجاه ليصبح عمودي
    geometry.rotateX(-Math.PI / 2); 
    
    // --- هذا هو السطر الجديد لعكس الوجه 180 درجة ليصبح للخارج ---
    geometry.rotateY(Math.PI); 

    geometry.translate(0, 0, 0);
    // ضبط الـ UVs حتى يتناسق الخشب ولا يتمطط
    geometry.computeBoundingBox();
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, pos.getX(i) * 2, pos.getY(i) * 2);
    }
    uv.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
}


function createWallMesh(wallWidth, height, depth, position, rotationY = 0) {
    // نستخدم الملف المنفصل لإنشاء المجسم
    const wall = createWallMeshStructure(wallWidth, height, depth, position, rotationY);
    
    // نضيفه للمشهد وللمصفوفة في الملف الرئيسي
    scene.add(wall);
    walls.push(wall);
    return wall;
}



function createFloorAndWalls(roomLength, roomWidth) {
    const wallHeight = currentRoomHeight / 100;
    const wallDepth = 0.1;
    const halfWallDepth = wallDepth / 2;
    const cmToMeters = (cm) => cm / 100;
    const length = cmToMeters(roomLength);
    const width = cmToMeters(roomWidth);

    // --- 1. تنظيف الأرضية القديمة ---
    if (floor) {
        scene.remove(floor);
        floor.geometry.dispose();
        floor.material.dispose();
        floor = null;
    }

    // --- 2. تنظيف السقف القديم ---
    if (typeof ceiling !== 'undefined' && ceiling) {
        scene.remove(ceiling);
        ceiling.geometry.dispose();
        ceiling.material.dispose();
        ceiling = null;
    }

    // --- 3. تنظيف الجدران القديمة ---
    walls.forEach(w => {
        scene.remove(w);
        w.geometry.dispose();
        if (Array.isArray(w.material)) w.material.forEach(m => m?.dispose?.());
        else w.material?.dispose?.();
    });
    walls = [];
    selectedWall = null;
    currentRoomPolygon = null;

    // --- 4. إنشاء الأرضية (من الملف المنفصل) ---
    floor = createFloorMesh(length, width, textureLoader, 'texture_vatrena/floor.webp', renderer);
    scene.add(floor);

    // --- 5. إنشاء السقف السحري (من الملف المنفصل) ---
    ceiling = createCeilingMesh(length, width, wallHeight);
    scene.add(ceiling);

    // --- 6. إنشاء الجدران (محل: عمق = جداران متقابلان، عرض = جدار خلفي واحد، واجهة مفتوحة) ---
    // roomLength → length (محور X)، roomWidth → width (محور Z). الرسم المخصص لا يتأثر.
    // inwardNormal: اتجاه نحو داخل الغرفة (للتوافق مع الغرفة المضلعة ودوران الرسبشن/الفاترينات)
    if (length >= width) {
        // طول المحل ≥ عرضه: جداران على ±Z (كل واحد طوله length = العمق)، جدار خلف واحد على −X، فتحة نحو +X
        createWallMesh(length + wallDepth, wallHeight, wallDepth, new THREE.Vector3(0, 0, -width / 2 - halfWallDepth), 0);
        walls[walls.length - 1].userData.inwardNormal = { x: 0, z: 1 };
        createWallMesh(length + wallDepth, wallHeight, wallDepth, new THREE.Vector3(0, 0, width / 2 + halfWallDepth), 0);
        walls[walls.length - 1].userData.inwardNormal = { x: 0, z: -1 };
        createWallMesh(width + wallDepth, wallHeight, wallDepth, new THREE.Vector3(-length / 2 - halfWallDepth, 0, 0), Math.PI / 2);
        walls[walls.length - 1].userData.inwardNormal = { x: 1, z: 0 };
    } else {
        // العرض أكبر من الطول: جداران على ±X (طول كل منهما width)، جدار خلف على −Z، فتحة نحو +Z
        createWallMesh(width + wallDepth, wallHeight, wallDepth, new THREE.Vector3(length / 2 + halfWallDepth, 0, 0), Math.PI / 2);
        walls[walls.length - 1].userData.inwardNormal = { x: -1, z: 0 };
        createWallMesh(width + wallDepth, wallHeight, wallDepth, new THREE.Vector3(-length / 2 - halfWallDepth, 0, 0), Math.PI / 2);
        walls[walls.length - 1].userData.inwardNormal = { x: 1, z: 0 };
        createWallMesh(length + wallDepth, wallHeight, wallDepth, new THREE.Vector3(0, 0, -width / 2 - halfWallDepth), 0);
        walls[walls.length - 1].userData.inwardNormal = { x: 0, z: 1 };
    }

    if (currentWallTexturePath) {
        changeWallTexture(currentWallTexturePath);
    }

    // --- 7. ضبط الكاميرا ---
    const bbox = new THREE.Box3().setFromObject(scene);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fovRad = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fovRad / 2)) * 1.5;
    camera.position.set(center.x + cameraZ * 0.6, center.y + cameraZ * 0.45, center.z + cameraZ);
    camera.far = camera.position.distanceTo(center) + maxDim * 2.0;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
}

function addCabinetToScene(modelPath, isDoubleAttached = false, customY = null) {
    // --- كود الستربات البرمجية ---
    if (modelPath === 'PROCEDURAL_SLAT') {
        const geometry = createProceduralSlatGeometry(100, 100);
        // نعطيها اسم ground حتى تأخذ لون الكابينات الأرضية تلقائياً
        const material = new THREE.MeshStandardMaterial({ name: 'ground', color: 0xcccccc });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true; mesh.receiveShadow = true;

        const group = new THREE.Group();
        group.add(mesh);
        group.position.set(0, 0, 0); // الارتفاع صفر
        group.name = 'floor-cabinet';
        group.userData.modelPath = 'PROCEDURAL_SLAT';
        group.userData.originalDimensions = { width: 100, depth: 2, height: 100 };

        // تطبيق اللون الحالي للأرضيات إذا كان مختار مسبقاً
        if (currentFloorCabinetTexture) {
            applyTextureToMaterial(group, 'ground', currentFloorCabinetTexture);
        }

        autoAlignToNearestWall(group, true);
        scene.add(group);

        selectedObject = group;
        selectedWall = null;
        updateDeleteButtonState();
        updateTransformButtonsState();
        updateSelectionIndicator();
        return; // نوقف الكود هنا حتى ما ينزل يكمل ويكراش
    }
    // --- نهاية كود الستربات ---
   // توجيه الطلب لملف الحماية بدلاً من المسار المباشر
    // فصل المسار عن متغيرات الكاش (مثل ?v=2)
const [cleanPath, queryParams] = modelPath.split('?');
let secureModelUrl = 'get_model.php?file=' + encodeURIComponent(cleanPath);

// إعادة إضافة متغير الكاش للرابط الخارجي حتى يتحدث الموديل عند المستخدم
if (queryParams) {
    secureModelUrl += '&' + queryParams;
}

    loader.load(
        secureModelUrl,
        (gltf) => {
            const newModel = gltf.scene;
            newModel.traverse((node) => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                    }
                });
            const isAttached = modelPath.includes('resption/');
            // موديلات الرسبشن: قلب الـ mesh 180° حول Y قبل التوسيط ثم نفس autoAlign للفاترينات (علم للحفظ/التحميل)
            if (isAttached) {
                newModel.rotation.y = Math.PI;
            }
            const box = new THREE.Box3().setFromObject(newModel);
            const center = box.getCenter(new THREE.Vector3());
            const group = new THREE.Group();
            group.add(newModel);
            newModel.position.set(-center.x, -box.min.y, -center.z);
            const isPantry = modelPath.includes('larder/');
            const isAppliance = modelPath.includes('appliances/');
            
           let cabinetY = 0;
            // الشرط الجديد: إذا كان للعنصر ارتفاع مخصص نستخدمه مباشرة
            if (customY !== null && customY !== undefined) {
                cabinetY = customY;
            } else if (isDoubleAttached) { 
                cabinetY = 2.22; 
            } else if (isAttached) {
                // رسبشن (resption/): على الأرض مثل الفاترينات الأرضية، لا على ارتفاع 1.5م
                cabinetY = 0;
            } else if (isPantry) { 
                cabinetY = 0; 
            } else {
                const isException88 = heightException88.some(path => modelPath.includes(path));
                const isException110 = heightException110.some(path => modelPath.includes(path));
                if (isException88) cabinetY = 0.88;
                else if (isException110) cabinetY = 1.10;
            }
            group.position.set(0, cabinetY, 0);

           if (isDoubleAttached) { 
                group.name = 'double-attached-cabinet'; 
            } else if (isAppliance) {
                group.name = 'appliance'; // ⚡ تسمية خاصة للأجهزة
            } else { 
                group.name = isAttached ? 'attached-cabinet' : (isPantry ? 'pantry-cabinet' : 'floor-cabinet'); 
            }
            const size = box.getSize(new THREE.Vector3());
            group.userData.originalDimensions = { width: Math.round(size.x * 100), depth: Math.round(size.z * 100), height: Math.round(size.y * 100) };
            group.userData.modelPath = modelPath;
            if (isAttached) {
                group.userData.receptionMeshYawPI = true;
            }
            if (isDoubleAttached && currentDoubleAttachedCabinetTexture) { applyTextureToMaterial(group, 'up', currentDoubleAttachedCabinetTexture); }
            else if (isAttached && currentFloorCabinetTexture) { applyTextureToMaterial(group, 'ground', currentFloorCabinetTexture); }
            else if ((group.name === 'floor-cabinet' || group.name === 'pantry-cabinet') && currentFloorCabinetTexture) { applyTextureToMaterial(group, 'ground', currentFloorCabinetTexture); }
            autoAlignToNearestWall(group, true);
            
            scene.add(group);

            selectedObject = group; selectedWall = null;
            updateDeleteButtonState(); updateTransformButtonsState(); updateSelectionIndicator();
        },
        undefined,
        (error) => console.error('Error loading GLTF model:', error)
    );
}

function addCountertopStraight(widthCm) {
    const w = widthCm / 100; 
    const geom = new THREE.BoxGeometry(w, CT_THICK_M, CT_DEPTH_M);
    applyPlanarUVs(geom); // 🌟 تطبيق الـ UV
    const material = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, metalness: 0.0 });
    material.name = 'countertop';
    const mesh = new THREE.Mesh(geom, material); 
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.customUV = true; // 🌟 حماية من المط
    const group = new THREE.Group(); 
    group.add(mesh); 
    group.position.set(0, CT_CENTER_Y, 0); 
    group.name = 'countertop';
    if (currentCountertopTexture) { applyTextureToMaterial(group, 'countertop', currentCountertopTexture); }
    group.userData.countertopType = 'straight';
    group.userData.countertopW = w;
    return group;
}

function addCountertopL(lenXcm, lenZcm) {
    const lenX = lenXcm / 100; const lenZ = lenZcm / 100;
    const materialX = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, metalness: 0.0 }); materialX.name = 'countertop';
    const materialZ = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, metalness: 0.0 }); materialZ.name = 'countertop';
    
    const geomX = new THREE.BoxGeometry(lenX, CT_THICK_M, CT_DEPTH_M);
    applyPlanarUVs(geomX); // 🌟 تطبيق الـ UV
    const barX = new THREE.Mesh(geomX, materialX);
    barX.castShadow = barX.receiveShadow = true;
    barX.userData.customUV = true; // 🌟 حماية من المط
    
    const geomZ = new THREE.BoxGeometry(CT_DEPTH_M, CT_THICK_M, lenZ);
    applyPlanarUVs(geomZ); // 🌟 تطبيق الـ UV
    const barZ = new THREE.Mesh(geomZ, materialZ);
    barZ.castShadow = barZ.receiveShadow = true;
    barZ.userData.customUV = true; // 🌟 حماية من المط
    
    barX.position.set((lenX / 2) - (CT_DEPTH_M / 2), 0, 0); 
    barZ.position.set(0, 0, (lenZ / 2) - (CT_DEPTH_M / 2));
    
    const group = new THREE.Group(); 
    group.add(barX, barZ); 
    group.position.set(0, CT_CENTER_Y, 0); 
    group.name = 'countertop';
    if (currentCountertopTexture) { applyTextureToMaterial(group, 'countertop', currentCountertopTexture); }
    group.userData.countertopType = 'L';
    group.userData.countertopX = lenX;
    group.userData.countertopZ = lenZ;
    return group;
}

/* =========================================================================
   10. INTERACTION FUNCTIONS (MOUSE, DRAG, EVENTS)
   ========================================================================= */
function handlePressDown(clientX, clientY) {
    // 1. حساب إحداثيات الماوس وتجهيز الشعاع (Raycaster)
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / sizes.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / sizes.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), camera);

    // 2. تحديد العناصر القابلة للنقر (تجاهل الأرضية)
    const selectable = scene.children.filter(obj => obj !== floor && obj !== ceiling && (obj.name === 'wall' || obj.isGroup || obj.isMesh));
    const intersects = raycaster.intersectObjects(selectable, true);

    // 3. إعادة تعيين إضاءة الجدران (إلغاء التحديد السابق للجدار)
    walls.forEach(w => {
        if (w.material.emissive) {
            w.material.emissive.setHex(0x000000);
        }
    });

    // 4. معالجة التقاطعات
    if (intersects.length > 0) {
        // الوصول إلى الكائن الرئيسي (Group) بدلاً من الـ Mesh الفرعي
        let obj = intersects[0].object;
        while (obj.parent && obj.parent !== scene) obj = obj.parent;

        if (obj.name === 'wall') {
            // --- حالة اختيار جدار ---
            selectedWall = obj;
            selectedObject = null;
            
            // >>> تعديل: إخفاء الشريط العائم <<<
            if (typeof floatingToolbar !== 'undefined' && floatingToolbar) {
                floatingToolbar.style.display = 'none';
                floatingToolbar.classList.remove('expanded');
                if (ftMainToggleBtn) ftMainToggleBtn.querySelector('i').className = 'fas fa-tools';
                if (typeof ftColorMenu !== 'undefined' && ftColorMenu) ftColorMenu.classList.remove('show'); 
            }
            
            // تمييز الجدار بلون
            if (!obj.material.emissive) obj.material.emissive = new THREE.Color(0x000000);
            obj.material.emissive.setHex(0x333333);
            
            controls.enabled = true;
            isDragging = false;

            // >>> تعديل: إخفاء الشريط العائم عند اختيار جدار <<<
            if (typeof floatingToolbar !== 'undefined' && floatingToolbar) {
                floatingToolbar.style.display = 'none';
            }

        } else {
            // --- حالة اختيار كابينة أو عنصر آخر ---
            
            // منطق النقر المزدوج (Double Click) — كابينة: أبعاد | نص مشهد: حجم
            if (selectedObject === obj && (isCabinet(obj) || obj.name === 'scene-text')) {
                if (doubleClickTimeout) {
                    clearTimeout(doubleClickTimeout);
                    doubleClickTimeout = null;
                    if (obj.name === 'scene-text') {
                        showSceneTextScalePopup(obj);
                    } else {
                        showDimensionsPopup(obj);
                    }
                    return;
                } else {
                    doubleClickTimeout = setTimeout(() => {
                        doubleClickTimeout = null;
                    }, 300);
                }
            }

            selectedWall = null;
            selectedObject = obj;
            
            // حفظ الموقع الأصلي قبل بدء السحب
            obj.userData.previousPosition = obj.position.clone();
            
            controls.enabled = false; // تعطيل تحكم الكاميرا أثناء السحب
            isDragging = true;
            previousClientPosition.set(clientX, clientY);

            // ==========================================
            // التعديل الجديد: حساب نقطة الإمساك الدقيقة 100%
            // ==========================================
            if (intersects.length > 0) {
                if (isVerticalMode) {
                    // في حالة الحركة العمودية، نصنع مستوى مواجه للكاميرا
                    const cameraDirection = new THREE.Vector3();
                    camera.getWorldDirection(cameraDirection);
                    dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, intersects[0].point);
                } else {
                    // في الحركة الأفقية، نصنع مستوى يوازي الأرض (مواجه للأعلى Y)
                    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), intersects[0].point);
                }
                // حساب الفارق بين نقطة النقر ومركز العنصر
                dragOffset.copy(intersects[0].point).sub(selectedObject.position);
            }
            // ==========================================

            // >>> تعديل: إظهار الشريط العائم وتحديثه <<<
            if (typeof floatingToolbar !== 'undefined' && floatingToolbar) {
                // نظهر الشريط للكابينات والنصوص والأسطح
                if (isSceneLayoutObject(obj) || obj.name === 'countertop') {
                    floatingToolbar.style.display = 'flex'; 
                    floatingToolbar.classList.remove('expanded'); // يبدأ الزر وهو مغلق (أيقونة فقط)
                    if (ftMainToggleBtn) ftMainToggleBtn.querySelector('i').className = 'fas fa-tools';
                    
                    // تحديث حالة زر الحركة العمودية في الشريط ليتطابق مع الوضع الحالي
                    if (typeof ftVerticalBtn !== 'undefined' && ftVerticalBtn) {
                        if (isVerticalMode) ftVerticalBtn.classList.add('active');
                        else ftVerticalBtn.classList.remove('active');
                    }
                    
                    // تحديث موقع الشريط فوراً لكي لا يظهر في مكان خاطئ للحظة الأولى
                    if (typeof updateFloatingToolbarPosition === 'function') {
                        updateFloatingToolbarPosition();
                    }
                } else {
                    floatingToolbar.style.display = 'none';
                }
            }
        }
    } else {
        // --- حالة النقر في الفراغ (إلغاء التحديد) ---
        selectedWall = null;
        selectedObject = null;
        controls.enabled = true;
        isDragging = false;

        // >>> تعديل: إخفاء الشريط العائم <<<
        if (typeof floatingToolbar !== 'undefined' && floatingToolbar) {
            floatingToolbar.style.display = 'none';
        }
    }

    // 5. تحديث واجهة المستخدم (الأزرار الجانبية ومؤشر التحديد)
    updateTransformButtonsState();
    updateDeleteButtonState();
    updateSelectionIndicator();
}

// دالة لتحديث حالة وشكل أزرار الحركة العمودية (الجانبي والمنبثق)
function updateAllVerticalButtonsUI(isActive) {
    isVerticalMode = isActive;
    const color = isActive ? '#4CAF50' : '#607d8b';
    const htmlContent = isActive ? 
        '<i class="fas fa-check"></i> حركة عمودية (مفعل)' : 
        '<i class="fas fa-arrows-alt-v"></i> تفعيل الحركة العمودية';

    // تحديث الزر داخل النافذة المنبثقة
    if (popupVerticalToggleBtn) {
        popupVerticalToggleBtn.style.backgroundColor = color;
        popupVerticalToggleBtn.innerHTML = htmlContent;
    }
    if (ftVerticalBtn) {
        if (isActive) ftVerticalBtn.classList.add('active');
        else ftVerticalBtn.classList.remove('active');
    }
}

function handleMove(clientX, clientY) {
    if (isDragging && selectedObject) {
        // تحديث إحداثيات الماوس لإطلاق الشعاع
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((clientX - rect.left) / sizes.width) * 2 - 1;
        mouse.y = -((clientY - rect.top) / sizes.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);

        if (raycaster.ray.intersectPlane(dragPlane, intersectionPoint)) {
            
            const targetPos = intersectionPoint.clone().sub(dragOffset);
            const startPos = selectedObject.position.clone();

            if (isVerticalMode) {
                // --- الحركة العمودية ---
                targetPos.x = startPos.x;
                targetPos.z = startPos.z;
                selectedObject.position.copy(targetPos);
                
                // تطبيق التصادم إذا كان الزر مفعلاً
                if (snappingAndCollisionEnabled) {
                    selectedObject.updateMatrixWorld(true);
                    applyObjectSnappingAndPreventCollision(selectedObject);
                }
            } else {
                // --- الحركة الأفقية ---
                targetPos.y = startPos.y;

                // التحقق من حالة زر التصادم والالتصاق
                if (snappingAndCollisionEnabled) {
                    // 1. حساب الحجم الفعلي للعنصر لمعرفة حدوده
                    const box = new THREE.Box3().setFromObject(selectedObject);
                    const size = new THREE.Vector3();
                    box.getSize(size);
                    const objHalfX = size.x / 2;
                    const objHalfZ = size.z / 2;

                    // 2. تقييد العنصر داخل حدود الغرفة رياضياً (صلابة الحوائط)
                    const roomHalfLength = currentRoomLength / 200; 
                    const roomHalfWidth = currentRoomWidth / 200;   

                    if (currentRoomPolygon && currentRoomPolygon.length >= 3) {
                        targetPos.copy(clampObjectInsideCustomRoom(selectedObject, targetPos));
                    } else {
                        targetPos.x = Math.max(-roomHalfLength + objHalfX, Math.min(roomHalfLength - objHalfX, targetPos.x));
                        targetPos.z = Math.max(-roomHalfWidth + objHalfZ, Math.min(roomHalfWidth - objHalfZ, targetPos.z));
                    }

                    // 3. تطبيق الموقع الجديد
                    selectedObject.position.copy(targetPos);
                    
                    // 4. الدوران التلقائي نحو أقرب حائط
                    autoAlignToNearestWall(selectedObject);

                    // 5. تطبيق التصادم والمحاذاة (سناب) النهائي
                    selectedObject.updateMatrixWorld(true);
                    applyObjectSnappingAndPreventCollision(selectedObject);
                } else {
                    // ==========================================
                    // الحركة الحرة (عند إطفاء زر التصادم)
                    // ==========================================
                    // العنصر يتحرك بحرية تامة ويخترق الحوائط ولا يدور تلقائياً
                    selectedObject.position.copy(targetPos);
                }
            }
        }

        previousClientPosition.set(clientX, clientY);
    }
}
function handlePressUp() { 
    // إذا كان هناك كائن محدد وتم تحريكه، احفظ الحالة
    if (isDragging && selectedObject && selectedObject.userData.previousPosition) {
        const moved = !selectedObject.position.equals(selectedObject.userData.previousPosition);
        if (moved) {
            saveUndoState('move', selectedObject);
        }
    }
    
    isDragging = false; 
    controls.enabled = true; 
}

function mirrorSelectedObject() { if (selectedObject) { selectedObject.scale.x *= -1; } }

function updateDeleteButtonState() { 
    if (panelDeleteBtn) {
        // التحقق مما إذا كان هناك عنصر أو جدار محدد
        const isSelected = selectedObject !== null || selectedWall !== null;
        
        panelDeleteBtn.disabled = !isSelected;
        
        // تغيير مظهر الزر بناءً على الحالة
        if (isSelected) {
            panelDeleteBtn.style.opacity = '1';
            panelDeleteBtn.style.cursor = 'pointer';
            panelDeleteBtn.style.backgroundColor = '#f44336'; // أحمر فاتح للحذف
        } else {
            panelDeleteBtn.style.opacity = '0.5';
            panelDeleteBtn.style.cursor = 'not-allowed';
            panelDeleteBtn.style.backgroundColor = '#9e9e9e'; // رمادي عند التعطيل
        }
    }
}


function updateTransformButtonsState() {
    const isDisabled = !selectedObject;
    
    // التعامل مع زر الحركة العمودية المنبثق فقط
    if (popupVerticalToggleBtn) popupVerticalToggleBtn.disabled = isDisabled;

    // إذا تم إلغاء التحديد، نعيد الوضع إلى الطبيعي
    if (isDisabled) {
        updateAllVerticalButtonsUI(false);
    }
}

function updateSelectionIndicator() {
    // إخفاء الرسالة دائماً 
    if (selectionIndicator) {
        selectionIndicator.style.display = 'none';
    }
    syncAddTextPanelFromSelection();
}

// دالة مساعدة لمعرفة هل الجهاز موبايل أم كمبيوتر
// دالة مساعدة لمعرفة هل الجهاز موبايل/تابلت (تدعم حتى الآيباد برو الحديث)
function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function dataURLtoFile(dataurl, filename) {
    let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){ u8arr[n] = bstr.charCodeAt(n); }
    return new File([u8arr], filename, {type:mime});
}

// الدالة الذكية الموحدة لحفظ الصورة (تحل مشكلة أجهزة آبل تماماً)
// الدالة الذكية الموحدة لحفظ الصورة 
async function smartSaveImage(dataURL, fileName, title) {
    // 1. دعم تطبيق فلاتر (مستقبلاً)
    if (window.FlutterSaveImage) {
        console.log('إرسال الصورة إلى تطبيق فلاتر للحفظ...');
        window.FlutterSaveImage.postMessage(JSON.stringify({
            image: dataURL,
            filename: fileName
        }));
        return;
    }

    let file;
    try {
        const res = await fetch(dataURL);
        const blob = await res.blob();
        file = new File([blob], fileName, { type: 'image/png' });
    } catch (e) {
        file = dataURLtoFile(dataURL, fileName);
    }

    const isAppleDevice = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // 2. حصرياً لأجهزة آبل (آيفون/آيباد) لأنها تحتاج نافذة المشاركة
    if (isAppleDevice && isMobileDevice()) {
        if (navigator.share) {
            try {
                await navigator.share({ files: [file], title: title });
                return;
            } catch (error) {
                console.log('تم إلغاء المشاركة أو فشلها:', error);
                if (error.name === 'AbortError') return; 
            }
        }
        // خطة طوارئ آبل
        showAppleFallbackOverlay(dataURL);
        return;
    }

    // 3. أجهزة الأندرويد والحاسوب (تحميل مباشر صامت ومريح للاستوديو/التنزيلات)
    const link = document.createElement('a');
    link.download = fileName;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showAppleFallbackOverlay(dataURL) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:999999;display:flex;flex-direction:column;justify-content:center;align-items:center;';
    const msg = document.createElement('p');
    msg.innerHTML = '<i class="fas fa-info-circle"></i> لسبب أمني في جهازك، اضغط مطولاً على الصورة ثم اختر <b>"حفظ في الصور" (Save Image)</b>';
    msg.style.cssText = 'color:#fff;font-size:18px;margin-bottom:20px;font-family:Cairo,sans-serif;text-align:center;padding:0 20px;line-height:1.5; direction:rtl;';
    const img = document.createElement('img');
    img.src = dataURL;
    img.style.cssText = 'max-width:90%;max-height:65%;border:3px solid #fff;border-radius:10px;box-shadow:0 0 20px rgba(255,255,255,0.3);';
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i> إغلاق';
    closeBtn.style.cssText = 'margin-top:25px;padding:12px 35px;font-size:16px;font-weight:bold;background:#e74c3c;color:white;border:none;border-radius:30px;cursor:pointer;box-shadow:0 4px 10px rgba(231,76,60,0.4);';
    closeBtn.onclick = () => document.body.removeChild(overlay);
    overlay.appendChild(msg); overlay.appendChild(img); overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
}



function saveCanvasAsImage() {
    composer.render();
    const dataURL = renderer.domElement.toDataURL('image/png');
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    const mode = sketchPass.enabled ? '_sketch' : '';
    const fileName = `vatrena_design${mode}_${timestamp}.png`;

    smartSaveImage(dataURL, fileName, 'تصميم المطبخ');
}

/* =========================================================================
   11. UI & EVENT LISTENERS
   ========================================================================= */
document.getElementById('closeGuestModalBtn')?.addEventListener('click', () => {
    document.getElementById('guestRestrictedModal').style.display = 'none';
});

// دالة لتطبيق حالة ظهور اليدات على كابينة معينة أو على المشهد بالكامل
function applyHandlesVisibility(object) {
    object.traverse((child) => {
        if (child.isMesh && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            // البحث عن خامة تحتوي على كلمة "handle"
            const hasHandle = materials.some(mat => mat && mat.name && mat.name.toLowerCase().includes('handle'));
            if (hasHandle) {
                child.visible = handlesVisible;
            }
        }
    });
}

// عمل زر الإخفاء والإظهار
toggleHandlesBtn?.addEventListener('click', () => {
    handlesVisible = !handlesVisible; // عكس الحالة
    
    // تغيير شكل ولون الزر
    if (handlesVisible) {
        toggleHandlesBtn.innerHTML = '<i class="fas fa-minus-circle"></i> إخفاء اليدات';
        toggleHandlesBtn.style.backgroundColor = '#e74c3c'; // أحمر
    } else {
        toggleHandlesBtn.innerHTML = '<i class="fas fa-plus-circle"></i> إظهار اليدات';
        toggleHandlesBtn.style.backgroundColor = '#2ecc71'; // أخضر
    }
    
    // تطبيق الحالة الجديدة على جميع عناصر المشهد
    applyHandlesVisibility(scene);
});


// --- Bottom Panel Toggle ---
toggleBottomPanelBtn?.addEventListener('click', () => {
    bottomTogglesContent.classList.toggle('show');
});

// --- Window Events ---
window.addEventListener('resize', recomputeCanvasSize);

// --- Keyboard Events - اختصار Ctrl+Z للتراجع ---
window.addEventListener('keydown', (e) => {
    // التحقق من Ctrl+Z (أو Cmd+Z على Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault(); // منع السلوك الافتراضي للمتصفح
        void performUndo();
    }
});

// --- Mouse/Touch Events ---
canvas.addEventListener('mousedown', (e) => handlePressDown(e.clientX, e.clientY));
canvas.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
canvas.addEventListener('mouseup', handlePressUp);
canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 1) handlePressDown(e.touches[0].clientX, e.touches[0].clientY); });
canvas.addEventListener('touchmove', (e) => { if (e.touches.length === 1) handleMove(e.touches[0].clientX, e.touches[0].clientY); });
canvas.addEventListener('touchend', handlePressUp);
canvas.addEventListener('dblclick', () => {
    if (!selectedObject) return;
    if (selectedObject.name === 'scene-text') {
        showSceneTextScalePopup(selectedObject);
        return;
    }
    if (isCabinet(selectedObject)) showDimensionsPopup(selectedObject);
});

// --- Drag & Drop ---
if (!('ontouchstart' in window)) {
    document.addEventListener('dragstart', (event) => {
        const targetItem = event.target.closest('.model-item');
        if (targetItem) {
            const modelPath = targetItem.dataset.modelPath;
            const parentListId = targetItem.closest('ul')?.id;
            let cabinetType = 'floor-cabinet';
            if (parentListId === 'receptionCabinetsList') { cabinetType = 'attached-cabinet'; }
            else if (parentListId === 'electricalAppliancesList') { cabinetType = 'double-attached-cabinet'; }
          const dragData = { 
                path: modelPath, 
                type: cabinetType,
                customY: targetItem.dataset.customY !== undefined ? parseFloat(targetItem.dataset.customY) : null
            };
            event.dataTransfer.setData('application/json', JSON.stringify(dragData));
            event.dataTransfer.effectAllowed = 'copy';
        }
    });

    canvas.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });

   canvas.addEventListener('drop', (event) => {
        event.preventDefault();
        
        if (window.isGuestUser) {
            document.getElementById('guestRestrictedModal').style.display = 'flex';
            return;
        }

        const droppedDataJSON = event.dataTransfer.getData('application/json');
        if (!droppedDataJSON) return;
        const droppedData = JSON.parse(droppedDataJSON);
     const droppedModelPath = droppedData.path;
        const cabinetType = droppedData.type;
        
        // توجيه طلب السحب والإفلات عبر الحارس الآمن
       // --- التعديل الآمن لدعم أرقام النسخ (Caching) في السحب والإفلات ---
const [cleanPath, queryParams] = droppedModelPath.split('?');
let secureModelUrl = 'get_model.php?file=' + encodeURIComponent(cleanPath);

if (queryParams) {
    secureModelUrl += '&' + queryParams;
}
        
        loader.load(
            secureModelUrl,
            (gltf) => {
                const newModel = gltf.scene;
                const rect = renderer.domElement.getBoundingClientRect();
                const mouseX = ((event.clientX - rect.left) / sizes.width) * 2 - 1;
                const mouseY = -((event.clientY - rect.top) / sizes.height) * 2 + 1;
                raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
                const intersects = raycaster.intersectObjects([floor], true);
                const group = new THREE.Group();
                group.add(newModel);
                if (cabinetType === 'attached-cabinet') {
                    newModel.rotation.y = Math.PI;
                }
                const box = new THREE.Box3().setFromObject(newModel);
                const center = box.getCenter(new THREE.Vector3());
                newModel.position.set(-center.x, -box.min.y, -center.z);
              let cabinetY = 0;
                // إضافة شرط الـ customY هنا أيضاً
                if (droppedData.customY !== null && droppedData.customY !== undefined) {
                    cabinetY = droppedData.customY;
                } else if (cabinetType === 'attached-cabinet') {
                    cabinetY = 0;
                } else if (cabinetType === 'double-attached-cabinet') { 
                    cabinetY = 2.22; 
                } else if (cabinetType === 'floor-cabinet') {
                    // التحقق من الاستثناءات عند السحب والإفلات
                    const isException88 = heightException88.some(path => droppedModelPath.includes(path));
                    const isException110 = heightException110.some(path => droppedModelPath.includes(path));
                    
                    if (isException88) {
                        cabinetY = 0.88;
                    } else if (isException110) {
                        cabinetY = 1.10;
                    }
                }
                
                if (intersects.length > 0) { 
                    const p = intersects[0].point; 
                    group.position.set(p.x, cabinetY, p.z); 
                } else { 
                    group.position.set(0, cabinetY, 0); 
                }
                group.name = cabinetType;
                const size = box.getSize(new THREE.Vector3());
                group.userData.originalDimensions = { width: Math.round(size.x * 100), depth: Math.round(size.z * 100), height: Math.round(size.y * 100) };
                group.userData.modelPath = droppedModelPath;
                if (cabinetType === 'attached-cabinet') {
                    group.userData.receptionMeshYawPI = true;
                }
                if (group.name === 'double-attached-cabinet' && currentDoubleAttachedCabinetTexture) { applyTextureToMaterial(group, 'up', currentDoubleAttachedCabinetTexture); }
                else if (group.name === 'attached-cabinet' && droppedModelPath.includes('resption/') && currentFloorCabinetTexture) { applyTextureToMaterial(group, 'ground', currentFloorCabinetTexture); }
                else if (group.name === 'attached-cabinet' && currentAttachedCabinetTexture) { applyTextureToMaterial(group, 'up', currentAttachedCabinetTexture); }
                else if ((group.name === 'floor-cabinet' || group.name === 'pantry-cabinet') && currentFloorCabinetTexture) { applyTextureToMaterial(group, 'ground', currentFloorCabinetTexture); }
                autoAlignToNearestWall(group, true);
                scene.add(group);
                selectedObject = group; selectedWall = null;
                updateDeleteButtonState(); updateTransformButtonsState(); updateSelectionIndicator();
            },
            undefined,
            (error) => console.error('Error loading GLTF model:', error)
        );
    });
}

// --- Main Panel Interactions ---
customRoomBtn?.addEventListener('click', () => {
    openCustomRoomBuilder();
});

startDesignBtn.addEventListener('click', () => {
    const roomLength = parseFloat(document.getElementById('roomLength').value);
    const roomWidth = parseFloat(document.getElementById('roomWidth').value);
    const roomHeight = parseFloat(document.getElementById('roomHeight').value); // قراءة الارتفاع

    if (isNaN(roomLength) || isNaN(roomWidth) || isNaN(roomHeight) || roomLength <= 0 || roomWidth <= 0 || roomHeight <= 0) {
        alert('الرجاء إدخال قياسات صحيحة.');
        return;
    }
    currentRoomLength = roomLength;
    currentRoomWidth = roomWidth;
    currentRoomHeight = roomHeight; // تحديث القيمة العامة
    setupPanel.style.display = 'none';
    loadingOverlay.style.display = 'flex';
    setTimeout(() => {
        webglContainer.style.display = 'block';
        createFloorAndWalls(currentRoomLength, currentRoomWidth);
        warmUpModelPipeline();
        populateModelList('vatrenaCabinetsList', vatrenaCabinets);
        populateModelList('middleVatrenaCabinetsList', middleVatrenaCabinets);
        populateModelList('receptionCabinetsList', receptionCabinets);
        populateModelList('electricalAppliancesList', electricalAppliances);
        populateModelList('accessoriesList', accessoriesList);
        isAnimating = true;
        loadDesignsList();
        animate();
        loadingOverlay.style.display = 'none';
        
        // تهيئة زر Undo
        updateUndoButtonState();
    }, 50);
});

togglePanelBtn?.addEventListener('click', () => {
    controlsPanel.classList.toggle('show');
    recomputeCanvasSize();
    if (controlsPanel.classList.contains('show') && document.getElementById('savedDesignsList').children.length === 0) {
        loadDesignsList();
    }
});

/* =========================================================================
   CUSTOM ROOM BUILDER (CRB) — رسم جدران مخصصة
   ========================================================================= */

// --- تحويل بيكسل CSS إلى متر (إحداثيات المشهد) ---
function crbPxToWorld(cx, cy) {
    const w = crbState.canvas.clientWidth;
    const h = crbState.canvas.clientHeight;
    return {
        x: (cx - w / 2 - crbState.offsetX) / crbState.scale,
        z: (cy - h / 2 - crbState.offsetZ) / crbState.scale
    };
}

// --- تحويل متر إلى بيكسل CSS ---
function crbWorldToPx(wx, wz) {
    const w = crbState.canvas.clientWidth;
    const h = crbState.canvas.clientHeight;
    return {
        cx: wx * crbState.scale + w / 2 + crbState.offsetX,
        cy: wz * crbState.scale + h / 2 + crbState.offsetZ
    };
}

// --- تثبيت الإحداثيات على شبكة 10 سم ---
function crbSnapGrid(x, z) {
    const g = 0.1;
    return { x: Math.round(x / g) * g, z: Math.round(z / g) * g };
}

// --- تقييد الاتجاه للحصول على زاوية 90° فقط ---
function crbConstrain(rawX, rawZ) {
    if (crbState.points.length === 0) return crbSnapGrid(rawX, rawZ);
    const last = crbState.points[crbState.points.length - 1];
    const dx = Math.abs(rawX - last.x);
    const dz = Math.abs(rawZ - last.z);
    let cx, cz;
    if (dx >= dz) { cx = rawX;   cz = last.z; }
    else          { cx = last.x; cz = rawZ;   }
    return crbSnapGrid(cx, cz);
}

// --- هل المؤشر قريب من نقطة البداية؟ ---
function crbNearStart(x, z) {
    if (crbState.points.length < 3) return false;
    const s = crbState.points[0];
    const { cx: sx, cy: sz } = crbWorldToPx(s.x, s.z);
    const { cx,    cy    }   = crbWorldToPx(x,   z);
    const snapPx = Math.max(18, 0.25 * crbState.scale); // 25 سم أو 18px كحد أدنى
    return Math.hypot(cx - sx, cy - sz) < snapPx;
}

// --- رسم الشبكة ---
function crbDrawGrid(ctx, W, H) {
    const tl = crbPxToWorld(0, 0);
    const br = crbPxToWorld(W, H);

    // خطوط 10 سم
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let x = Math.floor(tl.x / 0.1) * 0.1; x <= br.x + 0.1; x += 0.1) {
        const { cx } = crbWorldToPx(x, 0);
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    }
    for (let z = Math.floor(tl.z / 0.1) * 0.1; z <= br.z + 0.1; z += 0.1) {
        const { cy } = crbWorldToPx(0, z);
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    }

    // خطوط 50 سم
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let x = Math.floor(tl.x / 0.5) * 0.5; x <= br.x + 0.5; x += 0.5) {
        const { cx } = crbWorldToPx(x, 0);
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    }
    for (let z = Math.floor(tl.z / 0.5) * 0.5; z <= br.z + 0.5; z += 0.5) {
        const { cy } = crbWorldToPx(0, z);
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    }

    // خطوط المحاور المركزية
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    const { cx: ox, cy: oz } = crbWorldToPx(0, 0);
    ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, oz); ctx.lineTo(W, oz); ctx.stroke();
    ctx.setLineDash([]);

    // مقياس الرسم
    const rulerPx = crbState.scale; // 1 متر
    const rx = 20, ry = H - 28;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx, ry); ctx.lineTo(rx + rulerPx, ry);
    ctx.moveTo(rx, ry - 5); ctx.lineTo(rx, ry + 5);
    ctx.moveTo(rx + rulerPx, ry - 5); ctx.lineTo(rx + rulerPx, ry + 5);
    ctx.stroke();
    ctx.font = '11px Arial'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('1 م', rx + rulerPx / 2, ry - 8);
}

// --- رسم تسمية القياس ---
function crbDimLabel(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - tw / 2, y - 10, tw, 18);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 4);
    ctx.restore();
}

// --- إعادة رسم اللوحة كاملةً ---
function drawCRB() {
    const { canvas, ctx, points, isComplete } = crbState;
    if (!canvas || !ctx) return;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#12121f';
    ctx.fillRect(0, 0, W, H);

    crbDrawGrid(ctx, W, H);

    // تظليل الشكل المكتمل
    if (isComplete && points.length >= 3) {
        ctx.beginPath();
        const s0 = crbWorldToPx(points[0].x, points[0].z);
        ctx.moveTo(s0.cx, s0.cy);
        for (let i = 1; i < points.length; i++) {
            const p = crbWorldToPx(points[i].x, points[i].z);
            ctx.lineTo(p.cx, p.cy);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(76,175,80,0.12)';
        ctx.fill();
    }

    // رسم الأضلاع المكتملة مع القياسات
    const drawCount = isComplete ? points.length : points.length - 1;
    for (let i = 0; i < drawCount; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const { cx: x1, cy: y1 } = crbWorldToPx(p1.x, p1.z);
        const { cx: x2, cy: y2 } = crbWorldToPx(p2.x, p2.z);

        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3;
        ctx.stroke();

        // تسمية القياس
        const lenCm = Math.round(Math.hypot(p2.x - p1.x, p2.z - p1.z) * 100);
        crbDimLabel(ctx, (x1 + x2) / 2, (y1 + y2) / 2 - 12, lenCm + ' سم', '#FFD700');
    }

    // خط المعاينة (من آخر نقطة إلى المؤشر)
    if (points.length > 0 && !isComplete) {
        const last = points[points.length - 1];
        const { cx: lx, cy: ly } = crbWorldToPx(last.x, last.z);

        // إذا كان الاتجاه مُجمَّداً، نعرض المعاينة بالاتجاه المُجمَّد
        let previewX = crbState.mouseX;
        let previewZ = crbState.mouseZ;
        const fd = crbState.frozenDir;
        if (fd) {
            const dimInput = document.getElementById('crb-wall-length-input');
            const val = parseFloat(dimInput?.value);
            if (!isNaN(val) && val > 0) {
                const lenM = val / 100;
                if (fd.isHorizontal) { previewX = last.x + fd.signX * lenM; previewZ = last.z; }
                else                 { previewX = last.x; previewZ = last.z + fd.signZ * lenM; }
            } else {
                if (fd.isHorizontal) previewZ = last.z;
                else                 previewX = last.x;
            }
        }

        const { cx: mx, cy: my } = crbWorldToPx(previewX, previewZ);

        ctx.beginPath();
        ctx.moveTo(lx, ly); ctx.lineTo(mx, my);
        ctx.strokeStyle = crbState.snapToStart ? '#FF5722' : (fd ? '#64B5F6' : 'rgba(255,255,255,0.45)');
        ctx.lineWidth = fd ? 2.5 : 2;
        ctx.setLineDash([9, 5]); ctx.stroke(); ctx.setLineDash([]);

        const preLen = Math.round(Math.hypot(previewX - last.x, previewZ - last.z) * 100);
        if (preLen > 0) {
            const label = fd ? `🔒 ${preLen} سم` : `${preLen} سم`;
            crbDimLabel(ctx, (lx + mx) / 2, (ly + my) / 2 - 14, label, fd ? '#64B5F6' : 'white');
        }
    }

    // رسم النقاط
    points.forEach((p, i) => {
        const { cx, cy } = crbWorldToPx(p.x, p.z);
        ctx.beginPath();
        ctx.arc(cx, cy, i === 0 ? 8 : 5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#FF5722' : '#2196F3';
        ctx.fill();
        ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke();
    });

    // دائرة الالتقاط حول نقطة البداية
    if (crbState.snapToStart && points.length >= 3) {
        const { cx, cy } = crbWorldToPx(points[0].x, points[0].z);
        ctx.beginPath();
        ctx.arc(cx, cy, 16, 0, Math.PI * 2);
        ctx.strokeStyle = '#FF5722'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.font = 'bold 11px Arial'; ctx.fillStyle = '#FF5722';
        ctx.textAlign = 'center';
        ctx.fillText('إغلاق', cx, cy - 22);
    }

    // نقطة المؤشر الحالية
    if (!isComplete && points.length > 0) {
        const { cx, cy } = crbWorldToPx(crbState.mouseX, crbState.mouseZ);
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
    }
}

// --- الحصول على موضع المؤشر من الحدث ---
function getCRBEventPos(e) {
    const rect = crbState.canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// --- معالج النقر ---
function onCRBClick(e) {
    if (e.button !== 0 || crbState.isComplete) return;
    const { x: px, y: py } = getCRBEventPos(e);
    const raw = crbPxToWorld(px, py);

    let finalPos;
    if (crbState.points.length === 0) {
        finalPos = crbSnapGrid(raw.x, raw.z);
    } else {
        // التقاط نقطة البداية يتم على الموضع الخام (لا المقيّد) للسهولة
        if (crbState.points.length >= 3 && crbNearStart(raw.x, raw.z)) {
            crbClose();
            return;
        }

        // هل جمّد المستخدم الاتجاه وأدخل طولاً محدداً؟
        const dimInput = document.getElementById('crb-wall-length-input');
        const inputVal = parseFloat(dimInput?.value);
        if (!isNaN(inputVal) && inputVal > 10 && crbState.frozenDir) {
            finalPos = crbApplyFrozenDim(inputVal / 100);
            dimInput.value = '';
            crbState.frozenDir = null;
        } else if (!isNaN(inputVal) && inputVal > 10) {
            // لا يوجد تجميد — نستخدم الاتجاه الحالي للمؤشر
            const last = crbState.points[crbState.points.length - 1];
            const lenM = inputVal / 100;
            const dx = raw.x - last.x;
            const dz = raw.z - last.z;
            if (Math.abs(dx) >= Math.abs(dz)) {
                finalPos = { x: last.x + Math.sign(dx || 1) * lenM, z: last.z };
            } else {
                finalPos = { x: last.x, z: last.z + Math.sign(dz || 1) * lenM };
            }
            dimInput.value = '';
        } else {
            finalPos = crbConstrain(raw.x, raw.z);
        }
    }

    crbState.points.push(finalPos);
    crbState.frozenDir = null; // مسح التجميد بعد وضع النقطة
    drawCRB();
}

// --- معالج الحركة ---
function onCRBMove(e) {
    if (crbState.isPanning) return;
    if (crbState.isComplete) return;

    // لا نغيّر الاتجاه عندما يكون حقل الإدخال نشطاً
    const dimInput = document.getElementById('crb-wall-length-input');
    if (document.activeElement === dimInput) return;

    const { x: px, y: py } = getCRBEventPos(e);
    const raw = crbPxToWorld(px, py);
    const constrained = crbConstrain(raw.x, raw.z);

    // التحقق من قرب نقطة البداية على الموضع الخام
    crbState.snapToStart = (crbState.points.length >= 3) && crbNearStart(raw.x, raw.z);

    if (crbState.snapToStart) {
        crbState.mouseX = crbState.points[0].x;
        crbState.mouseZ = crbState.points[0].z;
    } else {
        crbState.mouseX = constrained.x;
        crbState.mouseZ = constrained.z;
    }

    // تحديث placeholder بالطول الحالي
    if (crbState.points.length >= 1) {
        const last = crbState.points[crbState.points.length - 1];
        const lenCm = Math.round(Math.hypot(crbState.mouseX - last.x, crbState.mouseZ - last.z) * 100);
        if (dimInput) dimInput.placeholder = lenCm + ' سم';
    }

    drawCRB();
}

// --- تعامل اللمس ---
function onCRBTouchStart(e) {
    e.preventDefault();
    onCRBClick({ button: 0, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, touches: e.touches });
}
function onCRBTouchMove(e) {
    e.preventDefault();
    onCRBMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, touches: e.touches });
}

// --- التكبير والتحريك ---
function onCRBWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    crbState.scale = Math.max(25, Math.min(350, crbState.scale * factor));
    drawCRB();
}

// --- إغلاق المضلع مع ضمان زوايا 90° ---
function crbClose() {
    if (crbState.points.length < 3) return;

    const first = crbState.points[0];
    const second = crbState.points[1];
    const lastIndex = crbState.points.length - 1;
    const last = crbState.points[lastIndex];
    const prev = crbState.points[lastIndex - 1];

    // أول جدار هو المرجع الثابت: لا نغيّر نقطة البداية ولا طول أول حائط عند الإغلاق.
    const firstIsHorizontal = Math.abs(second.x - first.x) >= Math.abs(second.z - first.z);
    const lastIsHorizontal = Math.abs(last.x - prev.x) >= Math.abs(last.z - prev.z);

    // نقطة ما قبل الإغلاق يجب أن تقع على خط البداية العمودي/الأفقي المناسب،
    // حتى يبقى جدار الإغلاق بزاوية 90° والجدار الموازي للأول هو الذي يتعدل.
    const closureAnchor = firstIsHorizontal
        ? crbSnapGrid(first.x, last.z)
        : crbSnapGrid(last.x, first.z);

    if (lastIsHorizontal === firstIsHorizontal) {
        // يوجد بالفعل جدار موازي للأول، فنعدّل طوله فقط بدل إضافة جدار جديد.
        crbState.points[lastIndex] = closureAnchor;
    } else {
        // المستخدم رسم حتى الزاوية السابقة فقط، فننشئ الجدار المقابل تلقائياً.
        const sameAsLast = Math.hypot(closureAnchor.x - last.x, closureAnchor.z - last.z) < 0.005;
        if (!sameAsLast) {
            crbState.points.push(closureAnchor);
        }
    }

    crbState.isComplete = true;
    const startBtn = document.getElementById('crb-start-btn');
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        startBtn.style.cursor  = 'pointer';
    }
    drawCRB();
}

// --- تهيئة اللوحة ---


function crbResizeCanvas() {
    const canvas = crbState.canvas;
    if (!canvas) return;
    const wrapper = canvas.parentElement;
    if (!wrapper) return;
    const dpr = window.devicePixelRatio || 1;

    // The overlay is always position:fixed covering the full viewport, so
    // window.innerWidth/Height are reliable fallbacks. Never loop with RAF
    // when dimensions are 0 — that causes an infinite loop and browser freeze.
    const W = wrapper.clientWidth  || window.innerWidth;
    const H = wrapper.clientHeight || window.innerHeight;

    if (W === 0 || H === 0) return;

    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    if (crbState.ctx) {
        crbState.ctx.setTransform(1, 0, 0, 1, 0, 0);
        crbState.ctx.scale(dpr, dpr);
    }
    drawCRB();
}

function openCustomRoomBuilder(e) {
    if (e) e.preventDefault();

    const overlay = document.getElementById('custom-room-overlay');
    if (!overlay) return;

    // Hide the setup panel
    const setupPanel = document.getElementById('setup-panel');
    if (setupPanel) setupPanel.style.display = 'none';

    // Sync room height from the setup panel input
    const mainH = parseFloat(document.getElementById('roomHeight')?.value) || 280;
    const crbH  = document.getElementById('crb-height');
    if (crbH) crbH.value = mainH;

    // Show the overlay — the CSS file already handles position:fixed, inset:0,
    // background, z-index, and flex-direction. We only need to flip display.
    overlay.style.display = 'flex';

    crbState.scale   = 100;
    crbState.offsetX = 0;
    crbState.offsetZ = 0;

    // Two nested rAFs guarantee the browser has fully laid out and painted the
    // overlay before we read clientWidth/clientHeight inside initCRB.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            initCRB();
        });
    });
}

function closeCustomRoomBuilder() {
    const overlay = document.getElementById('custom-room-overlay');
    if (overlay) overlay.style.display = 'none';

    const setupPanel = document.getElementById('setup-panel');
    if (setupPanel) setupPanel.style.display = 'flex'; 
}

function initCRB() {
    // ✨ تم تصحيح الـ ID إلى الكانفاس الحقيقي
    crbState.canvas = document.getElementById('crb-canvas');
    if (!crbState.canvas) return;

    crbState.ctx = crbState.canvas.getContext('2d');

    // تنظيف الأحداث لتجنب التكرار
    crbState.canvas.removeEventListener('mousedown', onCRBClick);
    crbState.canvas.removeEventListener('mousemove', onCRBMove);
    crbState.canvas.removeEventListener('touchstart', onCRBTouchStart);
    crbState.canvas.removeEventListener('touchmove', onCRBTouchMove);
    crbState.canvas.removeEventListener('wheel', onCRBWheel);

    crbState.canvas.addEventListener('mousedown', onCRBClick);
    crbState.canvas.addEventListener('mousemove', onCRBMove);
    crbState.canvas.addEventListener('touchstart', onCRBTouchStart, { passive: false });
    crbState.canvas.addEventListener('touchmove', onCRBTouchMove,  { passive: false });
    crbState.canvas.addEventListener('wheel', onCRBWheel, { passive: false });

    // سحب الزر الأوسط للتحريك — استخدام دوال مسماة لتجنب التراكم عند استدعاء initCRB مرات متعددة
    if (crbState._onPanMouseDown) {
        crbState.canvas.removeEventListener('mousedown', crbState._onPanMouseDown);
        window.removeEventListener('mousemove', crbState._onPanMouseMove);
        window.removeEventListener('mouseup', crbState._onPanMouseUp);
    }
    crbState._onPanMouseDown = (e) => {
        if (e.button === 1) {
            crbState.isPanning = true;
            crbState.panStartX = e.clientX - crbState.offsetX;
            crbState.panStartZ = e.clientY - crbState.offsetZ;
            e.preventDefault();
        }
    };
    crbState._onPanMouseMove = (e) => {
        if (!crbState.isPanning) return;
        crbState.offsetX = e.clientX - crbState.panStartX;
        crbState.offsetZ = e.clientY - crbState.panStartZ;
        drawCRB();
    };
    crbState._onPanMouseUp = (e) => {
        if (e.button === 1) crbState.isPanning = false;
    };
    crbState.canvas.addEventListener('mousedown', crbState._onPanMouseDown);
    window.addEventListener('mousemove', crbState._onPanMouseMove);
    window.addEventListener('mouseup', crbState._onPanMouseUp);

    crbResizeCanvas();
}





// --- أزرار لوحة CRB ---
// --- تطبيق الطول المُدخل يدوياً مع الاتجاه المُجمَّد ---
function crbApplyFrozenDim(lenM) {
    const fd = crbState.frozenDir;
    if (!fd || crbState.points.length === 0) return null;
    const last = crbState.points[crbState.points.length - 1];
    if (fd.isHorizontal) {
        return crbSnapGrid(last.x + fd.signX * lenM, last.z);
    } else {
        return crbSnapGrid(last.x, last.z + fd.signZ * lenM);
    }
}

// --- إدخال يدوي للطول مع تجميد الاتجاه ---
(function setupDimInput() {
    const dimInput = document.getElementById('crb-wall-length-input');
    if (!dimInput) return;

    // تجميد الاتجاه عند التركيز على الـ input
    dimInput.addEventListener('focus', () => {
        if (crbState.points.length >= 1) {
            const last = crbState.points[crbState.points.length - 1];
            const dx = crbState.mouseX - last.x;
            const dz = crbState.mouseZ - last.z;
            const isH = Math.abs(dx) >= Math.abs(dz);
            crbState.frozenDir = {
                isHorizontal: isH,
                signX: Math.sign(dx) || 1,
                signZ: Math.sign(dz) || 1,
            };
        }
    });

    // Enter لتطبيق الطول وإضافة النقطة فوراً
    dimInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const val = parseFloat(dimInput.value);
        if (isNaN(val) || val <= 10 || crbState.points.length === 0 || crbState.isComplete) return;

        const lenM = val / 100;
        let finalPos;
        if (crbState.frozenDir) {
            finalPos = crbApplyFrozenDim(lenM);
        } else {
            const last = crbState.points[crbState.points.length - 1];
            const dx   = crbState.mouseX - last.x;
            const dz   = crbState.mouseZ - last.z;
            if (Math.abs(dx) >= Math.abs(dz)) {
                finalPos = crbSnapGrid(last.x + Math.sign(dx || 1) * lenM, last.z);
            } else {
                finalPos = crbSnapGrid(last.x, last.z + Math.sign(dz || 1) * lenM);
            }
        }

        if (finalPos) {
            crbState.points.push(finalPos);
            dimInput.value = '';
            crbState.frozenDir = null;
            drawCRB();
        }
        // أعد التركيز للـ canvas
        crbState.canvas?.focus?.();
    });

    // مسح التجميد عند الخروج من الـ input بدون Enter
    dimInput.addEventListener('blur', () => {
        // نبقي frozenDir حتى النقر التالي على الـ canvas
    });
})();

document.getElementById('crb-undo-btn')?.addEventListener('click', () => {
    crbState.frozenDir = null;
    const dimInput = document.getElementById('crb-wall-length-input');
    if (dimInput) dimInput.value = '';
    if (crbState.isComplete) {
        crbState.isComplete = false;
        const startBtn = document.getElementById('crb-start-btn');
        if (startBtn) { startBtn.disabled = true; startBtn.style.opacity = '0.4'; startBtn.style.cursor = 'not-allowed'; }
    } else if (crbState.points.length > 0) {
        crbState.points.pop();
    }
    drawCRB();
});

document.getElementById('crb-clear-btn')?.addEventListener('click', () => {
    crbState.points      = [];
    crbState.isComplete  = false;
    crbState.mouseX      = 0;
    crbState.mouseZ      = 0;
    crbState.snapToStart = false;
    crbState.frozenDir   = null;
    const dimInput = document.getElementById('crb-wall-length-input');
    if (dimInput) { dimInput.value = ''; dimInput.placeholder = 'تلقائي'; }
    const startBtn = document.getElementById('crb-start-btn');
    if (startBtn) { startBtn.disabled = true; startBtn.style.opacity = '0.4'; startBtn.style.cursor = 'not-allowed'; }
    drawCRB();
});

document.getElementById('crb-back-btn')?.addEventListener('click', () => {
    closeCustomRoomBuilder();
});

document.getElementById('crb-start-btn')?.addEventListener('click', () => {
    startCustomDesign();
});

// ضبط حجم اللوحة عند تغيير حجم النافذة
window.addEventListener('resize', () => {
    const overlay = document.getElementById('custom-room-overlay');
    if (overlay && overlay.style.display === 'flex') {
        crbResizeCanvas();
    }
});

toggleSketchBtn?.addEventListener('click', () => {
    sketchPass.enabled = !sketchPass.enabled;
    if (sketchPass.enabled) {
        toggleSketchBtn.style.backgroundColor = '#4CAF50';
        if (!originalBackgroundTexture && scene.background instanceof THREE.Texture) {
            originalBackgroundTexture = scene.background;
        }
        scene.background = new THREE.Color(0xffffff);
        ambientLight.intensity = 1.2;
        directionalLight.intensity = 1.2;
    } else {
        toggleSketchBtn.style.backgroundColor = '#555';
        if (originalBackgroundTexture) {
            scene.background = originalBackgroundTexture;
        } else {
            scene.background = new THREE.Color(0x87ceeb);
        }
        ambientLight.intensity = 0.7;
        directionalLight.intensity = 0.8;
    }
});

snappingToggleCheckbox?.addEventListener('change', (event) => {
    snappingAndCollisionEnabled = event.target.checked;
});

// كود تشغيل زر الدوران التلقائي
rotationToggleCheckbox?.addEventListener('change', (event) => {
    autoRotationEnabled = event.target.checked;
});

// --- Texture Selection Events ---
document.querySelectorAll('#wall-texture-buttons .texture-button').forEach(btn => {
    btn.addEventListener('click', () => {
        const texture = btn.dataset.texture;
        changeWallTexture(texture);
    });
});

document.querySelectorAll('#floor-texture-buttons .texture-button').forEach(btn => {
    btn.addEventListener('click', () => {
        const texture = btn.dataset.texture;
        changeFloorTexture(texture);
    });
});

wallColorButtons.forEach(b => b.addEventListener('click', (e) => changeWallColor(e.target.dataset.color)));
floorCabinetTextureButtons.forEach(b => { b.addEventListener('click', (e) => { floorCabinetTextureButtons.forEach(btn => btn.classList.remove('selected')); e.currentTarget.classList.add('selected'); changeAllFloorCabinetsTexture(e.currentTarget.dataset.texture); }); });
document.querySelector('#floor-cabinet-texture-buttons .texture-button[data-texture="Kester"]')?.classList.add('selected');
attachedCabinetTextureButtons.forEach(b => { b.addEventListener('click', (e) => { attachedCabinetTextureButtons.forEach(btn => btn.classList.remove('selected')); e.currentTarget.classList.add('selected'); changeAllAttachedCabinetsTexture(e.currentTarget.dataset.texture); }); });
doubleAttachedCabinetTextureButtons.forEach(b => { b.addEventListener('click', (e) => { doubleAttachedCabinetTextureButtons.forEach(btn => btn.classList.remove('selected')); e.currentTarget.classList.add('selected'); changeAllDoubleAttachedCabinetsTexture(e.currentTarget.dataset.texture); }); });


popupVerticalToggleBtn?.addEventListener('click', () => {
    updateAllVerticalButtonsUI(!isVerticalMode); // عكس الحالة
});

/* =========================================================================
   START CUSTOM DESIGN — تحويل الرسم 2D إلى مشهد ثلاثي الأبعاد
   ========================================================================= */
function startCustomDesign() {
    if (!crbState.isComplete || crbState.points.length < 3) {
        alert('يرجى إكمال رسم الجدران أولاً (أغلق الشكل بالضغط قرب نقطة البداية).');
        return;
    }

    const heightInput = document.getElementById('crb-height');
    const height = parseFloat(heightInput?.value);
    if (isNaN(height) || height < 100) {
        alert('يرجى إدخال ارتفاع صحيح (100 سم فأكثر).');
        return;
    }
    currentRoomHeight = height;

    // النقاط موجودة بالمتر — نمركزها حول الأصل
    const raw = crbState.points.map(p => ({ x: p.x, z: p.z }));
    let cx = 0, cz = 0;
    raw.forEach(p => { cx += p.x; cz += p.z; });
    cx /= raw.length; cz /= raw.length;
    const centeredPoints = raw.map(p => ({ x: p.x - cx, z: p.z - cz }));

    closeCustomRoomBuilder();
    setupPanel.style.display = 'none';
    loadingOverlay.style.display = 'flex';

    setTimeout(() => {
        webglContainer.style.display = 'block';
        createCustomFloorAndWalls(centeredPoints);
        warmUpModelPipeline();
        populateModelList('vatrenaCabinetsList',         vatrenaCabinets);
        populateModelList('middleVatrenaCabinetsList',   middleVatrenaCabinets);
        populateModelList('receptionCabinetsList',      receptionCabinets);
        populateModelList('electricalAppliancesList', electricalAppliances);
        populateModelList('accessoriesList',           accessoriesList);
        isAnimating = true;
        loadDesignsList();
        animate();
        loadingOverlay.style.display = 'none';
        updateUndoButtonState();
    }, 50);
}

function createCustomFloorAndWalls(polygonPoints) {
    const wallHeight = currentRoomHeight / 100;
    const wallDepth  = 0.1;
    currentRoomPolygon = polygonPoints.map(p => ({ x: p.x, z: p.z }));

    // --- تنظيف المشهد ---
    if (floor) {
        scene.remove(floor);
        floor.geometry?.dispose?.();
        floor.material?.dispose?.();
        floor = null;
    }
    if (ceiling) {
        scene.remove(ceiling);
        ceiling.geometry?.dispose?.();
        ceiling.material?.dispose?.();
        ceiling = null;
    }
    walls.forEach(w => {
        scene.remove(w);
        w.geometry?.dispose?.();
        if (Array.isArray(w.material)) w.material.forEach(m => m?.dispose?.());
        else w.material?.dispose?.();
    });
    walls = [];
    selectedWall = null;

    // --- بناء الجدران ---
    const customWalls = buildCustomWalls(polygonPoints, wallHeight, wallDepth);
    customWalls.forEach(w => { scene.add(w); walls.push(w); });

    // --- بناء الأرضية ---
    floor = createCustomFloorMesh(polygonPoints, textureLoader, currentFloorTexturePath, renderer);
    scene.add(floor);

    // --- بناء السقف ---
    ceiling = createCustomCeilingMesh(polygonPoints, wallHeight);
    scene.add(ceiling);

    // --- حساب أبعاد الغرفة الجديدة للاستخدام اللاحق ---
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    polygonPoints.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    });
    currentRoomLength = Math.round((maxX - minX) * 100);
    currentRoomWidth  = Math.round((maxZ - minZ) * 100);

    // --- تطبيق خامة الجدران ---
    if (currentWallTexturePath) changeWallTexture(currentWallTexturePath);

    // --- ضبط الكاميرا ---
    const bbox = new THREE.Box3().setFromObject(scene);
    const center = bbox.getCenter(new THREE.Vector3());
    const size   = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fovRad = camera.fov * (Math.PI / 180);
    const camDist = Math.abs(maxDim / 2 / Math.tan(fovRad / 2)) * 1.5;
    camera.position.set(center.x + camDist * 0.6, center.y + camDist * 0.45, center.z + camDist);
    camera.far = camera.position.distanceTo(center) + maxDim * 2.0;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
}

function performDeletion() {
    if (selectedObject) {
        // حفظ حالة الكائن قبل الحذف للـ Undo
        saveUndoState('delete', selectedObject);
        
        scene.remove(selectedObject);
        selectedObject.traverse(child => {
            if (child.isMesh) {
                child.geometry?.dispose?.();
                if (Array.isArray(child.material)) child.material.forEach(m => m?.dispose?.());
                else child.material?.dispose?.();
            }
        });
        selectedObject = null;
    } else if (selectedWall) {
        const hasWindows = selectedWall.userData.holes?.length > 0;
        if (hasWindows) {
            selectedWall.userData.holes.pop();
            const windowAssemblies = selectedWall.children.filter(c => c.name === 'window-assembly');
            if (windowAssemblies.length > 0) {
                const lastWindow = windowAssemblies[windowAssemblies.length - 1];
                selectedWall.remove(lastWindow);
            }
            rebuildWallGeometry(selectedWall);
        } else {
            scene.remove(selectedWall);
            selectedWall.geometry?.dispose?.();
            if (Array.isArray(selectedWall.material)) selectedWall.material.forEach(m => m?.dispose?.());
            else selectedWall.material?.dispose?.();
            walls = walls.filter(w => w !== selectedWall);
            selectedWall = null;
        }
    }
    updateDeleteButtonState();
    updateTransformButtonsState();
    updateSelectionIndicator();
}

/* =========================================================================
   UNDO SYSTEM - نظام التراجع
   ========================================================================= */

function saveUndoState(actionType, object) {
    if (!object) return;
    
    const state = {
        type: actionType,
        timestamp: Date.now(),
        object: null
    };
    
    switch(actionType) {
        case 'delete':
            state.object = {
                name: object.name,
                position: object.position.clone(),
                rotation: object.rotation.clone(),
                scale: object.scale.clone(),
                modelPath: object.userData.modelPath,
                originalDimensions: object.userData.originalDimensions ? {...object.userData.originalDimensions} : null,
                userData: {...object.userData}
            };
            break;
            
        case 'move':
            state.object = {
                ref: object,
                previousPosition: object.userData.previousPosition ? object.userData.previousPosition.clone() : object.position.clone()
            };
            break;
            
        case 'rotate':
            state.object = {
                ref: object,
                previousRotation: object.userData.previousRotation ? object.userData.previousRotation.clone() : object.rotation.clone()
            };
            break;
            
        case 'scale':
        case 'dimensions':
            state.object = {
                ref: object,
                previousScale: object.userData.previousScale ? object.userData.previousScale.clone() : object.scale.clone(),
                previousDimensions: object.userData.previousDimensions ? {...object.userData.previousDimensions} : null
            };
            break;

        // حالة تغيير لون كابينة واحدة (من الشريط العائم)
        case 'color': {
            const prevMaterials = [];
            object.traverse((child) => {
                if (child.isMesh && child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    prevMaterials.push({
                        mesh: child,
                        mats: mats.map(m => m ? m.clone() : m) // أخذ نسخة احتياطية من الخامات
                    });
                }
            });

            state.object = {
                ref: object,
                previousColorGroup: object.userData.customColorGroup || null,
                savedMaterials: prevMaterials
            };
            break;
        }

        case 'sceneTextColor':
            state.object = {
                ref: object.ref,
                previousColorKey: object.previousColorKey || 'black',
            };
            break;

        // حالة تغيير لون مجموعة كاملة (من القائمة الجانبية)
        case 'groupColor': {
            const groupState = [];
            // العنصر هنا عبارة عن مصفوفة من الكابينات
            object.forEach(cab => {
                const prevMaterials = [];
                cab.traverse((child) => {
                    if (child.isMesh && child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        prevMaterials.push({
                            mesh: child,
                            mats: mats.map(m => m ? m.clone() : m)
                        });
                    }
                });
                groupState.push({
                    ref: cab,
                    previousColorGroup: cab.userData.customColorGroup || null,
                    savedMaterials: prevMaterials
                });
            });
            state.object = groupState;
            break;
        }
    }
    
    undoStack.push(state);
    
    if (undoStack.length > MAX_UNDO_HISTORY) {
        undoStack.shift();
    }
    
    updateUndoButtonState();
}

async function performUndo() {
    if (undoStack.length === 0) return;
    
    const lastAction = undoStack.pop();
    
    switch(lastAction.type) {
        case 'delete':
            await restoreDeletedObject(lastAction.object);
            break;
            
        case 'move':
            if (lastAction.object.ref && lastAction.object.ref.parent) {
                lastAction.object.ref.position.copy(lastAction.object.previousPosition);
            }
            break;
            
        case 'rotate':
            if (lastAction.object.ref && lastAction.object.ref.parent) {
                lastAction.object.ref.rotation.copy(lastAction.object.previousRotation);
            }
            break;
            
        case 'scale':
        case 'dimensions':
            if (lastAction.object.ref && lastAction.object.ref.parent) {
                lastAction.object.ref.scale.copy(lastAction.object.previousScale);
                if (lastAction.object.previousDimensions) {
                    lastAction.object.ref.userData.originalDimensions = {...lastAction.object.previousDimensions};
                }
            }
            break;

        // التراجع عن لون كابينة واحدة
        case 'color':
            if (lastAction.object.ref && lastAction.object.ref.parent) {
                const obj = lastAction.object.ref;
                
                obj.userData.customColorGroup = lastAction.object.previousColorGroup;

                if (lastAction.object.savedMaterials) {
                    lastAction.object.savedMaterials.forEach(item => {
                        if (item.mesh) {
                            item.mesh.material = item.mats.length === 1 ? item.mats[0] : item.mats;
                            if (Array.isArray(item.mesh.material)) {
                                item.mesh.material.forEach(m => { if(m) m.needsUpdate = true; });
                            } else {
                                if(item.mesh.material) item.mesh.material.needsUpdate = true;
                            }
                        }
                    });
                }
            }
            break;

        case 'sceneTextColor':
            if (lastAction.object.ref && lastAction.object.ref.parent) {
                applySceneTextMaterialColor(lastAction.object.ref, lastAction.object.previousColorKey);
                if (selectedObject === lastAction.object.ref) syncAddTextPanelFromSelection();
            }
            break;

        // التراجع عن لون مجموعة كابينات
        case 'groupColor':
            if (Array.isArray(lastAction.object)) {
                lastAction.object.forEach(cabData => {
                    if (cabData.ref && cabData.ref.parent) {
                        const obj = cabData.ref;
                        
                        obj.userData.customColorGroup = cabData.previousColorGroup;
                        
                        if (cabData.savedMaterials) {
                            cabData.savedMaterials.forEach(item => {
                                if (item.mesh) {
                                    item.mesh.material = item.mats.length === 1 ? item.mats[0] : item.mats;
                                    if (Array.isArray(item.mesh.material)) {
                                        item.mesh.material.forEach(m => { if(m) m.needsUpdate = true; });
                                    } else {
                                        if(item.mesh.material) item.mesh.material.needsUpdate = true;
                                    }
                                }
                            });
                        }
                    }
                });
            }
            break;
    }
    
    updateUndoButtonState();
}

async function restoreDeletedObject(objectData) {
    if (!objectData || !objectData.modelPath) return;

    if (objectData.modelPath === SCENE_TEXT_MODEL_PATH && objectData.userData?.sceneTextPayload) {
        const pl = objectData.userData.sceneTextPayload;
        const group = await createSceneTextGroup(pl.text, pl.colorKey);
        if (!group) return;
        group.position.copy(objectData.position);
        group.rotation.copy(objectData.rotation);
        group.scale.copy(objectData.scale);
        scene.add(group);
        selectedObject = group;
        selectedWall = null;
        updateDeleteButtonState();
        updateTransformButtonsState();
        updateSelectionIndicator();
        return;
    }
    
    // إذا كان الكائن Procedural Slat
    if (objectData.modelPath === 'PROCEDURAL_SLAT') {
        const geometry = createProceduralSlatGeometry(100, 100);
        const material = new THREE.MeshStandardMaterial({ name: 'ground', color: 0xcccccc });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const group = new THREE.Group();
        group.add(mesh);
        group.position.copy(objectData.position);
        group.rotation.copy(objectData.rotation);
        group.scale.copy(objectData.scale);
        group.name = objectData.name;
        group.userData = {...objectData.userData};

        if (currentFloorCabinetTexture) {
            applyTextureToMaterial(group, 'ground', currentFloorCabinetTexture);
        }

        scene.add(group);
        selectedObject = group;
        updateDeleteButtonState();
        updateTransformButtonsState();
        updateSelectionIndicator();
        return;
    }
    // إذا كان كائن GLTF عادي
   // التعديل الآمن لنظام التراجع (Undo)
const [cleanPath, queryParams] = objectData.modelPath.split('?');
let secureModelUrl = 'get_model.php?file=' + encodeURIComponent(cleanPath);
if (queryParams) secureModelUrl += '&' + queryParams;
    loader.load(
        secureModelUrl,
        (gltf) => {
            const newModel = gltf.scene;
            newModel.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            const pathRestore = (objectData.userData?.modelPath || objectData.modelPath || '').toString();
            const flipReceptionMeshRestore = objectData.name === 'attached-cabinet' &&
                objectData.userData?.receptionMeshYawPI !== false &&
                (objectData.userData?.receptionMeshYawPI === true || pathRestore.includes('resption/'));
            if (flipReceptionMeshRestore) {
                newModel.rotation.y = Math.PI;
            }
            const box = new THREE.Box3().setFromObject(newModel);
            const center = box.getCenter(new THREE.Vector3());
            const group = new THREE.Group();
            group.add(newModel);
            newModel.position.set(-center.x, -box.min.y, -center.z);
            
            // استرجاع كل الخصائص (دوران المجموعة المحفوظ يطابق المشهد؛ دوران الطفل π للرسبشن يُعاد هنا فقط)
            group.position.copy(objectData.position);
            group.rotation.copy(objectData.rotation);
            group.scale.copy(objectData.scale);
            group.name = objectData.name;
            group.userData = {...objectData.userData};
            
            // استرجاع اللون/النسيج
            const isDoubleAttached = group.name === 'double-attached-cabinet';
            const isAttached = group.name === 'attached-cabinet';
            const isFloor = group.name === 'floor-cabinet' || group.name === 'pantry-cabinet';
            
            if (isDoubleAttached && currentDoubleAttachedCabinetTexture) {
                applyTextureToMaterial(group, 'up', currentDoubleAttachedCabinetTexture);
            } else if (isAttached && currentFloorCabinetTexture && isReceptionCabinetGroup(group)) {
                applyTextureToMaterial(group, 'ground', currentFloorCabinetTexture);
            } else if (isAttached && currentAttachedCabinetTexture) {
                applyTextureToMaterial(group, 'up', currentAttachedCabinetTexture);
            } else if (isFloor && currentFloorCabinetTexture) {
                applyTextureToMaterial(group, 'ground', currentFloorCabinetTexture);
            }
            
            scene.add(group);
            selectedObject = group;
            updateDeleteButtonState();
            updateTransformButtonsState();
            updateSelectionIndicator();
        },
        undefined,
        (error) => {
            console.error('Error loading GLTF model via secure gateway:', error);
            if (window.isGuestUser) {
                const modal = document.getElementById('guestRestrictedModal');
                if(modal) modal.style.display = 'flex';
            }
        }
    );
}

function updateUndoButtonState() {
    if (!ftUndoBtn) return;
    
    if (undoStack.length > 0) {
        ftUndoBtn.disabled = false;
        ftUndoBtn.style.opacity = '1';
        ftUndoBtn.style.cursor = 'pointer';
    } else {
        ftUndoBtn.disabled = true;
        ftUndoBtn.style.opacity = '0.5';
        ftUndoBtn.style.cursor = 'not-allowed';
    }
}

// --- Floating Toolbar Events ---

// 0. زر التراجع (Undo)
ftUndoBtn?.addEventListener('click', () => {
    void performUndo();
});

// --- حدث النقر لزر الحذف في القائمة الجانبية ---
panelDeleteBtn?.addEventListener('click', () => {
    if (selectedObject || selectedWall) {
        performDeletion(); // هذه الدالة موجودة بالفعل في كودك وتقوم بمهمة الحذف بشكل ممتاز
        
        // إخفاء الشريط العائم إذا كان ظاهراً
        if (typeof floatingToolbar !== 'undefined' && floatingToolbar) {
            floatingToolbar.style.display = 'none';
        }
    }
});

// 1. زر الحذف
ftDeleteBtn?.addEventListener('click', () => {
    if (selectedObject) {
        performDeletion(); 
        floatingToolbar.style.display = 'none';
        floatingToolbar.classList.remove('expanded');
        if (ftMainToggleBtn) ftMainToggleBtn.querySelector('i').className = 'fas fa-tools';
    }
});
// 2. زر الحركة العمودية
ftVerticalBtn?.addEventListener('click', () => {
    // عكس الحالة الحالية
    const newState = !isVerticalMode;
    // تحديث واجهة المستخدم العامة (لأن لديك دالة تقوم بذلك بالفعل)
    updateAllVerticalButtonsUI(newState);
    
    // تحديث شكل الزر في الشريط العائم
    if (newState) {
        ftVerticalBtn.classList.add('active');
    } else {
        ftVerticalBtn.classList.remove('active');
    }
});

// 3. زر التدوير
ftRotateBtn?.addEventListener('click', () => {
    if (selectedObject) {
        // حفظ الحالة قبل التدوير
        selectedObject.userData.previousRotation = selectedObject.rotation.clone();
        saveUndoState('rotate', selectedObject);
        
        // تدوير 90 درجة (نفس زر rotateYPos90)
        selectedObject.rotation.y += fixed90DegRotation;
    }
});

// 4. زر عكس العنصر
ftMirrorBtn?.addEventListener('click', () => {
    if (selectedObject) {
        mirrorSelectedObject(); // هذه الدالة موجودة مسبقاً في الكود الخاص بك وتقوم بالمطلوب
    }
});



// تنفيذ تغيير اللون عند اختيار عنصر من القائمة
document.querySelectorAll('.ft-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        if (!selectedObject || !isCabinet(selectedObject)) return;
        saveUndoState('color', selectedObject);
        const group = e.target.dataset.group;
        const originalName = selectedObject.name;
        const targetMat = cabinetBodyMaterialSlot(selectedObject);
        
        if (group === 'reset') {
            // إرجاع العنصر لحالته الأصلية
            selectedObject.userData.customColorGroup = null;
            let texName = null;
            if (originalName === 'floor-cabinet' || originalName === 'pantry-cabinet') texName = currentFloorCabinetTexture;
            else if (originalName === 'attached-cabinet') texName = isReceptionCabinetGroup(selectedObject) ? currentFloorCabinetTexture : currentAttachedCabinetTexture;
            else if (originalName === 'double-attached-cabinet') texName = currentDoubleAttachedCabinetTexture;
            
            if (texName) applyCabinetTexture(selectedObject, targetMat, texName);
            
        } else {
            // ربط العنصر بالمجموعة الجديدة وتطبيق اللون فوراً
            selectedObject.userData.customColorGroup = group;
            
            if (group === 'floor' && currentFloorCabinetTexture) {
                applyCabinetTexture(selectedObject, cabinetBodyMaterialSlot(selectedObject), currentFloorCabinetTexture);
            } else if (group === 'attached') {
                if (isReceptionCabinetGroup(selectedObject)) {
                    if (currentFloorCabinetTexture) applyCabinetTexture(selectedObject, 'ground', currentFloorCabinetTexture);
                } else if (currentAttachedCabinetTexture) {
                    applyCabinetTexture(selectedObject, targetMat, currentAttachedCabinetTexture);
                }
            } else if (group === 'double' && currentDoubleAttachedCabinetTexture) {
                applyCabinetTexture(selectedObject, targetMat, currentDoubleAttachedCabinetTexture);
          } else if (group === 'room-floor' && currentFloorTexturePath) {
                applyPathToCabinetMaterial(selectedObject, currentFloorTexturePath, 'room-floor');
            } else if (group === 'room-wall' && currentWallTexturePath) {
                applyPathToCabinetMaterial(selectedObject, currentWallTexturePath, 'room-wall');
            }
        }
        
        // إخفاء القائمة بعد الاختيار
        ftColorMenu.classList.remove('show');
    });
});

// 5. زر نسخ العنصر (تكرار)
const ftDuplicateBtn = document.getElementById('ft-duplicate-btn');

ftDuplicateBtn?.addEventListener('click', () => {
    if (!selectedObject) return;

    // 1. استنساخ العنصر (Clone)
    const cloneGroup = selectedObject.clone();

    // 2. الاستنساخ العميق للخامات (Materials Deep Clone)
    cloneGroup.traverse((child) => {
        if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
                child.material = child.material.map(m => m.clone());
            } else {
                child.material = child.material.clone();
            }
        }
    });

    // 3. نسخ البيانات الوصفية (UserData) لضمان حفظ العنصر وتعديل قياساته
    cloneGroup.userData = { ...selectedObject.userData };
    if (selectedObject.userData.originalDimensions) {
        cloneGroup.userData.originalDimensions = { ...selectedObject.userData.originalDimensions };
    }
    delete cloneGroup.userData.previousPosition;
    delete cloneGroup.userData.previousRotation;
    delete cloneGroup.userData.previousScale;

    // ==========================================
    // 4. التعديل الجديد: وضع العنصر في وسط المشهد
    // ==========================================
    // نضع X و Z على صفر (المنتصف)، ونحافظ على الارتفاع Y من العنصر الأصلي
    cloneGroup.position.set(0, selectedObject.position.y, 0); 
    
    // إعادة تعيين الدوران ليكون الافتراضي (مثل الكابينة الجديدة)
    cloneGroup.rotation.set(0, 0, 0);
    cloneGroup.updateMatrixWorld();

    // توجيه العنصر نحو أقرب حائط (الدالة المسؤولة عن دوران العناصر الجديدة)
    autoAlignToNearestWall(cloneGroup, true);

    // 5. إضافة العنصر الجديد للمشهد
    scene.add(cloneGroup);

    // 6. تطبيق نظام التصادم والمحاذاة
    if (snappingAndCollisionEnabled) {
        applyObjectSnappingAndPreventCollision(cloneGroup);
    }

    // 7. نقل التحديد (Selection) تلقائياً إلى العنصر المنسوخ
    selectedObject = cloneGroup;
    selectedWall = null;
    
    // تحديث واجهة المستخدم
    updateDeleteButtonState();
    updateTransformButtonsState();
    
    // تحديث موقع الشريط العائم ليكون فوق العنصر المنسوخ في المنتصف
    if (typeof updateFloatingToolbarPosition === 'function') {
        updateFloatingToolbarPosition();
    }
});

// --- Cabinet Dimensions ---
function showDimensionsPopup(cabinet) {
    cabinetBeingEdited = cabinet;
    let currentDimensions = cabinet.userData.originalDimensions;
    if (!currentDimensions) {
        const bbox = new THREE.Box3().setFromObject(cabinet);
        const size = bbox.getSize(new THREE.Vector3());
        currentDimensions = {
            width: Math.round(size.x * 100),
            depth: Math.round(size.z * 100),
            height: Math.round(size.y * 100)
        };
        cabinet.userData.originalDimensions = currentDimensions;
    }
    cabinetWidthInput.value = currentDimensions.width;
    cabinetDepthInput.value = currentDimensions.depth;
    cabinetHeightInput.value = currentDimensions.height;
    // --- الأسطر الجديدة لتصفير مربعات الحركة ---
    const moveXInput = document.getElementById('move-x');
    const moveZInput = document.getElementById('move-z');
    if(moveXInput) moveXInput.value = "0";
    if(moveZInput) moveZInput.value = "0";
    // ------------------------------------------


    dimensionsPopup.style.display = 'block';
    cabinetWidthInput.focus();
}

function hideDimensionsPopup() {
    dimensionsPopup.style.display = 'none';
    cabinetBeingEdited = null;
}

function showSceneTextScalePopup(group) {
    if (!group || group.name !== 'scene-text' || !sceneTextScalePopup || !sceneTextScaleInput) return;
    sceneTextScaleEditing = group;
    const pct = Math.round((group.scale?.x || 1) * 100);
    sceneTextScaleInput.value = String(THREE.MathUtils.clamp(pct, 15, 400));
    sceneTextScalePopup.style.display = 'block';
    sceneTextScaleInput.focus();
}

function hideSceneTextScalePopup() {
    if (sceneTextScalePopup) sceneTextScalePopup.style.display = 'none';
    sceneTextScaleEditing = null;
}

function applySceneTextScale() {
    if (!sceneTextScaleEditing || !sceneTextScaleInput) return;
    let pct = parseFloat(sceneTextScaleInput.value);
    if (isNaN(pct)) pct = 100;
    pct = THREE.MathUtils.clamp(pct, 15, 400);
    sceneTextScaleEditing.userData.previousScale = sceneTextScaleEditing.scale.clone();
    saveUndoState('scale', sceneTextScaleEditing);
    const s = pct / 100;
    sceneTextScaleEditing.scale.setScalar(s);
    sceneTextScaleEditing.userData.sceneTextScale = s;
    sceneTextScaleEditing.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sceneTextScaleEditing);
    const sz = box.getSize(new THREE.Vector3());
    sceneTextScaleEditing.userData.originalDimensions = {
        width: Math.round(sz.x * 100),
        depth: Math.round(sz.z * 100),
        height: Math.round(sz.y * 100),
    };
    hideSceneTextScalePopup();
}

applySceneTextScaleBtn?.addEventListener('click', applySceneTextScale);
cancelSceneTextScaleBtn?.addEventListener('click', hideSceneTextScalePopup);

// دالة مساعدة لإسقاط خامة على شكل قطعة واحدة متصلة بدون تقطيع أو تمطط
function applyPlanarUVs(geometry) {
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    
    // 🌟 حساب العرض والعمق (لأن المجسم تم تدويره ليصبح مسطحاً على X و Z)
    const width = bbox.max.x - bbox.min.x;
    const depth = bbox.max.z - bbox.min.z;

    const posAttribute = geometry.attributes.position;
    const uvAttribute = geometry.attributes.uv;

    for (let i = 0; i < posAttribute.count; i++) {
        const x = posAttribute.getX(i);
        const z = posAttribute.getZ(i);
        
        // 🌟 توزيع الإحداثيات كنسبة مئوية (من 0 إلى 1) 
        // هذا يمنع ظهور خط الوسط (المربعات الـ 4) ويمنع التمطط تماماً
        const u = (x - bbox.min.x) / width;
        const v = (z - bbox.min.z) / depth;
        
        uvAttribute.setXY(i, u, v);
    }
    uvAttribute.needsUpdate = true;
}
// دالة لإعادة حساب الـ UV وجعل النقشة تتكرر بشكل متناسق بدلاً من التمطط
function fixTextureStretching(mesh) {
    if (mesh.userData.customUV) return;
    // 1. استنساخ الجيومتري حتى لا تتأثر باقي العناصر المشابهة في المشهد
    if (!mesh.userData.isUVFixed) {
        mesh.geometry = mesh.geometry.clone();
        mesh.userData.isUVFixed = true;
    }

    const geometry = mesh.geometry;
    if (!geometry.attributes.position || !geometry.attributes.uv || !geometry.attributes.normal) return;

    const posAttribute = geometry.attributes.position;
    const uvAttribute = geometry.attributes.uv;
    const normalAttribute = geometry.attributes.normal;

    // 2. الحصول على المقياس الحقيقي للعنصر
    const worldScale = new THREE.Vector3();
    mesh.getWorldScale(worldScale);

    // 3. معامل تكرار النقشة 
    // (إذا لاحظت أن النقشة تظهر صغيرة جداً أو كبيرة، يمكنك تغيير الرقم مثلاً إلى 0.5 أو 2.0)
    const textureScale = 1.0; 

    // 4. إعادة حساب الـ UV لكل نقطة بناءً على موقعها الفيزيائي الجديد وحجمها
    for (let i = 0; i < posAttribute.count; i++) {
        // حساب الأبعاد الحقيقية
        const x = posAttribute.getX(i) * worldScale.x * textureScale;
        const y = posAttribute.getY(i) * worldScale.y * textureScale;
        const z = posAttribute.getZ(i) * worldScale.z * textureScale;

        // تحديد اتجاه الوجه (Normal) لمعرفة أي جانب نحن فيه
        const nx = Math.abs(normalAttribute.getX(i));
        const ny = Math.abs(normalAttribute.getY(i));
        const nz = Math.abs(normalAttribute.getZ(i));

        let u, v;

        // الإسقاط الصندوقي (Box Projection)
        if (nx > ny && nx > nz) { 
            // الجوانب (يمين/يسار)
            u = z;
            v = y;
        } else if (ny > nx && ny > nz) { 
            // الأعلى/الأسفل
            u = x;
            v = z;
        } else { 
            // الأمام/الخلف
            u = x;
            v = y;
        }

        uvAttribute.setXY(i, u, v);
    }

    uvAttribute.needsUpdate = true;
}

function applyCabinetDimensions() {
    if (!cabinetBeingEdited) return;
    
    // حفظ الحالة قبل التعديل
    cabinetBeingEdited.userData.previousScale = cabinetBeingEdited.scale.clone();
    cabinetBeingEdited.userData.previousDimensions = cabinetBeingEdited.userData.originalDimensions ? 
        {...cabinetBeingEdited.userData.originalDimensions} : null;
    saveUndoState('dimensions', cabinetBeingEdited);
    
// 1. قراءة القيم الجديدة من الحقول بطريقة آمنة تقبل الرقم 0
    const valW = parseFloat(cabinetWidthInput.value);
    const newWidth = isNaN(valW) ? 60 : valW;

    const valD = parseFloat(cabinetDepthInput.value);
    const newDepth = isNaN(valD) ? 60 : valD;

    const valH = parseFloat(cabinetHeightInput.value);
    const newHeight = isNaN(valH) ? 80 : valH;
    // 2. تحديث البيانات الوصفية للكابينة
    cabinetBeingEdited.userData.originalDimensions = {
        width: newWidth,
        depth: newDepth,
        height: newHeight
    };

    // 3. حفظ الدوران الحالي ثم تصفيره للحسابات الدقيقة
    const currentRotation = cabinetBeingEdited.rotation.clone();
    cabinetBeingEdited.rotation.set(0, 0, 0);
    cabinetBeingEdited.updateMatrixWorld();

    // 4. حساب الحجم الحالي للكابينة (وهي بوضع مستقيم)
    const bbox = new THREE.Box3().setFromObject(cabinetBeingEdited);
    const currentSize = bbox.getSize(new THREE.Vector3());
// 5. حساب نسبة التكبير (Delta Scale) مع تجاهل أخطاء التقريب البسيطة
    const targetW = newWidth / 100;
    const targetH = newHeight / 100;
    const targetD = newDepth / 100;

    const scaleX = (currentSize.x !== 0 && Math.abs(currentSize.x - targetW) > 0.006) ? (targetW / currentSize.x) : 1;
    const scaleY = (currentSize.y !== 0 && Math.abs(currentSize.y - targetH) > 0.006) ? (targetH / currentSize.y) : 1;
    const scaleZ = (currentSize.z !== 0 && Math.abs(currentSize.z - targetD) > 0.006) ? (targetD / currentSize.z) : 1;
    // 6. تطبيق التكبير على الكابينة الرئيسية 
    cabinetBeingEdited.scale.multiply(new THREE.Vector3(scaleX, scaleY, scaleZ));

    // --- إضافة لمنع تمطط الستربات البرمجية ---
    if (cabinetBeingEdited.userData.modelPath === 'PROCEDURAL_SLAT') {
        cabinetBeingEdited.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose(); // مسح الشكل القديم
                child.geometry = createProceduralSlatGeometry(newWidth, newHeight); // رسم شكل جديد بعدد ستربات أكثر
            }
        });
        // إجبار المقياس (Scale) على 1 للطول والعرض، حتى لا يتمطط الشكل الجديد إطلاقاً
        cabinetBeingEdited.scale.set(1, 1, scaleZ);
    }
    // --- نهاية إضافة الستربات ---

    // تحديث مصفوفة العالم أولاً لضمان دقة الحسابات
    cabinetBeingEdited.updateMatrixWorld(true);

    // التحقق مما إذا كان العنصر هو "دنكة" أو "MDF" لتطبيق إصلاح الـ UV عليه
    const modelPathForUV = cabinetBeingEdited.userData.modelPath || '';
    const isDinkaOrMdf = modelPathForUV.includes('dinka.glb') || modelPathForUV.includes('mdf.glb');

    if (isDinkaOrMdf) {
        cabinetBeingEdited.traverse((child) => {
            if (child.isMesh) {
                fixTextureStretching(child);
            }
        });
    }

    // =========================================================
    // ⚡ التحقق من استثناء الأبواب المستقلة ⚡
    // =========================================================
   const modelPath = cabinetBeingEdited.userData.modelPath || '';
    
    // هذا الشرط راح يشمل أي ملف بداخل مجلد الأجهزة أو الاكسسوارات
    const isApplianceOrAccessory = modelPath.includes('appliances/') || 
                                   modelPath.includes('accessories_vatrena/');

    const isStandaloneDoor = modelPath.includes('door.glb') || 
                             modelPath.includes('door1.glb') || 
                             modelPath.includes('door2.glb') ||
                             modelPath.includes('window1.glb') ||
                             modelPath.includes('window2.glb') ||
                             isApplianceOrAccessory; // ⚡ ضفنا الاستثناء الشامل هنا


    // نطبق كود منع المط المعقد *فقط* إذا لم يكن العنصر باباً مستقلاً
    if (!isStandaloneDoor) {
        
        // حساب النسبة العكسية
        const invX = scaleX !== 0 ? 1 / scaleX : 1;
        const invY = scaleY !== 0 ? 1 / scaleY : 1;
        const invZ = scaleZ !== 0 ? 1 / scaleZ : 1;
        
        const parentInvScale = new THREE.Vector3(invX, invY, invZ);

        cabinetBeingEdited.traverse((child) => {
            if (child.isMesh) {
                let shouldStretch = false;
                
                // 1. قائمة الخامات اللي "ممنوع" تتمدد (اليدات والأرجل) 
                const fixedMaterials = [
                    'leg', 'foot', 'handle', 'knob', 'm_20', 'polished_aluminum' 
                ];

               // 2. قائمة الخامات اللي "مسموح" تتمدد (الخشب والأبواب والزجاج والسنك)
const stretchableMaterials = [
    'ground', 'up', 'glass', 'door_fabric_chrome', 'alaminum', 'alamnium', 'Material__26', 'black', 'dark', 'sink'
];

                const materials = Array.isArray(child.material) ? child.material : [child.material];
                for (let mat of materials) {
                    if (mat && mat.name) {
                        const name = mat.name.toLowerCase();
                        
                        if (fixedMaterials.some(fixedName => name.includes(fixedName))) {
                            shouldStretch = false; 
                            break; 
                        }

                        if (stretchableMaterials.some(allowedName => name.includes(allowedName))) {
                            shouldStretch = true; 
                        }
                    }
                }

                // إذا كان العنصر يده، أو رجل، أو جهاز:
                if (!shouldStretch) {
                    const worldQuat = new THREE.Quaternion();
                    child.getWorldQuaternion(worldQuat);

                    const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat);
                    const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat);
                    const zAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat);

                    const absX = new THREE.Vector3(Math.round(Math.abs(xAxis.x)), Math.round(Math.abs(xAxis.y)), Math.round(Math.abs(xAxis.z)));
                    const absY = new THREE.Vector3(Math.round(Math.abs(yAxis.x)), Math.round(Math.abs(yAxis.y)), Math.round(Math.abs(yAxis.z)));
                    const absZ = new THREE.Vector3(Math.round(Math.abs(zAxis.x)), Math.round(Math.abs(zAxis.y)), Math.round(Math.abs(zAxis.z)));

                    const localInvX = parentInvScale.x * absX.x + parentInvScale.y * absX.y + parentInvScale.z * absX.z;
                    const localInvY = parentInvScale.x * absY.x + parentInvScale.y * absY.y + parentInvScale.z * absY.z;
                    const localInvZ = parentInvScale.x * absZ.x + parentInvScale.y * absZ.y + parentInvScale.z * absZ.z;

                    child.scale.multiply(new THREE.Vector3(
                        localInvX !== 0 ? localInvX : 1,
                        localInvY !== 0 ? localInvY : 1,
                        localInvZ !== 0 ? localInvZ : 1
                    ));
                }
            }
        });
    }
    // =========================================================

    // 7. استعادة الدوران السابق
    cabinetBeingEdited.rotation.copy(currentRotation);
    cabinetBeingEdited.updateMatrixWorld();
    // =========================================================
    // ⚡ الكود الجديد: تطبيق الإزاحة (الحركة) بناءً على اتجاه الوجه ⚡
    // =========================================================
    const moveXInput = document.getElementById('move-x');
    const moveZInput = document.getElementById('move-z');
    
    const moveX_cm = parseFloat(moveXInput ? moveXInput.value : 0);
    const moveZ_cm = parseFloat(moveZInput ? moveZInput.value : 0);

    const moveX_m = (isNaN(moveX_cm) ? 0 : moveX_cm) / 100;
    const moveZ_m = (isNaN(moveZ_cm) ? 0 : moveZ_cm) / 100;

    if (moveX_m !== 0 || moveZ_m !== 0) {
        // الدالة translateX و translateZ في Three.js تقوم بالتحريك "المحلي" 
        // أي أنها تحترم دوران العنصر الحالي وتتحرك بناءً عليه (يمينه/يساره، أمامه/خلفه)
        cabinetBeingEdited.translateX(moveX_m);
        // تم عكس إشارة Z لأن في Three.js السالب هو الأمام والموجب هو الخلف
        cabinetBeingEdited.translateZ(-moveZ_m); 
        
        cabinetBeingEdited.updateMatrixWorld(true);
    }
    // =========================================================

    // 8. تعديل الموقع لضمان عدم الغرق تحت الأرض
    const newBbox = new THREE.Box3().setFromObject(cabinetBeingEdited);
    const newBottom = newBbox.min.y;

    if (cabinetBeingEdited.name === 'floor-cabinet' || cabinetBeingEdited.name === 'pantry-cabinet') {
        if (newBottom < -0.01) {
            cabinetBeingEdited.position.y += Math.abs(newBottom);
        }
    }

    // 9. إنهاء العملية
    hideDimensionsPopup();
    if (snappingAndCollisionEnabled) {
        applyObjectSnappingAndPreventCollision(cabinetBeingEdited);
    }
}

applyDimensionsBtn?.addEventListener('click', applyCabinetDimensions);
cancelDimensionsBtn?.addEventListener('click', hideDimensionsPopup);


// --- Room Dimensions ---
function showRoomDimensionsPopup() {
    newRoomLengthInput.value = currentRoomLength;
    newRoomWidthInput.value = currentRoomWidth;
    newRoomHeightInput.value = currentRoomHeight;
    roomDimensionsPopup.style.display = 'block';
}

function hideRoomDimensionsPopup() { roomDimensionsPopup.style.display = 'none'; }

function applyNewRoomDimensions() {
    const newLength = parseFloat(newRoomLengthInput.value);
    const newWidth = parseFloat(newRoomWidthInput.value);
    const newHeight = parseFloat(newRoomHeightInput.value); // قراءة الارتفاع
    
    // 🔴 التعديل هنا: أضفنا التحقق من الارتفاع (newHeight) لضمان عدم حدوث خطأ
    if (isNaN(newLength) || isNaN(newWidth) || isNaN(newHeight) || newLength < 100 || newWidth < 100 || newHeight < 200) {
        alert('الرجاء إدخال أبعاد صالحة (الارتفاع يجب أن يكون 200 سم على الأقل).');
        return;
    }
    
    currentRoomLength = newLength;
    currentRoomWidth = newWidth;
    currentRoomHeight = newHeight; // تحديث الارتفاع
    
    createFloorAndWalls(currentRoomLength, currentRoomWidth);
    hideRoomDimensionsPopup();
}

editRoomDimensionsBtn?.addEventListener('click', showRoomDimensionsPopup);
applyRoomDimensionsBtn?.addEventListener('click', applyNewRoomDimensions);
cancelRoomDimensionsBtn?.addEventListener('click', hideRoomDimensionsPopup);

// =========================================================
// وظيفة الإضافة التلقائية لسطح المرمر
// =========================================================
const addBaseboardBtn = document.getElementById('addBaseboardBtn');
const deleteBaseboardBtn = document.getElementById('deleteBaseboardBtn');

function autoGenerateBaseboards() {
    const oldBaseboards = scene.children.filter(c => c.name === 'baseboard');
    oldBaseboards.forEach(bb => {
        scene.remove(bb);
        bb.traverse(child => {
            if(child.isMesh) {
                child.geometry?.dispose?.();
                if(Array.isArray(child.material)) child.material.forEach(m => m?.dispose?.());
                else child.material?.dispose?.();
            }
        });
    });

    const floorCabs = scene.children.filter(obj => {
        if (obj.name === 'floor-cabinet' || obj.name === 'pantry-cabinet') {
            const path = (obj.userData.modelPath || '').toLowerCase();
            const excludeWords = ['dishwasher', 'clotheswasher', 'revrgrator', 'stove', 'airconditon', 'brad', 'procedural_slat', 'door', 'window', 'table', 'dinka', 'mdf', 'mini', 'accessories'];
            if (excludeWords.some(word => path.includes(word))) return false;
            return true;
        }
        return false;
    });

    let generatedCount = 0;
    const BB_HEIGHT = 0.10; 
    const BB_DEPTH = 0.40;

    floorCabs.forEach(cab => {
        const path = (cab.userData.modelPath || '').toLowerCase();
        
        let w = 0; let d = 0.60; 
        if (cab.userData.originalDimensions) {
            w = cab.userData.originalDimensions.width / 100;
            d = cab.userData.originalDimensions.depth / 100;
        } else {
            const bbox = new THREE.Box3().setFromObject(cab);
            const size = new THREE.Vector3(); 
            bbox.getSize(size);
            w = size.x; d = size.z;
        }

        const bbGroup = new THREE.Group();
        bbGroup.name = 'baseboard';
        bbGroup.userData.customColorGroup = 'floor-cabinet';
        bbGroup.userData.baseboardType = 'auto';
        bbGroup.userData.autoPath = path;
        bbGroup.userData.autoW = w;
        bbGroup.userData.autoD = d;
// 🌟 استنساخ نقي للموقع والدوران
        bbGroup.position.copy(cab.position); 
        bbGroup.rotation.copy(cab.rotation);
        
        // 🌟 الحل الجذري: أخذ إشارة المقياس فقط لضمان دقة القياس والانعكاس
        bbGroup.scale.set(
            Math.sign(cab.scale.x) || 1, 
            Math.sign(cab.scale.y) || 1, 
            Math.sign(cab.scale.z) || 1
        );

        const isPentagon = path.includes('corner45') || path.includes('larder/90.glb');
        const isCornerL = (path.includes('corner') && !path.includes('corner110') && !path.includes('corner45')) || path.includes('larder/90ll.glb');
        
      if (path.includes('au45') || path.includes('lu50')) {
            const shape = new THREE.Shape();
            const recess = 0.04; 
            const curveWeight = 0.75; 
            const frontZ = d/2 - recess;  
            const leftX = -w/2 + recess;  
            
            // 🌟 رسم الإزارة لليسار
            shape.moveTo(w/2, -d/2);
            shape.lineTo(w/2, frontZ);
            
            const cp1X = w/2 - (w - recess) * curveWeight;
            const cp1Y = frontZ;
            const cp2X = leftX;
            const cp2Y = -d/2 + (d - recess) * curveWeight;
            
            shape.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, leftX, -d/2);
            shape.lineTo(w/2, -d/2);
            
            const extrudeSettings = { depth: BB_HEIGHT, bevelEnabled: false };
            const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            geom.rotateX(Math.PI / 2); geom.translate(0, BB_HEIGHT / 2, 0);

            const material = new THREE.MeshStandardMaterial({ color: 0xcccccc }); material.name = 'ground';
            const mesh = new THREE.Mesh(geom, material); mesh.castShadow = true; mesh.receiveShadow = true;
            bbGroup.add(mesh);
            
        } else if (path.includes('au110')) {
            const shape = new THREE.Shape();
            shape.moveTo(-w/2, -d/2);
            shape.lineTo(w/2, -d/2);
            const frontZ = -d/2 + BB_DEPTH;
            shape.quadraticCurveTo(w/2, frontZ, -w/2, frontZ);
            shape.lineTo(-w/2, -d/2);
            
            const geom = new THREE.ExtrudeGeometry(shape, { depth: BB_HEIGHT, bevelEnabled: false });
            geom.rotateX(Math.PI / 2); geom.translate(0, BB_HEIGHT / 2, 0);

            const material = new THREE.MeshStandardMaterial({ color: 0xcccccc }); material.name = 'ground';
            const mesh = new THREE.Mesh(geom, material); mesh.castShadow = true; mesh.receiveShadow = true;
            bbGroup.add(mesh);
            
        } else if (isPentagon) {
            const shape = new THREE.Shape();
            shape.moveTo(-w/2, -d/2); shape.lineTo(w/2, -d/2); shape.lineTo(w/2, -d/2 + BB_DEPTH);
            shape.lineTo(-w/2 + BB_DEPTH, d/2); shape.lineTo(-w/2, d/2); shape.lineTo(-w/2, -d/2);
            
            const geom = new THREE.ExtrudeGeometry(shape, { depth: BB_HEIGHT, bevelEnabled: false });
            geom.rotateX(Math.PI / 2); geom.translate(0, BB_HEIGHT / 2, 0);
            geom.rotateY(-Math.PI / 2); // 🌟 تدوير داخلي

            const material = new THREE.MeshStandardMaterial({ color: 0xcccccc }); material.name = 'ground';
            const mesh = new THREE.Mesh(geom, material); mesh.castShadow = true; mesh.receiveShadow = true;
            bbGroup.add(mesh);

        } else if (isCornerL) {
            const innerGroup = new THREE.Group();
            const backGeom = new THREE.BoxGeometry(w, BB_HEIGHT, BB_DEPTH);
            const backMat = new THREE.MeshStandardMaterial({ color: 0xcccccc }); backMat.name = 'ground';
            const backMesh = new THREE.Mesh(backGeom, backMat);
            backMesh.castShadow = true; backMesh.receiveShadow = true;
            backMesh.position.set(0, 0, -d/2 + BB_DEPTH/2); 

            const sideLength = d - BB_DEPTH;
            if (sideLength > 0) {
                const sideGeom = new THREE.BoxGeometry(BB_DEPTH, BB_HEIGHT, sideLength);
                const sideMat = new THREE.MeshStandardMaterial({ color: 0xcccccc }); sideMat.name = 'ground';
                // ⚠️ هنا كان الخطأ، وتم إضافة THREE. قبل الـ Mesh
                const sideMesh = new THREE.Mesh(sideGeom, sideMat); 
                sideMesh.castShadow = true; sideMesh.receiveShadow = true;
                sideMesh.position.set(-w/2 + BB_DEPTH/2, 0, BB_DEPTH/2); 
                innerGroup.add(sideMesh);
            }
            innerGroup.add(backMesh);
            innerGroup.rotation.y = -Math.PI / 2; // 🌟 تدوير داخلي
            bbGroup.add(innerGroup);

        } else {
            const geom = new THREE.BoxGeometry(w, BB_HEIGHT, BB_DEPTH);
            const material = new THREE.MeshStandardMaterial({ color: 0xcccccc }); material.name = 'ground';
            const mesh = new THREE.Mesh(geom, material); mesh.castShadow = true; mesh.receiveShadow = true;
            const zOffset = (BB_DEPTH - d) / 2;
            mesh.position.set(0, 0, zOffset); 
            bbGroup.add(mesh);
        }

        applyTextureToMaterial(bbGroup, 'ground', currentFloorCabinetTexture || DEFAULT_FLOOR_CABINET_TEXTURE);
        bbGroup.traverse((child) => { if (child.isMesh) fixTextureStretching(child); });
        bbGroup.position.y = BB_HEIGHT / 2; 
        scene.add(bbGroup);
        generatedCount++;
    });

    if (generatedCount > 0) {
        updateDeleteButtonState(); updateTransformButtonsState(); updateSelectionIndicator();
    }
}
// دالة حذف جميع الإزارات
function deleteAllBaseboards() {
    const oldBaseboards = scene.children.filter(c => c.name === 'baseboard');
    if (oldBaseboards.length === 0) {
        alert('لا توجد إزارة في التصميم لحذفها.');
        return;
    }

    oldBaseboards.forEach(bb => {
        scene.remove(bb);
        bb.traverse(child => {
            if(child.isMesh) {
                child.geometry?.dispose?.();
                if(Array.isArray(child.material)) child.material.forEach(m => m?.dispose?.());
                else child.material?.dispose?.();
            }
        });
    });

    if (selectedObject && selectedObject.name === 'baseboard') {
        selectedObject = null;
        updateDeleteButtonState();
        updateTransformButtonsState();
        updateSelectionIndicator();
    }
}

// ربط الأزرار بالدوال
// زر إضافة إزارة
addBaseboardBtn?.addEventListener('click', () => {
    if (window.isGuestUser) { document.getElementById('guestRestrictedModal').style.display = 'flex'; return; }
    autoGenerateBaseboards();
});
deleteBaseboardBtn?.addEventListener('click', deleteAllBaseboards);

function autoGenerateCountertops() {
    const oldTops = scene.children.filter(c => c.name === 'countertop');
    oldTops.forEach(ct => {
        scene.remove(ct);
        ct.traverse(child => {
            if(child.isMesh) {
                child.geometry?.dispose?.();
                if(Array.isArray(child.material)) child.material.forEach(m => m?.dispose?.());
                else child.material?.dispose?.();
            }
        });
    });

    const floorCabs = scene.children.filter(obj => {
        if (obj.name === 'floor-cabinet') return true;
        if (obj.name === 'appliance') {
            const path = (obj.userData.modelPath || '').toLowerCase();
            if (path.includes('dishwasher') || path.includes('clotheswasher')) return true;
        }
        return false;
    });
    
    let generatedCount = 0;

    floorCabs.forEach(cab => {
        const path = (cab.userData.modelPath || '').toLowerCase();
        const excludeWords = ['revrgrator', 'revrgrator90', 'airconditon', 'brad', 'mixer', 'acce', 'window', 'door', 'table', 'stove', 'mini', 'mdf', 'tv', 'tvleg', 'microwave', 'dvr', 'hood', 'procedural_slat'];
        if (excludeWords.some(word => path.includes(word))) return;
        
        const bbox = new THREE.Box3().setFromObject(cab);
        const size = new THREE.Vector3(); 
        bbox.getSize(size);
        if (size.y > 1.4) return;

        let w = size.x;
        let d = size.z;
        if (cab.userData.originalDimensions) {
            w = cab.userData.originalDimensions.width / 100;
            d = cab.userData.originalDimensions.depth / 100;
        }

        const ctGroup = new THREE.Group();
        ctGroup.name = 'countertop';
        ctGroup.userData.countertopType = 'auto';
        ctGroup.userData.autoPath = path;
        ctGroup.userData.autoW = w;
        ctGroup.userData.autoD = d;

        ctGroup.position.copy(cab.position);
        ctGroup.rotation.copy(cab.rotation);
        
        ctGroup.scale.set(
            Math.sign(cab.scale.x) || 1, 
            Math.sign(cab.scale.y) || 1, 
            Math.sign(cab.scale.z) || 1
        );

        if (path.includes('au45')) {
            const extrudeSettings = { depth: CT_THICK_M, bevelEnabled: false };
            const shape = new THREE.Shape();
            const oh = 0.04; 
            const curveWeight = 0.75; 
            
            shape.moveTo(w/2, -d/2);
            shape.lineTo(w/2, d/2);  
            
            const cp1X = w/2 - (w + oh) * curveWeight;
            const cp1Y = d/2 + oh;
            const cp2X = -w/2 - oh;
            const cp2Y = -d/2 + (d + oh) * curveWeight;
            
            shape.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, -w/2 - oh, -d/2); 
            shape.lineTo(w/2, -d/2);

            const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            geom.rotateX(Math.PI / 2);
            geom.translate(0, CT_THICK_M / 2, 0);
            
            applyPlanarUVs(geom);

            const material = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
            material.name = 'countertop';
            const mesh = new THREE.Mesh(geom, material);
            mesh.castShadow = true; mesh.receiveShadow = true;
            mesh.userData.customUV = true; 
            ctGroup.add(mesh);

        } else if (path.includes('corner45')) {
            const ctDepth = CT_DEPTH_M;
            const shape = new THREE.Shape();
            shape.moveTo(-w/2, -d/2);
            shape.lineTo(w/2, -d/2);
            shape.lineTo(w/2, -d/2 + ctDepth);
            shape.lineTo(-w/2 + ctDepth, d/2);
            shape.lineTo(-w/2, d/2);
            shape.lineTo(-w/2, -d/2);

            const extrudeSettings = { depth: CT_THICK_M, bevelEnabled: false };
            const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            
            geom.rotateX(Math.PI / 2);
            geom.translate(0, CT_THICK_M / 2, 0);
            geom.rotateY(-Math.PI / 2); 
            
            applyPlanarUVs(geom); // 🌟 تطبيق الـ UV

            const material = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
            material.name = 'countertop';
            const mesh = new THREE.Mesh(geom, material);
            mesh.castShadow = true; mesh.receiveShadow = true;
            mesh.userData.customUV = true; // 🌟 حماية من المط
            ctGroup.add(mesh);

        } else if (path.includes('corner') && !path.includes('corner110')) {
            const innerGroup = new THREE.Group(); 
            const ctDepth = CT_DEPTH_M; 
            
            const backGeom = new THREE.BoxGeometry(w, CT_THICK_M, ctDepth);
            applyPlanarUVs(backGeom); // 🌟 تطبيق الـ UV
            const backMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
            backMat.name = 'countertop';
            const backMesh = new THREE.Mesh(backGeom, backMat);
            backMesh.castShadow = true; backMesh.receiveShadow = true;
            backMesh.position.set(0, 0, -d/2 + ctDepth/2); 
            backMesh.userData.customUV = true; // 🌟 حماية من المط

            const sideLength = d - ctDepth;
            if (sideLength > 0) {
                const sideGeom = new THREE.BoxGeometry(ctDepth, CT_THICK_M, sideLength);
                applyPlanarUVs(sideGeom); // 🌟 تطبيق الـ UV
                const sideMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
                sideMat.name = 'countertop';
                const sideMesh = new THREE.Mesh(sideGeom, sideMat);
                sideMesh.castShadow = true; sideMesh.receiveShadow = true;
                sideMesh.position.set(-w/2 + ctDepth/2, 0, ctDepth/2); 
                sideMesh.userData.customUV = true; // 🌟 حماية من المط
                innerGroup.add(sideMesh);
            }
            innerGroup.add(backMesh);
            innerGroup.rotation.y = -Math.PI / 2; 
            ctGroup.add(innerGroup);

        } else {
            const fixedDepth = CT_DEPTH_M; 
            const geom = new THREE.BoxGeometry(w, CT_THICK_M, fixedDepth);
            applyPlanarUVs(geom); // 🌟 تطبيق الـ UV
            const material = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
            material.name = 'countertop';
            const mesh = new THREE.Mesh(geom, material);
            mesh.castShadow = true; mesh.receiveShadow = true;
            mesh.userData.customUV = true; // 🌟 حماية من المط
            
            const zOffset = (fixedDepth - d) / 2;
            mesh.position.set(0, 0, zOffset); 
            ctGroup.add(mesh);
        }

        if (currentCountertopTexture) applyTextureToMaterial(ctGroup, 'countertop', currentCountertopTexture);
        ctGroup.traverse((child) => { if (child.isMesh) fixTextureStretching(child); });
        ctGroup.position.y = CT_CENTER_Y; 
        scene.add(ctGroup);
        generatedCount++;
    });

    if (generatedCount > 0) {
        updateDeleteButtonState(); updateTransformButtonsState(); updateSelectionIndicator();
    }
}

// --- Collapsible Headers ---
document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', function () {
        this.classList.toggle('active');
        const content = this.nextElementSibling;
        content.classList.toggle('show');
    });
});

/* =========================================================================
   WebView2 Scroll Fix
   يحل مشكلة تعارض أحداث الـ wheel بين القائمة الجانبية ومحرك الـ 3D
   ========================================================================= */

// 1. تعطيل OrbitControls عند دخول الماوس للقائمة الجانبية
//    هذا يمنع تعطّل الـ Zoom بعد إغلاق القائمة
controlsPanel?.addEventListener('mouseenter', () => {
    controls.enabled = false;
});
controlsPanel?.addEventListener('mouseleave', () => {
    // لا نُعيد تفعيل Controls إذا كان المستخدم يسحب كابينة حالياً
    if (!isDragging) controls.enabled = true;
});

// 2. إصلاح Scroll في عناصر القائمة - يمنع تسرب الأحداث لـ canvas
function applyWebViewScrollFix(element) {
    if (element._wv2Fixed) return;
    element._wv2Fixed = true;

    element.addEventListener('wheel', (e) => {
        e.stopPropagation();

        // تطبيع قيمة deltaY حسب وحدة القياس (pixels / lines / pages)
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 40;       // WheelEvent.DOM_DELTA_LINE
        else if (e.deltaMode === 2) delta *= 800;  // WheelEvent.DOM_DELTA_PAGE

        const atBottom = element.scrollTop >= element.scrollHeight - element.clientHeight - 1;
        const atTop = element.scrollTop <= 0;
        const scrollingDown = delta > 0;
        const scrollingUp = delta < 0;

        if ((scrollingDown && !atBottom) || (scrollingUp && !atTop)) {
            element.scrollTop += delta;
        }

        e.preventDefault();
    }, { passive: false });
}

// تطبيق الإصلاح على .panel-content
document.querySelectorAll('.panel-content').forEach(applyWebViewScrollFix);

// تطبيق الإصلاح على .collapsible-content عند فتحها
const collapsibleObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        const el = mutation.target;
        if (el.classList.contains('collapsible-content') && el.classList.contains('show')) {
            applyWebViewScrollFix(el);
        }
    });
});

document.querySelectorAll('.collapsible-content').forEach((el) => {
    // تطبيق فوري إن كانت مفتوحة مسبقاً
    if (el.classList.contains('show')) applyWebViewScrollFix(el);
    // مراقبة التغييرات المستقبلية
    collapsibleObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
});

// --- Keyboard Events ---
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (dimensionsPopup.style.display === 'block') hideDimensionsPopup();
        if (sceneTextScalePopup?.style.display === 'block') hideSceneTextScalePopup();
        if (roomDimensionsPopup.style.display === 'block') hideRoomDimensionsPopup();
    }
});

// --- Save Image ---
saveImageBtn?.addEventListener('click', saveCanvasAsImage);

/* =========================================================================
   12. REPORTING SYSTEM
   ========================================================================= */
function generateReport() {
    const categories = {
        'floor-cabinet': { title: 'الخزائن الأرضية', items: [] },
        'attached-cabinet': { title: 'الخزائن المعلقة', items: [] },
        'double-attached-cabinet': { title: 'خزائن دبل ملحق', items: [] },
        'pantry-cabinet': { title: 'الخزائن الكنتورية', items: [] }
    };

    scene.traverse((obj) => {
        // نتحقق أولاً أن العنصر هو Group ومن التصنيفات المطلوبة
        if (obj.isGroup && categories[obj.name]) {
            
            let isRealCabinet = false;

            // فحص الأجسام داخل المجموعة للبحث عن خامة باسم ground أو up
            obj.traverse((child) => {
                if (child.isMesh && child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(m => {
                        const mName = (m.name || '').toLowerCase();
                        // إذا كانت الخزانة أرضية نبحث عن ground، وإذا معلقة نبحث عن up
                        if (mName.includes('ground') || mName.includes('up')) {
                            isRealCabinet = true;
                        }
                    });
                }
            });

            // إذا وجدنا الخامة المطلوبة، نعتبرها كابينة ونأخذ قياسها
            if (isRealCabinet) {
                let width = 0;
                if (obj.userData && obj.userData.originalDimensions) {
                    width = obj.userData.originalDimensions.width;
                } else {
                    const bbox = new THREE.Box3().setFromObject(obj);
                    const size = bbox.getSize(new THREE.Vector3());
                    width = Math.round(size.x * 100);
                }
                categories[obj.name].items.push(width);
            }
        }
    });

    // كود عرض النتائج في الـ Modal (يبقى كما هو)
    let htmlContent = '';
    let hasItems = false;
    for (const [key, category] of Object.entries(categories)) {
        if (category.items.length > 0) {
            hasItems = true;
            htmlContent += `
                <div class="report-section">
                    <h4>${category.title} (العدد: ${category.items.length})</h4>
                    <ul class="report-list">
                        ${category.items.map(w => `<li class="report-item">${w} سم</li>`).join('')}
                    </ul>
                </div>
            `;
        }
    }
    if (!hasItems) {
        htmlContent = '<p style="text-align:center; padding:20px;">لا توجد كابينات في التصميم حالياً.</p>';
    }
    document.getElementById('report-body').innerHTML = htmlContent;
}

reportBtn?.addEventListener('click', () => { generateReport(); reportModal.style.display = "block"; });
closeReportSpan?.addEventListener('click', () => { reportModal.style.display = "none"; });
window.addEventListener('click', (event) => { if (event.target == reportModal) { reportModal.style.display = "none"; } });
printReportBtn?.addEventListener('click', () => {
    const printContent = document.getElementById('report-body').innerHTML;
    const win = window.open('', '', 'height=700,width=700');
    win.document.write('<html><head><title>تقرير الكابينات</title>');
    win.document.write('<style>body{font-family: sans-serif; direction: rtl;} .report-list{display:flex; flex-wrap:wrap; gap:10px; list-style:none;} .report-item{border:1px solid #000; padding:5px; margin:2px;}</style>');
    win.document.write('</head><body>');
    win.document.write('<h2>تقرير قياسات الكابينات (العرض)</h2>');
    win.document.write(printContent);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
});

/* =========================================================================
   13. SAVE / LOAD SYSTEM
   ========================================================================= */
function serializeScene() {
    const sceneData = {
       room: {
           length: currentRoomLength,
           width: currentRoomWidth,
           height: currentRoomHeight,
           polygon: currentRoomPolygon ? currentRoomPolygon.map(p => ({ x: p.x, z: p.z })) : null
       },
       handlesVisible: handlesVisible,
        textures: {
            floor: currentFloorTexturePath,
            wall: currentWallTexturePath,
            floorCabinet: currentFloorCabinetTexture,
            attachedCabinet: currentAttachedCabinetTexture,
            doubleAttached: currentDoubleAttachedCabinetTexture,
            countertop: currentCountertopTexture
        },
        objects: [],
        wallsData: []
    };
    scene.children.forEach(obj => {
        if (obj.isGroup && (isCabinet(obj) || obj.name === 'countertop' || obj.name === 'baseboard' || obj.name === 'scene-text')) {
            sceneData.objects.push({
                name: obj.name,
                position: obj.position.clone(),
                rotation: obj.rotation.clone(),
                scale: obj.scale.clone(),
            userData: {
                    modelPath: obj.userData.modelPath,
                    originalDimensions: obj.userData.originalDimensions,
                    countertopType: obj.userData.countertopType,
                    countertopW: obj.userData.countertopW,
                    countertopX: obj.userData.countertopX,
                    countertopZ: obj.userData.countertopZ,
                    autoPath: obj.userData.autoPath,       // حفظ مسار المرمر التلقائي
                    autoW: obj.userData.autoW,             // حفظ عرض المرمر التلقائي
                    autoD: obj.userData.autoD,   
                    baseboardType: obj.userData.baseboardType,          // حفظ عمق المرمر التلقائي
                    customColorGroup: obj.userData.customColorGroup, // حفظ اللون المخصص
                    receptionMeshYawPI: obj.userData.receptionMeshYawPI === true ? true : undefined,
                    sceneTextPayload: obj.userData.sceneTextPayload ? { ...obj.userData.sceneTextPayload } : undefined,
                    sceneTextScale: obj.name === 'scene-text' ? (obj.scale?.x ?? 1) : undefined
                }
            });
        }
    });
    walls.forEach((wall, index) => {
        sceneData.wallsData.push({
            index: index,
            holes: wall.userData.holes || []
        });
    });
    return JSON.stringify(sceneData);
}

function clearScene() {
    const toRemove = [];
    scene.children.forEach(child => {
        if (child.isGroup && (isCabinet(child) || child.name === 'countertop' || child.name === 'baseboard' || child.name === 'scene-text')) {
            toRemove.push(child);
        }
    });
    toRemove.forEach(child => {
        scene.remove(child);
    });
}

function rebuildAutoCountertop(path, w, d) {
    const ctGroup = new THREE.Group();
    ctGroup.name = 'countertop';
    ctGroup.userData.customColorGroup = 'countertop';
    ctGroup.userData.countertopType = 'auto';
    ctGroup.userData.autoPath = path;
    ctGroup.userData.autoW = w;
    ctGroup.userData.autoD = d;
    const CT_THICK_M = 0.04; 

    if (path.includes('corner45')) {
        const shape = new THREE.Shape();
        shape.moveTo(-w/2, -d/2); shape.lineTo(w/2, -d/2); shape.lineTo(w/2, -d/2 + 0.60);
        shape.lineTo(-w/2 + 0.60, d/2); shape.lineTo(-w/2, d/2); shape.lineTo(-w/2, -d/2);
        const geom = new THREE.ExtrudeGeometry(shape, { depth: CT_THICK_M, bevelEnabled: false });
        geom.rotateX(Math.PI / 2); geom.translate(0, CT_THICK_M / 2, 0);
        geom.rotateY(-Math.PI / 2); 
        applyPlanarUVs(geom); // 🌟 تطبيق الـ UV
        const material = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 }); material.name = 'countertop';
        const mesh = new THREE.Mesh(geom, material); mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.customUV = true; // 🌟 حماية من المط
        ctGroup.add(mesh);

    } else if (path.includes('au45')) {
        const extrudeSettings = { depth: CT_THICK_M, bevelEnabled: false };
        const shape = new THREE.Shape();
        const oh = 0.04; const curveWeight = 0.75; 
        
        shape.moveTo(w/2, -d/2);
        shape.lineTo(w/2, d/2);  
        const cp1X = w/2 - (w + oh) * curveWeight;
        const cp1Y = d/2 + oh;
        const cp2X = -w/2 - oh;
        const cp2Y = -d/2 + (d + oh) * curveWeight;
        shape.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, -w/2 - oh, -d/2); 
        shape.lineTo(w/2, -d/2);

        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geom.rotateX(Math.PI / 2); geom.translate(0, CT_THICK_M / 2, 0);
        applyPlanarUVs(geom);

        const material = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 }); material.name = 'countertop';
        const mesh = new THREE.Mesh(geom, material); mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.customUV = true; 
        ctGroup.add(mesh);

    } else if (path.includes('corner') && !path.includes('corner110')) {
        // 🌟 تمت إضافة كود الزاوية L لحل مشكلة التحميل
        const innerGroup = new THREE.Group();
        const ctDepth = CT_DEPTH_M; 
        const backGeom = new THREE.BoxGeometry(w, CT_THICK_M, ctDepth);
        applyPlanarUVs(backGeom); // 🌟 تطبيق الـ UV
        const backMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 }); backMat.name = 'countertop';
        const backMesh = new THREE.Mesh(backGeom, backMat);
        backMesh.castShadow = true; backMesh.receiveShadow = true;
        backMesh.position.set(0, 0, -d/2 + ctDepth/2); 
        backMesh.userData.customUV = true; // 🌟 حماية من المط

        const sideLength = d - ctDepth;
        if (sideLength > 0) {
            const sideGeom = new THREE.BoxGeometry(ctDepth, CT_THICK_M, sideLength);
            applyPlanarUVs(sideGeom); // 🌟 تطبيق الـ UV
            const sideMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 }); sideMat.name = 'countertop';
            const sideMesh = new THREE.Mesh(sideGeom, sideMat);
            sideMesh.castShadow = true; sideMesh.receiveShadow = true;
            sideMesh.position.set(-w/2 + ctDepth/2, 0, ctDepth/2); 
            sideMesh.userData.customUV = true; // 🌟 حماية من المط
            innerGroup.add(sideMesh);
        }
        innerGroup.add(backMesh);
        innerGroup.rotation.y = -Math.PI / 2;
        ctGroup.add(innerGroup);

    } else {
        const fixedDepth = CT_DEPTH_M; 
        const geom = new THREE.BoxGeometry(w, CT_THICK_M, fixedDepth);
        applyPlanarUVs(geom); // 🌟 تطبيق الـ UV
        const material = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 }); material.name = 'countertop';
        const mesh = new THREE.Mesh(geom, material); mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.customUV = true; // 🌟 حماية من المط
        const zOffset = (fixedDepth - d) / 2;
        mesh.position.set(0, 0, zOffset); 
        ctGroup.add(mesh);
    }

    if (currentCountertopTexture) applyTextureToMaterial(ctGroup, 'countertop', currentCountertopTexture);
    ctGroup.traverse((child) => { if (child.isMesh) fixTextureStretching(child); });
    return ctGroup;
}

function rebuildAutoBaseboard(path, w, d) {
    const bbGroup = new THREE.Group();
    bbGroup.name = 'baseboard';
    bbGroup.userData.customColorGroup = 'floor-cabinet';
    bbGroup.userData.baseboardType = 'auto';
    bbGroup.userData.autoPath = path;
    bbGroup.userData.autoW = w;
    bbGroup.userData.autoD = d;

    const BB_HEIGHT = 0.10; const BB_DEPTH = 0.40;
    const isCurveEnd = path.includes('au45') || path.includes('lu50');
    const isPentagon = path.includes('corner45') || path.includes('90.glb');
    const isCornerL = (path.includes('corner') && !path.includes('corner110') && !path.includes('corner45')) || path.includes('90ll.glb');

    if (isCurveEnd) {
        const shape = new THREE.Shape();
        const recess = 0.04; const curveWeight = 0.75; 
        const frontZ = d/2 - recess; const leftX = -w/2 + recess;  
        
        // 🌟 رسم الإزارة لليسار
        shape.moveTo(w/2, -d/2);
        shape.lineTo(w/2, frontZ);
        const cp1X = w/2 - (w - recess) * curveWeight;
        const cp1Y = frontZ;
        const cp2X = leftX;
        const cp2Y = -d/2 + (d - recess) * curveWeight;
        shape.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, leftX, -d/2);
        shape.lineTo(w/2, -d/2);
        
        const extrudeSettings = { depth: BB_HEIGHT, bevelEnabled: false };
        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geom.rotateX(Math.PI / 2); geom.translate(0, BB_HEIGHT / 2, 0);

        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc }); material.name = 'ground';
        const mesh = new THREE.Mesh(geom, material); mesh.castShadow = true; mesh.receiveShadow = true;
        bbGroup.add(mesh);

    } else if (isPentagon) {
        const shape = new THREE.Shape();
        shape.moveTo(-w/2, -d/2); shape.lineTo(w/2, -d/2); shape.lineTo(w/2, -d/2 + BB_DEPTH);
        shape.lineTo(-w/2 + BB_DEPTH, d/2); shape.lineTo(-w/2, d/2); shape.lineTo(-w/2, -d/2);
        const geom = new THREE.ExtrudeGeometry(shape, { depth: BB_HEIGHT, bevelEnabled: false });
        geom.rotateX(Math.PI / 2); geom.translate(0, BB_HEIGHT / 2, 0);
        geom.rotateY(-Math.PI / 2); // 🌟 تدوير داخلي
        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc }); material.name = 'ground';
        const mesh = new THREE.Mesh(geom, material); mesh.castShadow = true; mesh.receiveShadow = true;
        bbGroup.add(mesh);

    } else if (isCornerL) {
        const innerGroup = new THREE.Group();
        const backGeom = new THREE.BoxGeometry(w, BB_HEIGHT, BB_DEPTH);
        const backMat = new THREE.MeshStandardMaterial({ color: 0xcccccc }); backMat.name = 'ground';
        const backMesh = new THREE.Mesh(backGeom, backMat); backMesh.castShadow = true; backMesh.receiveShadow = true;
        backMesh.position.set(0, 0, -d/2 + BB_DEPTH/2); 
        const sideLength = d - BB_DEPTH;
        if (sideLength > 0) {
            const sideGeom = new THREE.BoxGeometry(BB_DEPTH, BB_HEIGHT, sideLength);
            const sideMat = new THREE.MeshStandardMaterial({ color: 0xcccccc }); sideMat.name = 'ground';
            const sideMesh = new THREE.Mesh(sideGeom, sideMat); sideMesh.castShadow = true; sideMesh.receiveShadow = true;
            sideMesh.position.set(-w/2 + BB_DEPTH/2, 0, BB_DEPTH/2); innerGroup.add(sideMesh);
        }
        innerGroup.add(backMesh);
        innerGroup.rotation.y = -Math.PI / 2; // 🌟 تدوير داخلي
        bbGroup.add(innerGroup);

    } else {
        const geom = new THREE.BoxGeometry(w, BB_HEIGHT, BB_DEPTH);
        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc }); material.name = 'ground';
        const mesh = new THREE.Mesh(geom, material); mesh.castShadow = true; mesh.receiveShadow = true;
        const zOffset = (BB_DEPTH - d) / 2;
        mesh.position.set(0, 0, zOffset); bbGroup.add(mesh);
    }

    applyTextureToMaterial(bbGroup, 'ground', currentFloorCabinetTexture || DEFAULT_FLOOR_CABINET_TEXTURE);
    bbGroup.traverse((child) => { if (child.isMesh) fixTextureStretching(child); });
    return bbGroup;
}

async function deserializeScene(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        clearScene();
        selectedObject = null;
        selectedWall = null;
        updateDeleteButtonState();
        updateTransformButtonsState();
        updateSelectionIndicator();
        currentRoomLength = data.room.length;
        currentRoomWidth = data.room.width;
        currentRoomHeight = data.room.height || 280;
        currentRoomPolygon = Array.isArray(data.room.polygon) && data.room.polygon.length >= 3
            ? data.room.polygon.map(p => ({ x: p.x, z: p.z }))
            : null;
        // 👇 --- التعديلات الجديدة لاسترجاع حالة اليدات --- 👇
        if (data.handlesVisible !== undefined) {
            handlesVisible = data.handlesVisible;
        } else {
            handlesVisible = true; // القيمة الافتراضية للتصاميم القديمة
        }

        // تحديث شكل ولون الزر ليتطابق مع الحالة المحفوظة
        const toggleHandlesBtn = document.getElementById('toggleHandlesBtn');
        if (toggleHandlesBtn) {
            if (handlesVisible) {
                toggleHandlesBtn.innerHTML = '<i class="fas fa-minus-circle"></i> إخفاء اليدات';
                toggleHandlesBtn.style.backgroundColor = '#e74c3c'; // أحمر
            } else {
                toggleHandlesBtn.innerHTML = '<i class="fas fa-plus-circle"></i> إظهار اليدات';
                toggleHandlesBtn.style.backgroundColor = '#2ecc71'; // أخضر
            }
        }
        // 👆 ---------------------------------------------- 👆
        if (currentRoomPolygon) {
            createCustomFloorAndWalls(currentRoomPolygon);
        } else {
            createFloorAndWalls(currentRoomLength, currentRoomWidth);
        }
        if (data.textures.floor) changeFloorTexture(data.textures.floor);
        if (data.textures.wall) changeWallTexture(data.textures.wall);
        changeAllFloorCabinetsTexture(data.textures?.floorCabinet || DEFAULT_FLOOR_CABINET_TEXTURE);
        if (data.textures.attachedCabinet) changeAllAttachedCabinetsTexture(data.textures.attachedCabinet);
        if (data.textures.doubleAttached) changeAllDoubleAttachedCabinetsTexture(data.textures.doubleAttached);
        if (data.textures.countertop) changeAllCountertopsTexture(data.textures.countertop);
        warmUpModelPipeline();
        for (const obj of data.objects) {
            // 1. معالجة الستربات البرمجية (PROCEDURAL_SLAT)
            if (obj.userData.modelPath === 'PROCEDURAL_SLAT') {
                const dims = obj.userData.originalDimensions;
                const geometry = createProceduralSlatGeometry(dims.width, dims.height);
                const material = new THREE.MeshStandardMaterial({ name: 'ground', color: 0xcccccc });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = true; mesh.receiveShadow = true;

                const group = new THREE.Group();
                group.add(mesh);
                group.name = obj.name;
                group.position.copy(obj.position);
                group.rotation.copy(obj.rotation);
                group.scale.copy(obj.scale);
                group.userData = { ...obj.userData, modelPath: 'PROCEDURAL_SLAT' };

                // تطبيق الألوان المخصصة على الستربات
                const customGrp = group.userData.customColorGroup;
                if (customGrp) {
                    if (customGrp === 'floor' && currentFloorCabinetTexture) applyCabinetTexture(group, 'ground', currentFloorCabinetTexture);
                    else if (customGrp === 'attached' && currentAttachedCabinetTexture) applyCabinetTexture(group, 'ground', currentAttachedCabinetTexture);
                    else if (customGrp === 'double' && currentDoubleAttachedCabinetTexture) applyCabinetTexture(group, 'ground', currentDoubleAttachedCabinetTexture);
                    else if (customGrp === 'room-floor' && currentFloorTexturePath) applyPathToCabinetMaterial(group, currentFloorTexturePath, 'room-floor');
                    else if (customGrp === 'room-wall' && currentWallTexturePath) applyPathToCabinetMaterial(group, currentWallTexturePath, 'room-wall');
                } else if (currentFloorCabinetTexture) {
                    applyTextureToMaterial(group, 'ground', currentFloorCabinetTexture);
                }
                scene.add(group);
            } else if (obj.userData?.modelPath === SCENE_TEXT_MODEL_PATH && obj.userData.sceneTextPayload) {
                const pl = obj.userData.sceneTextPayload;
                const group = await createSceneTextGroup(pl.text, pl.colorKey);
                if (group) {
                    group.position.copy(obj.position);
                    group.rotation.copy(obj.rotation);
                    group.scale.copy(obj.scale);
                    group.userData = { ...obj.userData, modelPath: SCENE_TEXT_MODEL_PATH, sceneTextPayload: { ...pl } };
                    group.userData.sceneTextScale = obj.scale?.x ?? obj.userData?.sceneTextScale ?? 1;
                    scene.add(group);
                    applyHandlesVisibility(group);
                }
// 2. معالجة الكابينات العادية
            } else if (obj.userData.modelPath) {
               // التعديل الآمن لتحميل الموديلات المحفوظة
const [cleanPath, queryParams] = obj.userData.modelPath.split('?');
let secureModelUrl = 'get_model.php?file=' + encodeURIComponent(cleanPath);
if (queryParams) secureModelUrl += '&' + queryParams;
                loader.load(secureModelUrl, (gltf) => {
                    const newModel = gltf.scene;
                    const group = new THREE.Group();
                    group.add(newModel);
                    group.name = obj.name;
                    const pathDeser = (obj.userData?.modelPath || '').toString();
                    const flipReceptionMeshDeser = obj.name === 'attached-cabinet' &&
                        obj.userData?.receptionMeshYawPI !== false &&
                        (obj.userData?.receptionMeshYawPI === true || pathDeser.includes('resption/'));
                    if (flipReceptionMeshDeser) {
                        newModel.rotation.y = Math.PI;
                    }
                    const box = new THREE.Box3().setFromObject(newModel);
                    const center = box.getCenter(new THREE.Vector3());
                    newModel.position.set(-center.x, -box.min.y, -center.z);
                    group.position.copy(obj.position);
                    group.rotation.copy(obj.rotation);
                    group.scale.copy(obj.scale);
                    group.userData = { ...obj.userData, modelPath: obj.userData.modelPath };

                    // تطبيق الألوان المخصصة للكابينات العادية
                    const customGrp = group.userData.customColorGroup;
                    const bodyMat = cabinetBodyMaterialSlot(group);

                    if (customGrp) {
                        if (customGrp === 'floor' && currentFloorCabinetTexture) applyCabinetTexture(group, bodyMat, currentFloorCabinetTexture);
                        else if (customGrp === 'attached') {
                            if (isReceptionCabinetGroup(group) && currentFloorCabinetTexture) {
                                applyCabinetTexture(group, 'ground', currentFloorCabinetTexture);
                            } else if (!isReceptionCabinetGroup(group) && currentAttachedCabinetTexture) {
                                applyCabinetTexture(group, bodyMat, currentAttachedCabinetTexture);
                            }
                        }
                        else if (customGrp === 'double' && currentDoubleAttachedCabinetTexture) applyCabinetTexture(group, bodyMat, currentDoubleAttachedCabinetTexture);
                        else if (customGrp === 'room-floor' && currentFloorTexturePath) applyPathToCabinetMaterial(group, currentFloorTexturePath, 'room-floor');
                        else if (customGrp === 'room-wall' && currentWallTexturePath) applyPathToCabinetMaterial(group, currentWallTexturePath, 'room-wall');
                    } else {
                        // اللون الافتراضي
                        if (group.name === 'double-attached-cabinet' && currentDoubleAttachedCabinetTexture) { applyTextureToMaterial(group, 'up', currentDoubleAttachedCabinetTexture); }
                        else if (isReceptionCabinetGroup(group) && currentFloorCabinetTexture) { applyTextureToMaterial(group, 'ground', currentFloorCabinetTexture); }
                        else if (group.name === 'attached-cabinet' && currentAttachedCabinetTexture) { applyTextureToMaterial(group, 'up', currentAttachedCabinetTexture); }
                        else if ((group.name === 'floor-cabinet' || group.name === 'pantry-cabinet') && currentFloorCabinetTexture) { applyTextureToMaterial(group, 'ground', currentFloorCabinetTexture); }
                    }
                    scene.add(group);
                    applyHandlesVisibility(group);
                });

            // 3. معالجة سطح المرمر (عادي أو تلقائي)
            } else if (obj.name === 'countertop') {
                let cTopGroup;
                if (obj.userData.countertopType === 'straight') { cTopGroup = addCountertopStraight(obj.userData.countertopW * 100); }
                else if (obj.userData.countertopType === 'L') { cTopGroup = addCountertopL(obj.userData.countertopX * 100, obj.userData.countertopZ * 100); }
                else if (obj.userData.countertopType === 'auto') { 
                    cTopGroup = rebuildAutoCountertop(obj.userData.autoPath, obj.userData.autoW, obj.userData.autoD); 
                }
                
                if (cTopGroup) {
                    cTopGroup.position.copy(obj.position);
                    cTopGroup.rotation.copy(obj.rotation);
                    cTopGroup.scale.copy(obj.scale);
                    scene.add(cTopGroup);
                }
            }
            else if (obj.name === 'baseboard') {
                if (obj.userData.baseboardType === 'auto') {
                    const bbGroup = rebuildAutoBaseboard(obj.userData.autoPath, obj.userData.autoW, obj.userData.autoD);
                    if (bbGroup) {
                        bbGroup.position.copy(obj.position);
                        bbGroup.rotation.copy(obj.rotation);
                        bbGroup.scale.copy(obj.scale);
                        scene.add(bbGroup);
                    }
                }
            }
        } // نهاية objects

            
        
        setTimeout(() => {
            if (data.wallsData && walls.length === data.wallsData.length) {
                data.wallsData.forEach(wallData => {
                    const wall = walls[wallData.index];
                    if (wall && wallData.holes && wallData.holes.length > 0) {
                        wall.userData.holes = wallData.holes;
                        rebuildWallGeometry(wall);
                        wall.userData.holes.forEach(hole => { createWindowAssemblyForHole(wall, hole); });
                    }
                });
            }
        }, 500);
    } catch (e) {
        console.error("فشل تحميل التصميم:", e);
        alert("فشل تحميل التصميم. قد يكون الملف تالفاً أو أن هناك خطأ في البيانات.");
    }
}

async function saveCurrentDesign() {
    const designName = prompt("أدخل اسماً للتصميم:", "تصميمي الجديد");
    if (!designName || designName.trim() === '') { alert("تم إلغاء الحفظ."); return; }
    loadingOverlay.style.display = 'flex';
    try {
        const designData = serializeScene();
        const response = await fetch('save_design.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: designName, design_json: designData })
        });
        const result = await response.json();
        if (result.success) { alert('تم حفظ التصميم بنجاح!'); loadDesignsList(); }
        else { alert('فشل حفظ التصميم: ' + result.message); }
    } catch (error) {
        console.error('Error saving design:', error); alert('حدث خطأ أثناء الاتصال بالخادم.');
    } finally { loadingOverlay.style.display = 'none'; }
}

async function loadDesignsList() {
    const listElement = document.getElementById('savedDesignsList');
    const msgElement = document.getElementById('designsListMsg');
    listElement.innerHTML = '';
    msgElement.textContent = 'جاري التحميل...';
    try {
        const response = await fetch('load_designs.php');
        const result = await response.json();
        if (result.success && result.designs.length > 0) {
            msgElement.style.display = 'none';
            result.designs.forEach(design => {
                const li = document.createElement('li');
                li.style = "display:flex; justify-content:space-between; align-items:center; padding: 8px; border-bottom: 1px solid #eee;";
                const nameSpan = document.createElement('span');
                nameSpan.style = "font-weight: 600; font-size: 0.9rem;";
                nameSpan.textContent = design.name;
                const dateSpan = document.createElement('span');
                dateSpan.style = "font-size: 0.75rem; color: #888; margin-right: 10px;";
                try { dateSpan.textContent = new Date(design.created_at).toLocaleDateString('ar-EG-u-nu-latn'); } catch (e) { }
                const nameDiv = document.createElement('div');
                nameDiv.appendChild(nameSpan); nameDiv.appendChild(dateSpan);
                const buttonsDiv = document.createElement('div');
                buttonsDiv.innerHTML = `
                    <button class="load-btn" data-id="${design.id}" style="background:#2196F3; color:white; border:none; border-radius:4px; padding: 4px 8px; cursor:pointer; margin-left: 5px;">تحميل</button>
                    <button class="delete-btn" data-id="${design.id}" style="background:#f44336; color:white; border:none; border-radius:4px; padding: 4px 8px; cursor:pointer;">حذف</button>
                `;
                li.appendChild(nameDiv); li.appendChild(buttonsDiv);
                listElement.appendChild(li);
            });
        } else if (result.success) {
            msgElement.textContent = 'لا توجد تصاميم محفوظة.'; msgElement.style.display = 'block';
        } else {
            msgElement.textContent = 'فشل جلب القائمة: ' + result.message; msgElement.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading designs list:', error); msgElement.textContent = 'خطأ في الاتصال بالخادم.'; msgElement.style.display = 'block';
    }
}

async function loadSpecificDesign(designId) {
    if (!confirm('هل أنت متأكد؟ سيتم حذف التصميم الحالي (غير المحفوظ) وتحميل التصميم المختار.')) return;
    loadingOverlay.style.display = 'flex';
    try {
        const response = await fetch(`get_design.php?id=${designId}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const responseText = await response.text();
        let designData;
        try { designData = JSON.parse(responseText); } catch (e) { await deserializeScene(responseText); loadingOverlay.style.display = 'none'; return; }
        if (designData && designData.success === false) { throw new Error(designData.message); } else { await deserializeScene(responseText); }
    } catch (error) {
        console.error('Error loading specific design:', error); alert('فشل تحميل التصميم: ' + error.message);
    } finally { loadingOverlay.style.display = 'none'; }
}

async function deleteDesign(designId) {
    if (!confirm('هل أنت متأكد من حذف هذا التصميم؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    loadingOverlay.style.display = 'flex';
    try {
        const response = await fetch('delete_design.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: designId })
        });
        const result = await response.json();
        if (result.success) { alert('تم حذف التصميم.'); loadDesignsList(); }
        else { alert('فشل الحذف: ' + result.message); }
    } catch (error) {
        console.error('Error deleting design:', error); alert('حدث خطأ أثناء الاتصال بالخادم.');
    } finally { loadingOverlay.style.display = 'none'; }
}

// زر حفظ التصميم
saveDesignBtn?.addEventListener('click', () => {
    if (window.isGuestUser) { document.getElementById('guestRestrictedModal').style.display = 'flex'; return; }
    saveCurrentDesign();
});
refreshDesignsListBtn?.addEventListener('click', loadDesignsList);
document.getElementById('savedDesignsList')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('load-btn')) { const id = e.target.dataset.id; loadSpecificDesign(id); }
    if (e.target.classList.contains('delete-btn')) { const id = e.target.dataset.id; deleteDesign(id); }
});


document.addEventListener('DOMContentLoaded', () => {
    // تعريف العناصر
    const backBtn = document.getElementById('backToDashboardBtn');
    const modalOverlay = document.getElementById('exit-confirm-modal');
    const confirmExitBtn = document.getElementById('confirm-exit-btn');
    const cancelExitBtn = document.getElementById('cancel-exit-btn');

    // التأكد من وجود العناصر
    if (backBtn && modalOverlay && confirmExitBtn && cancelExitBtn) {

        // 1. عند الضغط على زر الرجوع
        backBtn.addEventListener('click', (e) => {
            e.preventDefault(); // إيقاف أي سلوك افتراضي
            modalOverlay.style.display = 'flex'; // إظهار النافذة
        });

        // 2. عند الضغط على "إلغاء" (البقاء في الصفحة)
        cancelExitBtn.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });

        // 3. عند الضغط على "نعم، خروج" (الانتقال الفعلي)
        confirmExitBtn.addEventListener('click', () => {
            // هنا نقوم بالانتقال يدوياً لأننا عطلنا الرابط في HTML
            window.location.href = 'dashboard.php'; 
        });

        // 4. إغلاق النافذة عند النقر في المساحة الفارغة
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.style.display = 'none';
            }
        });
    } else {
        console.error("خطأ: لم يتم العثور على عناصر نافذة الخروج في الصفحة.");
    }
});

/* =========================================================================
   14. ANIMATION LOOP
   ========================================================================= */
function updateFloatingToolbarPosition() {
    // 1. التحقق من وجود عنصر محدد
    if (!selectedObject || !floatingToolbar || floatingToolbar.style.display === 'none') return;

    // 2. حساب حدود العنصر
    const box = new THREE.Box3().setFromObject(selectedObject);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // 3. تحديد نقطة الهدف (أعلى المنتصف)
    // نستخدم box.max.y للحصول على السطح العلوي بالضبط
    // لا نضيف أي زيادة (0.0) لكي يلامس السهم السطح مباشرة
    const targetPosition = new THREE.Vector3(center.x, box.max.y, center.z);

    // 4. تحويل الإحداثيات العالمية إلى إحداثيات الكاميرا (-1 إلى 1)
    targetPosition.project(camera);

    // 5. حساب الإحداثيات بالنسبة لحجم وموقع الكانفاس الفعلي في الصفحة
    // هذا يحل مشكلة انزياح الشريط عند فتح/غلق القائمة الجانبية
    const canvasRect = renderer.domElement.getBoundingClientRect();
    
    const x = (targetPosition.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
    const y = (-(targetPosition.y * 0.5) + 0.5) * canvasRect.height + canvasRect.top;

    // 6. تطبيق الموقع
    // نستخدم transform في CSS لضبط المحاذاة، لذا هنا نضع القيم الخام فقط
    floatingToolbar.style.left = `${x}px`;
    floatingToolbar.style.top = `${y}px`;
}
function animate() {
    if (isAnimating) {
        requestAnimationFrame(animate);
        controls.update();
        updateFloatingToolbarPosition();
        composer.render();
        
    }
}


/* =========================================================================
   INITIALIZE SEPARATED MODULES
   ========================================================================= */
// تشغيل وتفعيل نظام الرسم الهندسي وتمرير الدوال المطلوبة له
init2DBlueprint(
    () => scene,                   // دالة ترجع المشهد الحالي
    () => currentRoomLength,       // دالة ترجع الطول الحالي
    () => currentRoomWidth,        // دالة ترجع العرض الحالي
    () => currentRoomPolygon,      // دالة ترجع مضلع الغرفة المخصصة إن وجد
    isCabinet,                     // دالة فحص الكابينات
    smartSaveImage                 // دالة الحفظ الذكية للصور
);

// إضافة تشغيل وتفعيل نظام الرندر الموصول بالسيرفر
initRenderSystem({
    getScene: () => scene,
    getCamera: () => camera,
    getControls: () => controls,
    getFloor: () => floor,
    getWalls: () => walls,
    isMobileDevice: isMobileDevice,
    smartSaveImage: smartSaveImage
});

/* تسخين مسار GLB/Draco/الخامة أثناء شاشة الإعداد (قبل «ابدأ التصميم»)
   حتى لا يُحسب التأخير كله على أول نقرة داخل المشهد. */
(function scheduleModelPipelineWarmupOnIdle() {
    const run = () => warmUpModelPipeline();
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 1200 });
    } else {
        setTimeout(run, 0);
    }
})();
