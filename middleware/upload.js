const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf|xlsx|xls|csv/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        
        const excelMimeTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv',
            'image/jpeg',
            'image/jpg',
            'image/png',
            'application/pdf'
        ];
        
        if (extname && excelMimeTypes.includes(file.mimetype)) {
            return cb(null, true);
        }
        
        cb(new Error('Seuls les fichiers JPEG, PNG, PDF et Excel sont autorisés'));
    }
});

module.exports = { upload };