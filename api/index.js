
import crypto from 'crypto';

const SECRET_ID = process.env.SECRET_ID;
const SECRET_KEY = process.env.SECRET_KEY;
const BUCKET = process.env.BUCKET || 'filehub';
const REGION = process.env.REGION || 'ap-nanjing';

function getAuthKey(expired) {
    const now = Math.floor(Date.now() / 1000);
    const expiredTime = now + expired;
    const signatureParams = `a=${SECRET_ID}&k=${SECRET_KEY}&e=${expiredTime}&t=${now}&r=${Math.random()}&f=`;
    const signature = crypto.createHmac('sha1', SECRET_KEY).update(signatureParams).digest();
    return { signTime: `${now};${expiredTime}`, signature: signature.toString('base64') };
}

function getFileType(mimeType) {
    if (mimeType?.startsWith('image/')) return 'image';
    if (mimeType?.startsWith('video/')) return 'video';
    if (mimeType?.includes('pdf') || mimeType?.includes('document')) return 'document';
    return 'tool';
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { url } = req;
    const path = url.split('?')[0];

    // 上传
    if (path === '/api/upload' && req.method === 'POST') {
        try {
            const chunks = [];
            for await (const chunk of req.body) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            const fileName = req.headers['file-name'] || 'file';
            const key = `${Date.now()}_${fileName}`;
            const auth = getAuthKey(3600);
            const uploadUrl = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${encodeURIComponent(key)}`;
            const response = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/octet-stream', 'Authorization': `q-sign-algorithm=sha1&q-ak=${SECRET_ID}&q-sign-time=${auth.signTime}&q-key-time=${auth.signTime}&q-header-list=content-type&q-url-param-list=&signature=${auth.signature}` },
                body: buffer
            });
            if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
            res.json({ success: true, key, name: fileName, size: buffer.length, type: getFileType(req.headers['content-type']) });
        } catch (error) { res.status(500).json({ success: false, error: error.message }); }
        return;
    }

    // 获取URL
    if (path.startsWith('/api/url/') && req.method === 'GET') {
        const key = path.replace('/api/url/', '');
        const auth = getAuthKey(3600 * 24);
        const fileUrl = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${encodeURIComponent(key)}?sign=${encodeURIComponent(auth.signature)}&expires=${auth.signTime.split(';')[1]}`;
        res.json({ url: fileUrl });
        return;
    }

    // 删除
    if (path.startsWith('/api/file/') && req.method === 'DELETE') {
        const key = path.replace('/api/file/', '');
        const auth = getAuthKey(3600);
        const deleteUrl = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${encodeURIComponent(key)}`;
        await fetch(deleteUrl, { method: 'DELETE', headers: { 'Authorization': `q-sign-algorithm=sha1&q-ak=${SECRET_ID}&q-sign-time=${auth.signTime}&q-key-time=${auth.signTime}&q-header-list=content-type&q-url-param-list=&signature=${auth.signature}` } });
        res.json({ success: true });
        return;
    }

    res.status(404).json({ error: 'Not found' });
}
