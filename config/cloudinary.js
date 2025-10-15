// ============================================
// config/cloudinary.js
// ============================================

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// ✅ Configuration Cloudinary avec variables d'environnement
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Vérifier la configuration au démarrage
if (!process.env.CLOUDINARY_CLOUD_NAME || 
    !process.env.CLOUDINARY_API_KEY || 
    !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️ Variables Cloudinary manquantes dans .env');
} else {
  console.log('✅ Cloudinary configuré:', process.env.CLOUDINARY_CLOUD_NAME);
}

// ✅ Configuration du storage pour Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Déterminer le type de ressource (image ou raw pour PDF)
    const isImage = file.mimetype.startsWith('image/');
    
    return {
      folder: 'edufile-documents', // Dossier dans Cloudinary
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
      resource_type: isImage ? 'image' : 'raw', // ✅ Important pour les PDF
      public_id: `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1E9)}`,
      transformation: isImage ? [
        { 
          width: 2000, 
          crop: 'limit',
          quality: 'auto'
        }
      ] : undefined
    };
  }
});

// ✅ Fonction utilitaire pour supprimer un fichier de Cloudinary
const deleteFromCloudinary = async (fileUrl) => {
  try {
    if (!fileUrl || typeof fileUrl !== 'string') {
      return false;
    }

    // Extraire le public_id de l'URL Cloudinary
    const matches = fileUrl.match(/\/v\d+\/(.+)\.(jpg|jpeg|png|pdf)$/i);
    if (!matches) {
      console.warn('⚠️ Format URL Cloudinary invalide:', fileUrl);
      return false;
    }

    const publicId = matches[1];
    const extension = matches[2].toLowerCase();
    const resourceType = extension === 'pdf' ? 'raw' : 'image';

    console.log('🗑️ Suppression Cloudinary:', publicId, `(${resourceType})`);
    
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    
    if (result.result === 'ok' || result.result === 'not found') {
      console.log('✅ Fichier supprimé de Cloudinary');
      return true;
    } else {
      console.warn('⚠️ Résultat inattendu:', result);
      return false;
    }
  } catch (error) {
    console.error('❌ Erreur suppression Cloudinary:', error);
    return false;
  }
};

module.exports = {
  cloudinary,
  storage,
  deleteFromCloudinary
};

