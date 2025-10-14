const express = require('express');
const router = express.Router();
const importController = require('../controllers/import.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// ✅ APPLIQUER LES MIDDLEWARES À TOUTES LES ROUTES
router.use(authenticateToken);
router.use(requireAdmin);

// =================== TÉLÉCHARGEMENT MODÈLES ===================
router.get('/etudiants/modele-excel', importController.telechargerModeleEtudiants);

// =================== IMPORT DE DONNÉES ===================
router.post('/etudiants', upload.single('fichier'), importController.importerEtudiants);

module.exports = router;