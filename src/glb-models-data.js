// --- استثناءات الارتفاع للكابينات الأرضية ---
// ضع هنا مسارات أو أسماء ملفات glb التي تريدها على ارتفاع 88 سم (مثل الخلاط أو الديكورات)
export const heightException88 = [
    'vatrena/mixer.glb', 
    'vatrena/acce.glb', 
    'vatrena/acce2.glb', 
    'vatrena/acce3.glb'
]; 

// ضع هنا مسارات أو أسماء ملفات glb التي تريدها على ارتفاع 110 سم (مثل النوافذ)
export const heightException110 = [
    'vatrena/window1.glb', 
    'vatrena/window2.glb'
];

// --- Models Lists ---
/** قائمة موديلات قسم الفاترينات (أرضية) */
export const vatrenaCabinets = [];
vatrenaCabinets.push({ name: '100', path: 'vatrena/v1.glb', thumbnail: 'thumbnails_vatrena/v1.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v2.glb', thumbnail: 'thumbnails_vatrena/v2.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v3.glb', thumbnail: 'thumbnails_vatrena/v3.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v4.glb', thumbnail: 'thumbnails_vatrena/v4.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v5.glb', thumbnail: 'thumbnails_vatrena/v5.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v6.glb', thumbnail: 'thumbnails_vatrena/v6.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v7.glb', thumbnail: 'thumbnails_vatrena/v7.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v8.glb', thumbnail: 'thumbnails_vatrena/v8.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v9.glb', thumbnail: 'thumbnails_vatrena/v9.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v10.glb', thumbnail: 'thumbnails_vatrena/v10.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v11.glb', thumbnail: 'thumbnails_vatrena/v11.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v12.glb', thumbnail: 'thumbnails_vatrena/v12.webp' });




vatrenaCabinets.push({ name: '100', path: 'vatrena/v1d.glb', thumbnail: 'thumbnails_vatrena/v1d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v2d.glb', thumbnail: 'thumbnails_vatrena/v2d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v3d.glb', thumbnail: 'thumbnails_vatrena/v3d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v4d.glb', thumbnail: 'thumbnails_vatrena/v4d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v5d.glb', thumbnail: 'thumbnails_vatrena/v5d.webp' });



vatrenaCabinets.push({ name: 'ستربات', path: 'PROCEDURAL_SLAT', thumbnail: 'thumbnails_vatrena/mdf.webp' });

/** فاترينات وسط المحل — عدّل `name` لكل سطر كما تريد يظهر في القائمة؛ `file` بدون .glb (يجب أن يطابق اسم الملف والصورة المصغرة) */
const MIDDLE_VATRENA_DIR = 'middle vatrena';
const MIDDLE_VATRENA_THUMB = 'thumbnails_vatrena';
const middleVatrenaSpecs = [
    { name: '200', file: 'mv1' },
    { name: '200', file: 'mv2' },
    { name: '100', file: 'mv3' },
    { name: '200', file: 'mv4' },
    { name: '200', file: 'mv5' },
    { name: '270', file: 'mv6' },
    { name: '200', file: 'mv7' },
    { name: '200', file: 'mv8' },
    { name: '200', file: 'mv9' },
    { name: '173', file: 'mv10' },
   
];
export const middleVatrenaCabinets = middleVatrenaSpecs.map(({ name, file }) => ({
    name,
    path: `${MIDDLE_VATRENA_DIR}/${file}.glb`,
    thumbnail: `${MIDDLE_VATRENA_THUMB}/${file}.webp`,
}));
middleVatrenaCabinets.push({ name: 'ستربات', path: 'PROCEDURAL_SLAT', thumbnail: 'thumbnails_vatrena/mdf.webp' });




/** رسبشن — عدّل `name` لكل سطر؛ `file` بدون .glb (ملفات في static/resption/، صور thumbnails_vatrena/resN.webp) */
const RECEPTION_DIR = 'resption';
const RECEPTION_THUMB = 'thumbnails_vatrena';
const receptionSpecs = [
    { name: '', file: 'res1' },
    { name: '', file: 'res2' },
    { name: '', file: 'res3' },
    { name: '', file: 'res4' },
    { name: '', file: 'res5' },
    { name: '', file: 'res6' },
    { name: '', file: 'res7' },
    { name: '', file: 'res8' },
    { name: '', file: 'res9' },
    { name: '', file: 'res10' },
    { name: '', file: 'res11' },
    { name: '', file: 'res12' },
    { name: '', file: 'res13' },
    { name: '', file: 'res14' },
    { name: '', file: 'res15' },
];
export const receptionCabinets = receptionSpecs.map(({ name, file }) => ({
    name,
    path: `${RECEPTION_DIR}/${file}.glb`,
    thumbnail: `${RECEPTION_THUMB}/${file}.webp`,
}));





