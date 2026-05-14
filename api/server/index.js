const express = require('express');
const cors = require('cors');
const cos = require('cos-nodejs-sdk-v5');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(cors());
app.use(express.json());

// 腾讯云 COS 配置
const cosClient = new cos({
    SecretId: process.env.SECRET_ID,
    SecretKey: process.env.SECRET_KEY
});

const BUCKET = process.env.BUCKET || 'filehub';
const REGION = process.env.REGION || 'ap-nanjing';

// 文件上传接口
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        const key = `${Date.now()}_${file.originalname}`;

        await new Promise((resolve, reject) => {
            cosClient.putObject({
                Bucket: BUCKET,
                Region: REGION,
                Key: key,
                Body: file.buffer,
                ContentLength: file.size
            }, (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        res.json({
            success: true,
            key,
            name: file.originalname,
            size: file.size,
            type: getFileType(file.mimetype)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取文件 URL
app.get('/url/:key', async (req, res) => {
    try {
        const url = await new Promise((resolve, reject) => {
            cosClient.getObjectUrl({
                Bucket: BUCKET,
                Region: REGION,
                Key: req.params.key,
                sign: false,
                expires: 3600 * 24
            }, (err, data) => {
                if (err) reject(err);
                else resolve(data.Url);
            });
        });

        res.json({ url });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 删除文件
app.delete('/file/:key', async (req, res) => {
    try {
        await new Promise((resolve, reject) => {
            cosClient.deleteObject({
                Bucket: BUCKET,
                Region: REGION,
                Key: req.params.key
            }, (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

function getFileType(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('word')) return 'document';
    return 'tool';
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));