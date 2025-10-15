// ============================================
// middleware/upload.js - VERSION CLOUDINARY
// ============================================

const multer = require('multer');
const { storage } = require('../config/cloudinary');

// ✅ Utiliser le storage Cloudinary au lieu du stockage local
const upload = multer({
    storage: storage, // ✅ Storage Cloudinary
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        // Formats autorisés
        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'application/pdf',
            // Pour l'import Excel (si nécessaire)
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv'
        ];
        
        if (allowedMimeTypes.includes(file.mimetype)) {
            return cb(null, true);
        }
        
        cb(new Error('Type de fichier non autorisé. Seuls JPEG, PNG, PDF et Excel sont acceptés.'));
    }
});

module.exports = { upload };
