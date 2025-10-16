// ============================================
// config/cloudinary.js - CORRIGÉ
// ============================================

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

if (!process.env.CLOUDINARY_CLOUD_NAME || 
    !process.env.CLOUDINARY_API_KEY || 
    !process.env.CLOUDINARY_API_SECRET) {
    console.warn('⚠️ Variables Cloudinary manquantes dans .env');
} else {
    console.log('✅ Cloudinary configuré:', process.env.CLOUDINARY_CLOUD_NAME);
}

// ✅ CORRECTION PRINCIPALE : Préserver les noms de fichiers
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const isImage = file.mimetype.startsWith('image/');
        
        // ✅ Créer un nom de fichier avec l'original
        const originalName = file.originalname
            .replace(/\.[^/.]+$/, '') // Enlever l'extension
            .replace(/[^a-zA-Z0-9-_]/g, '_') // Caractères spéciaux en underscore
            .substring(0, 40); // Limiter longueur
        
        const extension = file.originalname.substring(file.originalname.lastIndexOf('.')); // Garder extension originale
        const timestamp = Date.now();
        
        return {
            folder: 'edufile-documents',
            // ✅ Format : fieldName-timestamp-originalName
            public_id: `${file.fieldname}-${timestamp}-${originalName}`,
            resource_type: isImage ? 'image' : 'raw',
            // ✅ NE PAS forcer le format - garder le format original
            format: undefined,
            allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
            quality: 'auto',
            // ✅ Transformation légère pour les images seulement
            transformation: isImage ? [
                { 
                    width: 2000, 
                    crop: 'limit',
                    quality: 'auto',
                    fetch_format: 'auto'
                }
            ] : undefined
        };
    }
});

// Fonction pour supprimer un fichier de Cloudinary
const deleteFromCloudinary = async (fileUrl) => {
    try {
        if (!fileUrl || typeof fileUrl !== 'string') {
            return false;
        }

        // ✅ Extraire le public_id depuis l'URL Cloudinary
        // Format : https://res.cloudinary.com/.../v.../DOSSIER/FULL_PATH
        const urlParts = fileUrl.split('/');
        const versionIndex = urlParts.findIndex(part => part.startsWith('v'));
        
        if (versionIndex === -1) {
            console.warn('⚠️ Impossible d\'extraire version depuis URL:', fileUrl);
            return false;
        }

        // Récupérer tout après /v{version}/ (avec le dossier)
        const publicPathWithExt = urlParts.slice(versionIndex + 1).join('/');
        // Enlever l'extension
        const lastDotIndex = publicPathWithExt.lastIndexOf('.');
        const publicId = publicPathWithExt.substring(0, lastDotIndex);
        const extension = publicPathWithExt.substring(lastDotIndex + 1).toLowerCase();

        const resourceType = (['pdf', 'doc', 'docx', 'xlsx', 'xls', 'csv'].includes(extension)) ? 'raw' : 'image';

        console.log('🗑️ Suppression Cloudinary:', publicId);
        
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType
        });
        
        console.log('✅ Résultat suppression:', result.result);
        return result.result === 'ok' || result.result === 'not found';

    } catch (error) {
        console.error('❌ Erreur suppression Cloudinary:', error.message);
        return false;
    }
};

module.exports = {
    cloudinary,
    storage,
    deleteFromCloudinary
};
