/* =========================================================================
   RENDER ENGINE (BLENDER INTEGRATION & EXPORT)
   ========================================================================= */
   import * as THREE from 'three';
   import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
   
   // متغيرات التبعيات (Dependencies) التي سيتم حقنها من الملف الرئيسي
   let getScene, getCamera, getControls, getFloor, getWalls;
   let isMobileDeviceFn, smartSaveImageFn;
   let wakeLock = null;
   
   /**
    * دالة تهيئة نظام الرندر
    */
   export function initRenderSystem(deps) {
       getScene = deps.getScene;
       getCamera = deps.getCamera;
       getControls = deps.getControls;
       getFloor = deps.getFloor;
       getWalls = deps.getWalls;
       isMobileDeviceFn = deps.isMobileDevice;
       smartSaveImageFn = deps.smartSaveImage;
   
       // ربط الأزرار
       const renderServerBtn = document.getElementById('renderServerBtn');
       if (renderServerBtn) {
           renderServerBtn.addEventListener('click', () => {
               if (window.isGuestUser) { 
                   document.getElementById('guestRestrictedModal').style.display = 'flex'; 
                   return; 
               }
               exportAndRender();
           });
       }
   
       const renderBtn = document.getElementById('renderBtn');
       if (renderBtn) {
           renderBtn.addEventListener('click', () => {
               if (window.isGuestUser) { 
                   document.getElementById('guestRestrictedModal').style.display = 'flex'; 
                   return; 
               }
               startProRender();
           });
       }
   
       // إتاحة الدالة للنطاق العام إذا كانت مستدعاة في مكان آخر
       window.showRenderedImage = showRenderedImage;
   }
   
   // =========================================================
   //  أدوات منع إطفاء الشاشة (Wake Lock API)
   // =========================================================
   async function requestWakeLock() {
       try {
           if ('wakeLock' in navigator) {
               wakeLock = await navigator.wakeLock.request('screen');
               console.log('🔒 تم قفل الشاشة: لن تنطفئ أثناء الرندر');
               
               document.addEventListener('visibilitychange', async () => {
                   if (wakeLock !== null && document.visibilityState === 'visible') {
                       wakeLock = await navigator.wakeLock.request('screen');
                   }
               });
           }
       } catch (err) {
           console.log(`⚠️ تعذر قفل الشاشة: ${err.message}`);
       }
   }
   
   function releaseWakeLock() {
       if (wakeLock !== null) {
           wakeLock.release().then(() => {
               wakeLock = null;
               console.log('🔓 تم تحرير الشاشة: يمكنها الانطفاء الآن');
           });
       }
   }
   
   // =========================================================
   //  نظام الإشعارات للرندر (Toast)
   // =========================================================
   function showBalanceToast(message, type = 'info') {
       const oldToast = document.getElementById('renderToast');
       if (oldToast) oldToast.remove();
   
       const toast = document.createElement('div');
       toast.id = 'renderToast';
       
       let icon = '<i class="fas fa-info-circle"></i>';
       let borderColor = '#3498db';
   
       if (type === 'loading') {
           icon = '<i class="fas fa-spinner fa-spin"></i>';
           borderColor = '#ff9800'; 
       } else if (type === 'success') {
           icon = '<i class="fas fa-check-circle"></i>';
           borderColor = '#2ecc71'; 
       } else if (type === 'error') {
           icon = '<i class="fas fa-exclamation-triangle"></i>';
           borderColor = '#e74c3c'; 
       }
   
       toast.style.cssText = `
           position: fixed;
           top: 30px;
           left: 50%;
           transform: translateX(-50%);
           background-color: rgba(20, 20, 20, 0.95);
           color: white;
           padding: 15px 30px;
           border-radius: 50px;
           box-shadow: 0 10px 40px rgba(0,0,0,0.4);
           z-index: 100000;
           font-family: 'Tajawal', sans-serif;
           font-size: 16px;
           font-weight: bold;
           display: flex;
           align-items: center;
           gap: 12px;
           border-bottom: 3px solid ${borderColor};
           min-width: 300px;
           justify-content: center;
           opacity: 0;
           transition: opacity 0.3s ease, top 0.3s ease;
       `;
   
       toast.innerHTML = `${icon} <span>${message}</span>`;
       document.body.appendChild(toast);
   
       requestAnimationFrame(() => {
           toast.style.opacity = '1';
           toast.style.top = '40px';
       });
   }
   
   function hideBalanceToast() {
       const toast = document.getElementById('renderToast');
       if (toast) {
           toast.style.opacity = '0';
           toast.style.top = '20px';
           setTimeout(() => toast.remove(), 300);
       }
   }
   
   // =========================================================
   //  فحص دعم تشفير WebP عبر Canvas (يختلف بين المتصفحات)
   // =========================================================
   let _webpEncodingSupported = null;

   function isWebPEncodingSupported() {
       if (_webpEncodingSupported !== null) return _webpEncodingSupported;
       try {
           const canvas = document.createElement('canvas');
           canvas.width = 2;
           canvas.height = 2;
           // إذا رجع data:image/webp فالمتصفح يدعم التشفير
           _webpEncodingSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
       } catch {
           _webpEncodingSupported = false;
       }
       console.log(`🖼️ تشفير WebP عبر Canvas: ${_webpEncodingSupported ? '✅ مدعوم' : '⚠️ غير مدعوم - سيُستخدم JPEG'}`);
       return _webpEncodingSupported;
   }

   // =========================================================
   //  تحضير الملمسات للتصدير (WebP أو JPEG حسب دعم الجهاز)
   // =========================================================
   /**
    * يُعيّن أفضل صيغة ممكنة على ملمسات المشهد قبل التصدير:
    * - WebP إذا دعمه المتصفح (Chrome / Safari 16+) → أصغر حجم
    * - JPEG كـ fallback للأجهزة الأخرى (Safari قديم) → أفضل من PNG
    */
   function prepareTexturesForExport(exportScene) {
       const processed = new Set();
       const texKeys = [
           'map', 'roughnessMap', 'metalnessMap', 'normalMap',
           'aoMap', 'lightMap', 'emissiveMap', 'bumpMap', 'displacementMap'
       ];

       const webpSupported = isWebPEncodingSupported();

       exportScene.traverse(obj => {
           if (!obj.isMesh || !obj.material) return;
           const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
           mats.forEach(mat => {
               if (!mat) return;
               texKeys.forEach(key => {
                   const tex = mat[key];
                   if (tex && !processed.has(tex)) {
                       processed.add(tex);
                       if (webpSupported) {
                           tex.userData.mimeType = 'image/webp';
                       } else {
                           // JPEG لا يدعم الشفافية لكن ملمسات المطبخ كلها معتمة
                           tex.userData.mimeType = 'image/jpeg';
                       }
                   }
               });
           });
       });

       const fmt = webpSupported ? 'WebP' : 'JPEG';
       console.log(`🖼️ تم تحضير ${processed.size} ملمس بصيغة ${fmt} للتصدير`);
       return processed.size;
   }
   
   // =========================================================
   //  ضغط GLB بـ gzip قبل الرفع لتقليل حجم الرفع
   // =========================================================
   async function compressGLB(arrayBuffer) {
       if (typeof CompressionStream === 'undefined') return arrayBuffer;
       try {
           const cs = new CompressionStream('gzip');
           const writer = cs.writable.getWriter();
           writer.write(new Uint8Array(arrayBuffer));
           writer.close();
           const chunks = [];
           const reader = cs.readable.getReader();
           while (true) {
               const { done, value } = await reader.read();
               if (done) break;
               chunks.push(value);
           }
           const total = chunks.reduce((a, c) => a + c.byteLength, 0);
           const out = new Uint8Array(total);
           let offset = 0;
           for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
           const ratio = ((1 - total / arrayBuffer.byteLength) * 100).toFixed(1);
           console.log(`📦 GLB: ${(arrayBuffer.byteLength/1024/1024).toFixed(2)}MB → ${(total/1024/1024).toFixed(2)}MB (وفّرنا ${ratio}%)`);
           return out.buffer;
       } catch (e) {
           console.warn('⚠️ ضغط gzip فشل، سيتم إرسال الملف بدون ضغط:', e);
           return arrayBuffer;
       }
   }
   
   // =========================================================
   //  ضغط Draco عبر Web Worker (لا يُجمّد الـ UI)
   // =========================================================
   let _dracoWorker = null;
   let _dracoMsgId  = 0;
   
   function getDracoWorker() {
       if (!_dracoWorker) {
           // Classic Worker (IIFE) - no { type: 'module' } needed
           _dracoWorker = new Worker(
               new URL('./draco-worker.js', import.meta.url)
           );
       }
       return _dracoWorker;
   }
   
   function applyDracoCompression(glbArrayBuffer) {
       return new Promise((resolve) => {
           try {
               const worker = getDracoWorker();
               const id = ++_dracoMsgId;
   
               const onMsg = ({ data }) => {
                   if (data.id !== id) return;
                   worker.removeEventListener('message', onMsg);
   
                   if (data.ok) {
                       const ratio = ((1 - data.after / data.before) * 100).toFixed(1);
                       console.log(`🗜️ Draco: ${(data.before/1024/1024).toFixed(2)}MB → ${(data.after/1024/1024).toFixed(2)}MB (وفّرنا ${ratio}%)`);
                   } else {
                       console.warn('⚠️ Draco Worker:', data.error, '← سيُرسل بدون ضغط Draco');
                   }
                   resolve(data.buffer);
               };
   
               worker.addEventListener('message', onMsg);
               const buf = glbArrayBuffer instanceof ArrayBuffer
                   ? glbArrayBuffer
                   : new Uint8Array(glbArrayBuffer).buffer;
               worker.postMessage({ id, glbBuffer: buf }, [buf]);
   
           } catch (err) {
               console.warn('⚠️ Worker لم يُشغَّل:', err);
               resolve(glbArrayBuffer);
           }
       });
   }
   
   // =========================================================
   //  تصدير وإعداد المشهد (Sanitize & Add)
   // =========================================================
   function sanitizeAndAdd(obj, parentScene) {
       if (!obj.visible) return;
       if (obj.isMesh) {
           const clonedMesh = obj.clone();
           clonedMesh.userData = {}; 
           if (clonedMesh.geometry) {
               clonedMesh.geometry = clonedMesh.geometry.clone();
               clonedMesh.geometry.userData = {};
               if (clonedMesh.geometry.attributes) {
                   const keep = ['position', 'normal', 'uv', 'index'];
                   for (const key in clonedMesh.geometry.attributes) {
                       if (!keep.includes(key)) delete clonedMesh.geometry.attributes[key];
                   }
               }
           }
           parentScene.add(clonedMesh);
       } else if (obj.isGroup || obj.isObject3D) {
           const newGroup = new THREE.Group();
           newGroup.name = obj.name;
           newGroup.position.copy(obj.position);
           newGroup.rotation.copy(obj.rotation);
           newGroup.scale.copy(obj.scale);
           newGroup.userData = {}; 
           parentScene.add(newGroup);
           if (obj.children) {
               obj.children.forEach(child => sanitizeAndAdd(child, newGroup));
           }
       }
   }
   
   // =========================================================
   //  رندر السيرفر العادي (RunPod Render)
   // =========================================================
   async function exportAndRender() {
       const btn = document.getElementById('renderServerBtn') || document.getElementById('renderBtn');
       if (!btn) return;
       
       const originalText = btn.innerHTML;
       btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المعالجة...';
       btn.disabled = true;
   
       const exportScene = new THREE.Scene();
       const camera = getCamera();
       const floor = getFloor();
       const walls = getWalls();
       const scene = getScene();
     
       // 1. الأرضية والجدران
       if (floor) sanitizeAndAdd(floor, exportScene);
       walls.forEach(wall => sanitizeAndAdd(wall, exportScene));
       
       // 2. الكابينات والأجهزة والسقف
       scene.children.forEach(child => {
           const name = child.name.toLowerCase();
           const validTypes = [
               'cabinet', 'attached', 'floor', 'pantry', 'counter', 'up', 
               'hood', 'range', 'fan', 'appliance', 'shelf', 'sink', 'ceiling', 'baseboard'
           ];
           
           if (validTypes.some(type => name.includes(type)) || child.userData.isExportable) {
               if (name === 'ceiling' && camera.position.y >= 2.8) {
                   return; 
               }
               sanitizeAndAdd(child, exportScene);
           }
       });
   
       // 3. علامات الكاميرا (Markers)
       const camPosMarker = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
       camPosMarker.name = "RenderCamPos"; 
       camPosMarker.position.copy(camera.position);
       camPosMarker.scale.set(camera.aspect, camera.fov, 1); 
       exportScene.add(camPosMarker);
   
       const controls = getControls();
       const camTargetMarker = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
       camTargetMarker.name = "RenderCamTarget"; 
       if (controls && controls.target) {
           camTargetMarker.position.copy(controls.target);
       } else {
           const dir = new THREE.Vector3();
           camera.getWorldDirection(dir);
           camTargetMarker.position.copy(camera.position).add(dir.multiplyScalar(2));
       }
       exportScene.add(camTargetMarker);
   
       // 4. التصدير
       prepareTexturesForExport(exportScene);
       const exporter = new GLTFExporter();
       exporter.parse(
           exportScene,
           async function (glbData) {
               showBalanceToast("جاري ضغط الملف... لحظة من فضلك", "loading");
               const compressed = await applyDracoCompression(glbData);
               sendGlbToServer(compressed, originalText);
           },
           function (error) {
               console.error('حدث خطأ أثناء التصدير:', error);
               alert('فشل تصدير المشهد');
               resetRenderBtn(btn, originalText);
           },
           { 
               binary: true,
               animations: [],
               truncateDrawRange: true,
               onlyVisible: true,
               forceIndices: true,
               maxTextureSize: 2048
           }
       );
   }
   
   async function sendGlbToServer(glbData, originalText) {
       const btn = document.getElementById('renderServerBtn');
       const blob = new Blob([glbData], { type: 'model/gltf-binary' });
       const formData = new FormData();
       formData.append('glb_file', blob, 'design.glb');
   
       try {
           showBalanceToast("جاري المعالجة... يرجى الانتظار", "loading");
   
           const response = await fetch('runpod_render.php', {
               method: 'POST',
               body: formData
           });
   
           const textResponse = await response.text();
           let data;
           try {
               data = JSON.parse(textResponse);
           } catch (e) {
               throw new Error("خطأ في استجابة السيرفر");
           }
   
           if (data.error === "low_balance") {
               showBalanceToast("⚠️ " + data.message, "error");
               return;
           }
   
           if (data.error) {
               throw new Error(data.error);
           }
   
           if (data.status === "COMPLETED" && data.output && data.output.image) {
               const imageSrc = "data:image/png;base64," + data.output.image;
               showRenderedImage(imageSrc);
               
               if (data.remaining_balance !== undefined) {
                   showBalanceToast(`✅ تم بنجاح! الرصيد المتبقي: ${data.remaining_balance} صورة`, "success");
                   const balanceDisplay = document.getElementById('userBalanceDisplay');
                   if(balanceDisplay) balanceDisplay.textContent = data.remaining_balance;
               }
           } else if (data.status === "FAILED") {
               throw new Error("فشل الرندر من المحرك: " + JSON.stringify(data.output));
           }
   
       } catch (error) {
           console.error('Error rendering:', error);
           showBalanceToast('❌ حدث خطأ: ' + error.message, "error");
       } finally {
           resetRenderBtn(btn, originalText);
       }
   }
   
   // =========================================================
   //  رندر السيرفر المتقدم (Pro Render)
   // =========================================================
   async function startProRender() {
       const renderBtn = document.getElementById('renderBtn');
       if (renderBtn.disabled) return;
   
       const originalText = '<i class="fas fa-magic"></i> تحويل الصور الى واقعية (رندر)';
       
       renderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري البدء...';
       renderBtn.disabled = true;
       renderBtn.style.opacity = "0.8";
   
       showBalanceToast("جاري التحقق من الرصيد...", "loading");
       requestWakeLock();
   
       try {
           const balanceResponse = await fetch('check_balance.php', { headers: { 'Cache-Control': 'no-cache' } });
           const balanceData = await balanceResponse.json();
   
           if (balanceData.status === 'error') {
               showBalanceToast(balanceData.message, "error");
               setTimeout(hideBalanceToast, 4000);
               resetRenderBtn(renderBtn, originalText);
               releaseWakeLock();
               return;
           }
   
           showBalanceToast(`✅ تم الخصم. رصيدك المتبقي: ${balanceData.remaining} محاولة. جاري التصدير...`, "loading");
           
           const balanceDisplay = document.getElementById('userBalanceDisplay');
           if(balanceDisplay) balanceDisplay.textContent = balanceData.remaining;
   
           renderBtn.innerHTML = '<i class="fas fa-paint-brush fa-spin"></i> جاري المعالجة...';
   
           const exportScene = new THREE.Scene();
           const camera = getCamera();
           const floor = getFloor();
           const walls = getWalls();
           const scene = getScene();
           const controls = getControls();
   
           if (floor) sanitizeAndAdd(floor, exportScene);
           walls.forEach(w => sanitizeAndAdd(w, exportScene));
           
           scene.children.forEach(child => {
               const name = (child.name || '').toLowerCase();
               const validTypes = ['cabinet', 'countertop', 'shelf', 'sink', 'appliance', 'hood', 'window', 'door', 'table', 'ceiling', 'baseboard'];
               
               if (validTypes.some(t => name.includes(t)) || child.userData?.modelPath) {
                   if (name === 'ceiling' && camera.position.y >= 2.8) {
                       return; 
                   }
                   sanitizeAndAdd(child, exportScene);
               }
           });
   
           const camPosMarker = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
           camPosMarker.name = "RenderCamPos"; 
           camPosMarker.position.copy(camera.position);
           camPosMarker.scale.set(camera.aspect, camera.fov, 1); 
           exportScene.add(camPosMarker);
   
           const camTargetMarker = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
           camTargetMarker.name = "RenderCamTarget"; 
           if (controls && controls.target) {
               camTargetMarker.position.copy(controls.target); 
           } else {
               const dir = new THREE.Vector3();
               camera.getWorldDirection(dir);
               camTargetMarker.position.copy(camera.position).add(dir.multiplyScalar(2));
           }
           exportScene.add(camTargetMarker);
   
           prepareTexturesForExport(exportScene);
           const exporter = new GLTFExporter();
           const options = {
               binary: true,
               onlyVisible: true,
               truncateDrawRange: true,
               forceIndices: true,
               maxTextureSize: 2048
           };
   
           exporter.parse(exportScene, async function(rawGlb) {
               renderBtn.innerHTML = '<i class="fas fa-compress-arrows-alt fa-spin"></i> جاري ضغط الملف...';
               const compressed = await applyDracoCompression(rawGlb);

               let formData = new FormData();
               formData.append("glb_file", new Blob([compressed], { type: 'model/gltf-binary' }), "vatrena_design.glb");
   
               renderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المعالجة...';
   
               fetch('save_glb.php', { method: 'POST', body: formData })
               .then(res => res.json())
               .then(phpData => {
                   if (phpData.status !== 'success') throw new Error(phpData.message);
                   return fetch('runpod_pro_run.php', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({ glb_url: phpData.url })
                   });
               })
               .then(res => res.json())
               .then(data => {
                   if (data.error) throw new Error(JSON.stringify(data.error));
                   checkStatus(data.id, renderBtn, originalText, 0);
               })
               .catch(err => {
                   console.error(err);
                   showBalanceToast("حدث خطأ أثناء المعالجة", "error");
                   setTimeout(hideBalanceToast, 4000);
                   resetRenderBtn(renderBtn, originalText);
                   releaseWakeLock();
               });
           }, 
           (err) => { 
               console.error(err); 
               showBalanceToast("خطأ في تصدير الملف", "error");
               setTimeout(hideBalanceToast, 4000);
               resetRenderBtn(renderBtn, originalText);
           }, 
           options);
   
       } catch (error) {
           console.error(error);
           showBalanceToast("فشل الاتصال بالسيرفر", "error");
           setTimeout(hideBalanceToast, 4000);
           resetRenderBtn(renderBtn, originalText);
       }
   }
   
   async function checkStatus(id, btn, originalText, failCount = 0) {
       const statusUrl = `runpod_pro_status.php?id=${id}`;
       try {
           const response = await fetch(statusUrl, {
               method: 'GET',
               headers: { 'Content-Type': 'application/json' }
           });
           const data = await response.json();
   
           if (data.status === "COMPLETED") {
               const output = data.output;
               let imageBase64 = output.image || output; 
               
               hideBalanceToast(); 
               showRenderedImage("data:image/png;base64," + imageBase64);
               
               resetRenderBtn(btn, originalText);
               releaseWakeLock(); 
   
           } else if (data.status === "FAILED") {
               showBalanceToast("فشلت عملية الرندر في السيرفر. حاول مرة أخرى.", "error");
               setTimeout(hideBalanceToast, 5000);
               resetRenderBtn(btn, originalText);
               releaseWakeLock(); 
   
           } else if (data.status === "IN_QUEUE" || data.status === "IN_PROGRESS") {
              setTimeout(() => checkStatus(id, btn, originalText, 0), 2000);
           }
       } catch (error) {
           console.error("انقطع الاتصال أثناء الفحص:", error);
           
           if (failCount < 10) {
              setTimeout(() => checkStatus(id, btn, originalText, failCount + 1), 3000);
           } else {
               showBalanceToast("انقطع الاتصال بالإنترنت لفترة طويلة. يرجى التأكد من الشبكة.", "error");
               setTimeout(hideBalanceToast, 5000);
               resetRenderBtn(btn, originalText);
               releaseWakeLock(); 
           }
       }
   }
   
   function resetRenderBtn(btn, text) {
       if (btn) {
           btn.innerHTML = text;
           btn.disabled = false;
           btn.style.opacity = "1";
       }
   }
   
   // =========================================================
   //  نافذة الحفظ المخصصة لأجهزة Apple
   // =========================================================
   function showDirectAppleSaveOverlay(imgSrc) {
       const overlay = document.createElement('div');
       overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.98);z-index:9999999;display:flex;flex-direction:column;justify-content:center;align-items:center;';
       
       const msg = document.createElement('h3');
       msg.innerHTML = '<i class="fas fa-check-circle" style="color:#2ecc71;"></i> الصورة جاهزة للحفظ!';
       msg.style.cssText = 'color:white; margin-bottom: 5px; font-family: Cairo, sans-serif; text-align:center;';
   
       const subMsg = document.createElement('p');
       subMsg.innerHTML = '<b style="color:#f1c40f;">اضغط مطولاً</b> على الصورة أدناه ثم اختر <b>"حفظ في الصور" (Save Image)</b>';
       subMsg.style.cssText = 'color:#ddd;font-size:16px;margin-bottom:20px;font-family:Cairo,sans-serif;text-align:center;padding:0 20px;line-height:1.5; direction:rtl;';
       
       const finalImg = document.createElement('img');
       finalImg.src = imgSrc;
       finalImg.style.cssText = 'max-width:90%;max-height:60%;border:3px solid #fff;border-radius:10px;box-shadow:0 0 30px rgba(255,255,255,0.4); user-select: auto; -webkit-user-select: auto; pointer-events: auto;';
       
       const closeBtn = document.createElement('button');
       closeBtn.innerHTML = '<i class="fas fa-times"></i> إغلاق بعد الحفظ';
       closeBtn.style.cssText = 'margin-top:25px;padding:12px 35px;font-size:16px;font-weight:bold;background:#e74c3c;color:white;border:none;border-radius:30px;cursor:pointer;box-shadow:0 4px 10px rgba(231,76,60,0.4);';
       
       closeBtn.onclick = () => {
           document.body.removeChild(overlay);
           URL.revokeObjectURL(imgSrc); 
       };
       
       overlay.appendChild(msg);
       overlay.appendChild(subMsg);
       overlay.appendChild(finalImg);
       overlay.appendChild(closeBtn);
       document.body.appendChild(overlay);
   }
   
   // =========================================================
   //  محرر الصور المتقدم (V5)
   // =========================================================
   function showRenderedImage(imageUrl) {
       const oldOverlay = document.getElementById('renderOverlay');
       if (oldOverlay) oldOverlay.remove();
   
       const imgOverlay = document.createElement('div');
       imgOverlay.id = 'renderOverlay';
       imgOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:99999;display:flex;flex-direction:column;justify-content:center;align-items:center;backdrop-filter:blur(5px);font-family: "Cairo", sans-serif;';
   
       const imgContainer = document.createElement('div');
       imgContainer.style.cssText = 'position:relative; max-width:90%; max-height:65%; margin-bottom: 20px; display:flex; justify-content:center; align-items:center;';
       
       const img = document.createElement('img');
       img.src = imageUrl;
       img.id = "finalRenderedImage";
       img.style.cssText = 'max-width:100%;max-height:100%;border:2px solid #555;border-radius:8px;box-shadow:0 0 30px rgba(0,0,0,0.7); transition: filter 0.1s;';
       
       imgContainer.appendChild(img);
       imgOverlay.appendChild(imgContainer);
   
       const controlsDiv = document.createElement('div');
       controlsDiv.style.cssText = 'display:grid; grid-template-columns: 1fr 1fr; gap:20px; background:#222; padding:20px; border-radius:15px; margin-bottom:15px; border:1px solid #444; color:white; width: 90%; max-width: 600px; direction: rtl;';
   
       function createControl(icon, label, min, max, value, id) {
           const wrapper = document.createElement('div');
           wrapper.style.cssText = 'display:flex; flex-direction:column; align-items:center;';
           wrapper.innerHTML = `<label style="margin-bottom:8px; font-weight:bold; font-size:14px; color:#ddd;"><i class="fas ${icon}"></i> ${label}</label>`;
           
           const slider = document.createElement('input');
           slider.type = "range";
           slider.min = min;
           slider.max = max;
           slider.value = value;
           slider.id = id;
           slider.style.width = "100%";
           slider.style.cursor = "pointer";
           slider.style.accentColor = "#4CAF50"; 
           
           wrapper.appendChild(slider);
           return { wrapper, slider };
       }
   
       const brightnessCtrl = createControl('fa-sun', 'السطوع', '50', '150', '100', 'ctrl_brightness');
       const contrastCtrl = createControl('fa-adjust', 'التباين (Contrast)', '50', '150', '100', 'ctrl_contrast'); 
       const saturationCtrl = createControl('fa-tint', 'تشبع الألوان', '0', '200', '100', 'ctrl_saturation');
       const sepiaCtrl = createControl('fa-temperature-high', 'الدفء (Warmth)', '0', '50', '0', 'ctrl_sepia');
   
       controlsDiv.appendChild(brightnessCtrl.wrapper);
       controlsDiv.appendChild(contrastCtrl.wrapper); 
       controlsDiv.appendChild(saturationCtrl.wrapper);
       controlsDiv.appendChild(sepiaCtrl.wrapper);
       
       imgOverlay.appendChild(controlsDiv);
   
       function updateFilters() {
           const b = brightnessCtrl.slider.value;
           const c = contrastCtrl.slider.value;
           const s = saturationCtrl.slider.value;
           const sp = sepiaCtrl.slider.value;
           img.style.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%) sepia(${sp}%)`;
       }
   
       brightnessCtrl.slider.addEventListener('input', updateFilters);
       contrastCtrl.slider.addEventListener('input', updateFilters);
       saturationCtrl.slider.addEventListener('input', updateFilters);
       sepiaCtrl.slider.addEventListener('input', updateFilters);
   
       const btnContainer = document.createElement('div');
       btnContainer.style.cssText = 'display:flex;gap:15px; justify-content:center; width:100%;';
   
       const saveBtn = document.createElement('button');
       saveBtn.innerHTML = `<i class="fas fa-download"></i> حفظ الصورة المعدلة`;
       saveBtn.style.cssText = 'background:#2196F3;color:white;padding:12px 30px;font-size:16px;font-weight:bold;border-radius:50px;cursor:pointer;border:none; display:flex;align-items:center;gap:10px; box-shadow: 0 4px 15px rgba(33, 150, 243, 0.4); transition:0.3s;';
       
       saveBtn.onclick = async function() {
           const originalText = saveBtn.innerHTML;
           saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التجهيز...';
           saveBtn.style.pointerEvents = 'none';
   
           setTimeout(async () => {
               try {
                   const canvas = document.createElement('canvas');
                   const ctx = canvas.getContext('2d');
                   canvas.width = img.naturalWidth;
                   canvas.height = img.naturalHeight;
   
                   const b = brightnessCtrl.slider.value;
                   const c = contrastCtrl.slider.value;
                   const s = saturationCtrl.slider.value;
                   const sp = sepiaCtrl.slider.value;
                   ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%) sepia(${sp}%)`;
                   ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
   
                   canvas.toBlob(async (blob) => {
                       if (!blob) throw new Error("فشل توليد الصورة");
   
                       const fileName = `Kitchen_Render_${new Date().getTime()}.png`;
                       const isApple = isMobileDeviceFn() && (/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
   
                       if (isApple) {
                           const objectUrl = URL.createObjectURL(blob);
                           showDirectAppleSaveOverlay(objectUrl);
                       } else {
                           const dataURL = canvas.toDataURL('image/png', 1.0);
                           await smartSaveImageFn(dataURL, fileName, 'تصميم المطبخ (رندر)');
                       }
   
                       saveBtn.innerHTML = originalText;
                       saveBtn.style.pointerEvents = 'auto';
   
                   }, 'image/png', 1.0);
   
               } catch (error) {
                   console.error('حدث خطأ', error);
                   saveBtn.innerHTML = originalText;
                   saveBtn.style.pointerEvents = 'auto';
               }
           }, 50);
       };
   
       const closeBtn = document.createElement('button');
       closeBtn.innerHTML = `<i class="fas fa-times"></i> إغلاق`;
       closeBtn.style.cssText = 'background:#f44336;color:white;border:none;padding:12px 25px;font-size:16px;font-weight:bold;border-radius:50px;cursor:pointer;display:flex;align-items:center;gap:10px; transition:0.3s;';
       closeBtn.onclick = () => imgOverlay.remove();
       
       btnContainer.appendChild(saveBtn);
       btnContainer.appendChild(closeBtn);
       imgOverlay.appendChild(btnContainer);
       document.body.appendChild(imgOverlay);
   }