/* =========================================================================
   SCENE SETUP (الكاميرا، الإضاءة، المشهد، والمحرك)
   ========================================================================= */
   import * as THREE from 'three';
   import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
   
   export function setupScene(canvas, sizes) {
       const scene = new THREE.Scene();
       let originalBackgroundTexture = null;
   
       // --- Background ---
       const backgroundLoader = new THREE.TextureLoader();
       backgroundLoader.load('texture_vatrena/ski.webp',
           function(texture) {
               scene.background = texture;
               originalBackgroundTexture = texture;
           },
           undefined,
           function(err) {
               console.error('حدث خطأ أثناء تحميل صورة الخلفية:', err);
               scene.background = new THREE.Color(0x87ceeb);
           }
       );
   
       // --- Camera ---
       const camera = new THREE.PerspectiveCamera(60, sizes.width / sizes.height, 0.1, 200);
       camera.position.set(5, 5, 5);
       camera.lookAt(0, 0, 0);
       scene.add(camera);
   
       // --- Renderer ---
       const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
       renderer.outputEncoding = THREE.sRGBEncoding;
       renderer.toneMapping = THREE.ACESFilmicToneMapping;
       renderer.shadowMap.enabled = true;
       renderer.shadowMap.type = THREE.PCFSoftShadowMap;
       renderer.physicallyCorrectLights = true;
   
       // --- Lighting ---
       const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6);
       hemiLight.position.set(0, 50, 0);
       scene.add(hemiLight);
   
       const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
       scene.add(ambientLight);
   
       const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
       directionalLight.position.set(5, 15, 10);
       directionalLight.castShadow = true;
   
       directionalLight.shadow.mapSize.width = 2048;
       directionalLight.shadow.mapSize.height = 2048;
       directionalLight.shadow.camera.near = 0.5;
       directionalLight.shadow.camera.far = 50;
       directionalLight.shadow.bias = -0.0005;
       directionalLight.shadow.normalBias = 0.02;
   
       const d = 10;
       directionalLight.shadow.camera.left = -d;
       directionalLight.shadow.camera.right = d;
       directionalLight.shadow.camera.top = d;
       directionalLight.shadow.camera.bottom = -d;
   
       scene.add(directionalLight);
   
       const frontLight = new THREE.DirectionalLight(0xffffff, 0.5);
       frontLight.position.set(0, 5, 10);
       scene.add(frontLight);
   
       // --- Controls ---
       const controls = new OrbitControls(camera, canvas);
       controls.enableDamping = true;
   
       // إرجاع العناصر التي سنحتاجها في الملف الرئيسي
       return { 
           scene, 
           camera, 
           renderer, 
           controls, 
           ambientLight, 
           directionalLight, 
           originalBackgroundTexture 
       };
   }