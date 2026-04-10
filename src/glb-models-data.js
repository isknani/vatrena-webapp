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




vatrenaCabinets.push({ name: '100', path: 'vatrena/v1d.glb', thumbnail: 'thumbnails_vatrena/v1d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v2d.glb', thumbnail: 'thumbnails_vatrena/v2d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v3d.glb', thumbnail: 'thumbnails_vatrena/v3d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v4d.glb', thumbnail: 'thumbnails_vatrena/v4d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v5d.glb', thumbnail: 'thumbnails_vatrena/v5d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v6d.glb', thumbnail: 'thumbnails_vatrena/v6d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v7d.glb', thumbnail: 'thumbnails_vatrena/v7d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v8d.glb', thumbnail: 'thumbnails_vatrena/v8d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v9d.glb', thumbnail: 'thumbnails_vatrena/v9d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v10d.glb', thumbnail: 'thumbnails_vatrena/v10d.webp' });
vatrenaCabinets.push({ name: '100', path: 'vatrena/v11d.glb', thumbnail: 'thumbnails_vatrena/v11d.webp' });


vatrenaCabinets.push({ name: 'ستربات', path: 'PROCEDURAL_SLAT', thumbnail: 'thumbnails_vatrena/mdf.webp' });






/** قائمة موديلات قسم الرسبشن (Reception) */
export const receptionCabinets = [];
receptionCabinets.push({ name: '60*60', path: 'resption/ml60.glb', thumbnail: 'thumbnails_vatrena/ml60.webp' });





/** قائمة موديلات قسم الأجهزة الكهربائية (Electrical appliances) */
export const electricalAppliances = [];
electricalAppliances.push({ name: '50', path: 'appliancese_vatrena/dm50.glb', thumbnail: 'thumbnails_vatrena/dm.webp' });




// قائمة الاكسسوارات
export const accessoriesList = [
    // إكسسوارات على الأرض (الارتفاع 0)
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
    
    // إكسسوارات على مستوى سطح المرمر (الارتفاع 87 سم)
    {  path: 'accessories_vatrena/acce.glb', thumbnail: 'thumbnails_vatrena/acce.webp', customY: 0.87 },
    {  path: 'accessories_vatrena/acce2.glb', thumbnail: 'thumbnails_vatrena/acce2.webp', customY: 0.87 },
    {  path: 'accessories_vatrena/acce3.glb', thumbnail: 'thumbnails_vatrena/acce3.webp', customY: 0.87 },
    {  path: 'accessories_vatrena/acce4.glb', thumbnail: 'thumbnails_vatrena/acce4.webp', customY: 0.87 },
    {  path: 'accessories_vatrena/acce5.glb', thumbnail: 'thumbnails_vatrena/acce5.webp', customY: 0.87 },



];

