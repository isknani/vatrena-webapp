/**
 * Web Worker لضغط Draco
 * Classic Worker (IIFE) - يستخدم importScripts لتحميل WASM encoder
 * بدون eval أو new Function → لا مشاكل مع CSP
 */
import { WebIO } from '@gltf-transform/core';
import {
    KHRDracoMeshCompression,
    KHRTextureTransform,
    KHRMaterialsUnlit,
    KHRMaterialsTransmission,
    KHRMaterialsVolume,
} from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';

// نخزن Promise تهيئة الـ encoder مرة واحدة
let _encoderPromise = null;

function getEncoderPromise() {
    if (_encoderPromise) return _encoderPromise;

    // importScripts متزامن (sync) في classic workers - يحمّل الملف ويشغّله فوراً
    // الملف يحدد DracoEncoderModule كـ global variable
    importScripts('/draco_vatrena/draco_encoder_gltf.js');

    // DracoEncoderModule({ locateFile }) ترجع Promise تنتهي عند جاهزية WASM
    _encoderPromise = DracoEncoderModule({
        locateFile: (filename) => '/draco_vatrena/' + filename
    });

    return _encoderPromise;
}

self.addEventListener('message', async ({ data }) => {
    const { id, glbBuffer } = data;

    try {
        const encoderModule = await getEncoderPromise();

        const io = new WebIO()
            .registerExtensions([
                KHRDracoMeshCompression,
                KHRTextureTransform,       // يحفظ إعدادات تكرار الملمسات (repeat/offset)
                KHRMaterialsUnlit,         // مواد بدون إضاءة
                KHRMaterialsTransmission,  // مواد الزجاج/الشفافية
                KHRMaterialsVolume,        // حجم المواد الشفافة
            ])
            .registerDependencies({ 'draco3d.encoder': encoderModule });

        const before = glbBuffer.byteLength;
        const doc = await io.readBinary(new Uint8Array(glbBuffer));
        await doc.transform(draco({
            method: 'edgebreaker',
            encodeSpeed: 5,
            decodeSpeed: 5,
            // رفع دقة UV إلى الحد الأقصى لتفادي تشوه الملمسات المكررة
            quantizeTexcoord: 16,
            // رفع دقة المواضع لتحسين جودة الهندسة
            quantizePosition: 16,
            quantizeNormal: 12,
        }));
        const compressed = await io.writeBinary(doc);
        const after = compressed.byteLength;

        self.postMessage(
            { id, ok: true, buffer: compressed.buffer, before, after },
            [compressed.buffer]
        );
    } catch (err) {
        self.postMessage(
            { id, ok: false, error: err.message, buffer: glbBuffer },
            [glbBuffer]
        );
    }
});
