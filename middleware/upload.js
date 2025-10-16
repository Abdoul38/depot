// ============================================
// middleware/upload.js - VERSION CORRIGÉE
// ============================================

const multer = require('multer');
const { storage } = require('../config/cloudinary');

const upload = multer({
    storage: storage, // Utiliser le storage Cloudinary
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    },
    fileFilter: (req, file, cb) => {
        // Formats autorisés
        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'application/pdf',
            // Pour l'import Excel
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv'
        ];
        
        if (allowedMimeTypes.includes(file.mimetype)) {
            console.log(`✅ Fichier accepté: ${file.originalname} (${file.mimetype})`);
            return cb(null, true);
        }
        
        const error = new Error(`Type de fichier non autorisé: ${file.mimetype}. Seuls JPEG, PNG, PDF et Excel sont acceptés.`);
        error.status = 400;
        cb(error);
    }
});

module.exports = { upload };
