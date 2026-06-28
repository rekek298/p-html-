/**
 * Serverless Function لسحب أكواد المواقع
 * تعمل على Vercel بدون مشاكل CORS
 */

export default async function handler(req, res) {
    // إعدادات CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // التعامل مع طلبات OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // التأكد من وجود الرابط
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'الرجاء إدخال رابط الموقع (url)'
        });
    }

    // التحقق من صحة الرابط
    let targetUrl;
    try {
        targetUrl = new URL(url);
    } catch (e) {
        return res.status(400).json({
            success: false,
            error: 'الرابط غير صالح'
        });
    }

    // منع طلب الموقع نفسه (حلقة لا نهائية)
    const host = req.headers.host || '';
    if (targetUrl.hostname === host || targetUrl.hostname === 'localhost') {
        return res.status(400).json({
            success: false,
            error: 'لا يمكن سحب نفس الموقع'
        });
    }

    try {
        console.log(`Fetching: ${targetUrl.href}`);

        const response = await fetch(targetUrl.href, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(15000), // 15 ثانية timeout
        });

        if (!response.ok) {
            throw new Error(`الموقع أرجع حالة: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';

        // التأكد أنه HTML
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            // إذا كان الملف نوعه CSS أو JS، نرجعه مباشرة (للاستخدام في التضمين)
            const text = await response.text();
            return res.status(200).json({
                success: true,
                html: text,
                length: text.length,
                url: targetUrl.href,
                contentType: contentType,
            });
        }

        const html = await response.text();

        if (!html || html.length < 50) {
            throw new Error('المحتوى فارغ أو قصير جداً');
        }

        console.log(`Success: ${html.length} characters from ${targetUrl.href}`);

        return res.status(200).json({
            success: true,
            html: html,
            length: html.length,
            url: targetUrl.href,
            contentType: contentType,
        });

    } catch (error) {
        console.error(`Fetch error for ${targetUrl.href}:`, error.message);

        // رسالة خطأ تفصيلية
        let errorMessage = error.message;

        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
            errorMessage = 'انتهت مهلة الاتصال (15 ثانية). الموقع بطيء جداً أو لا يستجيب.';
        } else if (error.cause?.code === 'ENOTFOUND') {
            errorMessage = 'تعذر العثور على الموقع. تأكد من الرابط.';
        } else if (error.cause?.code === 'ECONNREFUSED') {
            errorMessage = 'الموقع رفض الاتصال.';
        }

        return res.status(500).json({
            success: false,
            error: errorMessage,
            url: targetUrl.href,
        });
    }
}