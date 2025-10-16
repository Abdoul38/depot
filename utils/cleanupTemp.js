// utils/cleanupTemp.js
const fs = require('fs');
const path = require('path');

/**
 * Nettoie les fichiers temporaires de plus de 1 heure
 */
function cleanupTempFiles() {
    const tempDir = path.join(__dirname, '../uploads/temp');
    
    if (!fs.existsSync(tempDir)) {
        console.log('📁 Création du dossier temp...');
        fs.mkdirSync(tempDir, { recursive: true });
        return;
    }
    
    try {
        const files = fs.readdirSync(tempDir);
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        let cleaned = 0;
        
        files.forEach(file => {
            // Ignorer .gitkeep
            if (file === '.gitkeep') return;
            
            const filePath = path.join(tempDir, file);
            const stats = fs.statSync(filePath);
            
            if (now - stats.mtimeMs > oneHour) {
                fs.unlinkSync(filePath);
                cleaned++;
                console.log(`🗑️ Fichier temporaire supprimé: ${file}`);
            }
        });
        
        if (cleaned > 0) {
            console.log(`✅ ${cleaned} fichier(s) temporaire(s) nettoyé(s)`);
        }
    } catch (error) {
        console.error('❌ Erreur nettoyage fichiers temporaires:', error);
    }
}

// Nettoyer immédiatement au démarrage
cleanupTempFiles();

// Nettoyer toutes les heures
setInterval(cleanupTempFiles, 60 * 60 * 1000);

console.log('✅ Service de nettoyage des fichiers temporaires activé');

module.exports = { cleanupTempFiles };