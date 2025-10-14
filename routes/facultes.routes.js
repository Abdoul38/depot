const express = require('express');
const router = express.Router();
const facultesController = require('../controllers/facultes.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/facultes', authenticateToken, requireAdmin, facultesController.getFacultes);
router.post('/facultes', authenticateToken, requireAdmin, facultesController.creerFaculte);
router.put('/facultes/:id', authenticateToken, requireAdmin, facultesController.modifierFaculte);
router.delete('/facultes/:id', authenticateToken, requireAdmin, facultesController.supprimerFaculte);

// === TYPES DE BAC ===
router.get('/type-bacs', authenticateToken, requireAdmin, facultesController.getTypeBacs);
router.post('/type-bacs', authenticateToken, requireAdmin, facultesController.creerTypeBac);
router.put('/type-bacs/:id', authenticateToken, requireAdmin, facultesController.modifierTypeBac);

// === FILIÈRES ===
// Routes spécifiques AVANT /:id
router.get('/filieres', authenticateToken, requireAdmin, facultesController.getFilieres);
router.get('/filieres-by-bac', authenticateToken, requireAdmin, facultesController.getFilieresByBac);
router.post('/filieres', authenticateToken, requireAdmin, facultesController.creerFiliere);
router.put('/filieres/:id', authenticateToken, requireAdmin, facultesController.modifierFiliere);

// === DIPLÔMES ===
router.get('/diplomes', authenticateToken, requireAdmin, facultesController.getDiplomes);
router.post('/diplomes', authenticateToken, requireAdmin, facultesController.creerDiplome);
router.put('/diplomes/:id', authenticateToken, requireAdmin, facultesController.modifierDiplome);
router.delete('/diplomes/:id', authenticateToken, requireAdmin, facultesController.supprimerDiplome);


// =================== ROUTES PUBLIQUES ===================

router.get('/public', facultesController.getFacultesPublic);
router.get('/type-bacs/public', facultesController.getTypeBacsPublic);
router.get('/filieres/public', facultesController.getFilieresPublic);
router.get('/filieres-by-bac/:typeBac', facultesController.getFilieresByBac);



module.exports = router;