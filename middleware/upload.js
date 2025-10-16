// middleware/upload.js - VERSION COMPLÈTE CORRIGÉE
const multer = require('multer');
const { storage } = require('../config/cloudinary');
const path = require('path');
const fs = require('fs');

// ✅ Storage LOCAL pour les fichiers Excel (temporaires)
const excelStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/temp');
        
        // Créer le dossier s'il n'existe pas
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log('📁 Dossier temp créé:', uploadDir);
        }
        
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = 'import-' + uniqueSuffix + path.extname(file.originalname);
        console.log('📝 Nom fichier généré:', filename);
        cb(null, filename);
    }
});

// ✅ Upload CLOUDINARY pour les documents des candidatures
const upload = multer({
    storage: storage, // Cloudinary
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'application/pdf'
        ];
        
        if (allowedMimeTypes.includes(file.mimetype)) {
            console.log(`✅ Fichier accepté (Cloudinary): ${file.originalname} (${file.mimetype})`);
            return cb(null, true);
        }
        
        console.log(`❌ Fichier rejeté (Cloudinary): ${file.originalname} (${file.mimetype})`);
        const error = new Error(`Type de fichier non autorisé: ${file.mimetype}. Seuls JPEG, PNG et PDF sont acceptés.`);
        error.status = 400;
        cb(error);
    }
});

// ✅ Upload LOCAL pour les fichiers Excel d'import
const uploadExcel = multer({
    storage: excelStorage, // Local storage
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
            'application/vnd.ms-excel.sheet.macroEnabled.12',
            'application/vnd.ms-excel.template.macroEnabled.12',
            'application/vnd.ms-excel.addin.macroEnabled.12',
            'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
            'text/csv'
        ];
        
        if (allowedMimeTypes.includes(file.mimetype)) {
            console.log(`✅ Fichier Excel accepté (Local): ${file.originalname} (${file.mimetype})`);
            return cb(null, true);
        }
        
        console.log(`❌ Fichier Excel rejeté: ${file.originalname} (${file.mimetype})`);
        const error = new Error(`Type de fichier Excel non autorisé: ${file.mimetype}. Formats acceptés: .xlsx, .xls, .csv`);
        error.status = 400;
        cb(error);
    }
});

console.log('✅ Middleware upload initialisé (Cloudinary + Local Excel)');

module.exports = { 
    upload,        // Pour Cloudinary (candidatures)
    uploadExcel    // Pour Local (imports Excel)
};
