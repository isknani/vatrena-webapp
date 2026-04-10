import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. تحديد المسارات
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// مسار ملف الـ HTML الناتج ومسار ملف الـ PHP الجديد
const distPath = path.join(__dirname, 'dist');
const htmlFile = path.join(distPath, 'index.html');
const phpFile = path.join(distPath, 'vatrena_design.php');

// 2. كود PHP الذي تريد إضافته (منسخ كما هو من طلبك)
const phpHeader = `<?php
// vatrena_design.php
session_start();
require_once 'config.php';

if (!isset($_SESSION['loggedIn']) || $_SESSION['loggedIn'] !== true) {
    header("Location: index.php?error=not_logged_in");
    exit;
}

// فحص حالة الزائر
$is_guest = isset($_SESSION['is_guest']) && $_SESSION['is_guest'] === true;

// فحص حماية الداتابيس فقط للمشتركين الفعليين
if (!$is_guest) {
    $conn = new mysqli(DB_SERVER, DB_USERNAME, DB_PASSWORD, DB_NAME);
    if ($conn->connect_error) {
        die("حدث خطأ في الاتصال بقاعدة البيانات.");
    }

    $username = $_SESSION['username'];
    $currentSessionId = $_SESSION['session_id'];

    $stmt = $conn->prepare("SELECT current_session FROM users WHERE username = ?");
    if ($stmt !== false) {
        $stmt->bind_param("s", $username);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();

        if (!$row || $row['current_session'] !== $currentSessionId) {
            session_destroy();
            header("Location: index.php?error=session_invalid");
            exit;
        }
        $stmt->close();
    }
    $conn->close();
}
?>
`;

const guestScript = `<script>
    // حقن متغير الزائر ليقرأه ملف الواجهة
    window.isGuestUser = <?php echo $is_guest ? 'true' : 'false'; ?>;
</script>`;

// 3. تنفيذ العملية
try {
    if (fs.existsSync(htmlFile)) {
        // قراءة محتوى الـ HTML
        let htmlContent = fs.readFileSync(htmlFile, 'utf8');

        // حقن السكريبت داخل body بعد فتح الوسم مباشرة
        htmlContent = htmlContent.replace('<body>', '<body>\n' + guestScript);

        // دمج الـ PHP مع الـ HTML
        const finalContent = phpHeader + htmlContent;

        // كتابة الملف الجديد vatrena_design.php
        fs.writeFileSync(phpFile, finalContent);
        console.log('✅ تم إنشاء ملف vatrena_design.php بنجاح مع كود الحماية!');

        // حذف ملف index.html القديم (اختياري)
        fs.unlinkSync(htmlFile);
        console.log('🗑️ تم حذف index.html الأصلي.');
    } else {
        console.error('❌ خطأ: لم يتم العثور على dist/index.html. تأكد أن عملية الـ Build تمت بنجاح.');
    }
} catch (err) {
    console.error('❌ حدث خطأ أثناء العملية:', err);
}