import restart from 'vite-plugin-restart'

export default {
    root: 'src/',
    publicDir: '../static/',
    base: './', 

    server: {
        host: true, 
        open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env),
        
        // === خدعة الـ Bypass لتخطي الـ PHP محلياً ===
        proxy: {
            '/get_model.php': {
                target: 'http://localhost', // رابط وهمي ماراح نوصلة أصلاً
                bypass: function (req, res, options) {
                    // نصطاد مسار الموديل من الرابط (مثلاً file=ground/a60.glb)
                    const match = req.url.match(/file=([^&]+)/);
                    if (match) {
                        // نستخرج المسار وننظفه من أي إضافات مال كاش (مثل ?v=2)
                        const filePath = decodeURIComponent(match[1]).split('?')[0];
                        
                        // نرجع المسار النظيف لـ Vite حتى يحمله مباشرة من مجلد static
                        console.log('Bypassing PHP -> Loading:', filePath); // رسالة للتأكيد بالكونسول
                        return '/' + filePath;
                    }
                }
            }
        }
    },
    
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        sourcemap: false,
        // مجلد مُعرَّف ليميّز أصول المشروع عن أي build آخر يستخدم `assets` الافتراضي
        assetsDir: 'Vatrena-assets',
    },

    worker: {
        format: 'iife'
    },
    
    plugins: [
        restart({ restart: [ '../static/**', ] }) 
    ],
}