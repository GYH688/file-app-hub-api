import crypto from 'crypto';

const SECRET_ID = process.env.SECRET_ID;
const SECRET_KEY = process.env.SECRET_KEY;
const BUCKET = process.env.BUCKET || 'filehub';
const REGION = process.env.REGION || 'ap-nanjing';

// 生成腾讯云签名
function getAuthKey(expired) {
    const now = Math.floor(Date.now() / 1000);
    const expiredTime = now + expired;

    const signatureParams = `a=${SECRET_ID}&k=${SECRET_KEY}&e=${expiredTime}&t=${now}&r=${Math.random()}&f=`;
    const signature = crypto.createHmac('sha1', SECRET_KEY).update(signatureParams).digest();

    return {
        signTime: `${now};${expiredTime}`,
        signature: signature.toString('base64')
    };
}

function getFileType(mimeType) {
    if (mimeType && mimeType.startsWith('image/')) return 'image';
    if (mimeType && mimeType.startsWith('video/')) return 'video';
    if (mimeType && (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('word'))) return 'document';
    return 'tool';
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { url } = req;
    const path = url.split('?')[0];

    // 上传文件
    if (path === '/upload' && req.method === 'POST') {
        try {
            const chunks = [];
            for await (const chunk of req.body) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            const contentDisposition = req.headers['content-disposition'] || '';
            const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
            const fileName = decodeURIComponent(fileNameMatch ? fileNameMatch[1] : 'file');

            const key = `${Date.now()}_${fileName}`;
            const auth = getAuthKey(3600);

            const uploadUrl = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${encodeURIComponent(key)}`;

            const response = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Authorization': `q-sign-algorithm=sha1&q-ak=${auth.signature}&q-sign-time=${auth.signTime}&q-key-time=${auth.signTime}&q-header-list=&q-url-param-list=&signature=${auth.signature}`
                },
                body: buffer
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            res.json({
                success: true,
                key,
                name: fileName,
                size: buffer.length,
                type: getFileType(req.headers['content-type'])
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
        return;
    }

    // 获取文件URL
    if (path.startsWith('/url/') && req.method === 'GET') {
        try {
            const key = path.replace('/url/', '');
            const auth = getAuthKey(3600 * 24);

            const fileUrl = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${encodeURIComponent(key)}?sign=${encodeURIComponent(auth.signature)}&expires=${auth.signTime.split(';')[1]}`;

            res.json({ url: fileUrl });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
        return;
    }

    // 删除文件
    if (path.startsWith('/file/') && req.method === 'DELETE') {
        try {
            const key = path.replace('/file/', '');
            const auth = getAuthKey(3600);

            const deleteUrl = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${encodeURIComponent(key)}`;

            const response = await fetch(deleteUrl, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Authorization': `q-sign-algorithm=sha1&q-ak=${SECRET_ID}&q-sign-time=${auth.signTime}&q-key-time=${auth.signTime}&q-header-list=content-type&q-url-param-list=&signature=${auth.signature}`
                }
            });

            res.json({ success: response.ok || response.status === 204 });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
        return;
    }

    res.status(404).json({ error: 'Not found' });
}