/** أجهزة كهربائية — `file` / `thumb` بدون .glb / .webp؛ `customY` ارتفاع قاعدة الموديل بالمتر (0 = ملاصق للأرض، مثل 1.2 = 120 سم) */
const APPLIANCES_DIR = 'appliancese_vatrena';
const APPLIANCES_THUMB = 'thumbnails_vatrena';
const electricalApplianceSpecs = [
    { name: '', file: 'aircondition', thumb: 'aircondition' },
    { name: '', file: 'airconditon1', thumb: 'aircondition1', customY: 1.5 },
    { name: '', file: 'brad', thumb: 'brad' },
    { name: '', file: 'coffeemaker', thumb: 'coffeemaker' },
    { name: '', file: 'dvr', thumb: 'dvr' },
    { name: '', file: 'tv', thumb: 'tv' },
    { name: '', file: 'tvleg', thumb: 'tvleg' },
];
export const electricalAppliances = electricalApplianceSpecs.map(({ name, file, thumb, customY = 0 }) => ({
    name,
    path: `${APPLIANCES_DIR}/${file}.glb`,
    thumbnail: `${APPLIANCES_THUMB}/${thumb}.webp`,
    customY,
}));




// قائمة الاكسسوارات
export const accessoriesList = [
   
   
    { path: 'accessories_vatrena/chair.glb', thumbnail: 'thumbnails_vatrena/chair.webp', customY: 0, wallAlignYawOffset: Math.PI / -2 },
    { path: 'accessories_vatrena/chair1.glb', thumbnail: 'thumbnails_vatrena/chair1.webp', customY: 0, wallAlignYawOffset: Math.PI / -2 },
    { path: 'accessories_vatrena/chair2.glb', thumbnail: 'thumbnails_vatrena/chair2.webp', customY: 0, wallAlignYawOffset: Math.PI / -2 },
    { path: 'accessories_vatrena/chair3.glb', thumbnail: 'thumbnails_vatrena/chair3.webp', customY: 0, wallAlignYawOffset: Math.PI / -2 },
    { path: 'accessories_vatrena/chair4.glb', thumbnail: 'thumbnails_vatrena/chair4.webp', customY: 0, wallAlignYawOffset: Math.PI / -2 },




    { path: 'accessories_vatrena/plant.glb', thumbnail: 'thumbnails_vatrena/plant.webp', customY: 0 },
    
    { path: 'accessories_vatrena/carpet.glb', thumbnail: 'thumbnails_vatrena/carpet.webp', customY: 0 },
    { path: 'accessories_vatrena/carpet1.glb', thumbnail: 'thumbnails_vatrena/carpet1.webp', customY: 0 },
    { path: 'accessories_vatrena/carpet2.glb', thumbnail: 'thumbnails_vatrena/carpet2.webp', customY: 0 },
    { path: 'accessories_vatrena/carpet3.glb', thumbnail: 'thumbnails_vatrena/carpet3.webp', customY: 0 },
    { path: 'accessories_vatrena/carpet4.glb', thumbnail: 'thumbnails_vatrena/carpet4.webp', customY: 0 },


     { name: 'لوحة ', path: 'accessories_vatrena/pic.glb', thumbnail: 'thumbnails_vatrena/pic.webp', customY: 1.5 },
       { name: 'لوحة ', path: 'accessories_vatrena/pic1.glb', thumbnail: 'thumbnails_vatrena/pic1.webp', customY: 1.5 },
    { name: 'لوحة ', path: 'accessories_vatrena/pic2.glb', thumbnail: 'thumbnails_vatrena/pic2.webp', customY: 1.5 },
    { name: 'ساعة ', path: 'accessories_vatrena/clock.glb', thumbnail: 'thumbnails_vatrena/clock.webp', customY: 2 },
   


];

/** زيادة دوران Y (راديان) بعد محاذاة أقرب حائط — للموديلات التي تُصدَّر باتجاه أمامي مختلف */
export function getWallAlignYawOffsetForPath(modelPath) {
    const clean = (modelPath || '').toString().split('?')[0].replace(/\\/g, '/');
    for (const item of accessoriesList) {
        if (typeof item.wallAlignYawOffset !== 'number' || !Number.isFinite(item.wallAlignYawOffset)) continue;
        const ip = (item.path || '').replace(/\\/g, '/');
        if (clean === ip || clean.endsWith(ip)) return item.wallAlignYawOffset;
    }
    return 0;
}

