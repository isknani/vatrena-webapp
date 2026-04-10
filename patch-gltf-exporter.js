/**
 * يُطبَّق هذا السكريبت تلقائياً بعد كل `npm install`
 * 1- يُمكّن تصدير ملمسات WebP في GLTFExporter
 * 2- ينسخ ملفات Draco WASM encoder إلى static/draco_vatrena/
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, 'node_modules/three/examples/jsm/exporters/GLTFExporter.js');

try {
    let content = readFileSync(filePath, 'utf8');

    const TARGET = "if ( mimeType === 'image/webp' ) mimeType = 'image/png';";
    const PATCHED_MARKER = "// WebP support enabled";

    if (content.includes(PATCHED_MARKER)) {
        console.log('✅ GLTFExporter: الباتش مطبّق مسبقاً، لا حاجة لإعادة التطبيق.');
    } else if (content.includes(TARGET)) {
        content = content.replace(
            TARGET,
            `${PATCHED_MARKER}\n\t\t// if ( mimeType === 'image/webp' ) mimeType = 'image/png';`
        );
        writeFileSync(filePath, content, 'utf8');
        console.log('✅ GLTFExporter: تم تطبيق باتش WebP بنجاح!');
    } else {
        console.warn('⚠️ GLTFExporter: السطر المستهدف تغيّر في هذا الإصدار من Three.js. راجع السطر يدوياً.');
    }
} catch (err) {
    console.error('❌ فشل تطبيق باتش GLTFExporter:', err.message);
}

// ─── نسخ ملفات Draco WASM Encoder إلى static/draco_vatrena/ ───────────────────────
try {
    const dracoSrc = join(__dirname, 'node_modules/draco3dgltf');
    const dracoDst = join(__dirname, 'static/draco_vatrena');

    if (!existsSync(dracoDst)) mkdirSync(dracoDst, { recursive: true });

    const files = [
        { src: 'draco_encoder_gltf_nodejs.js', dst: 'draco_encoder_gltf.js' },
        { src: 'draco_encoder.wasm',            dst: 'draco_encoder.wasm'    },
    ];

    for (const { src, dst } of files) {
        const srcPath = join(dracoSrc, src);
        const dstPath = join(dracoDst, dst);
        if (existsSync(srcPath)) {
            copyFileSync(srcPath, dstPath);
            console.log(`✅ Draco: نُسخ ${src} → static/draco_vatrena/${dst}`);
        } else {
            console.warn(`⚠️ Draco: الملف غير موجود: ${srcPath}`);
        }
    }
} catch (err) {
    console.error('❌ فشل نسخ ملفات Draco WASM:', err.message);
}
