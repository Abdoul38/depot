const express = require('express');
const router = express.Router();
const filieresController = require('../controllers/filieres.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// =================== ROUTES PUBLIQUES ===================
router.get('/actives', filieresController.getFilieresActives);
router.get('/public', filieresController.getFilieresPublic);
router.get('/by-bac/:typeBac', filieresController.getFilieresByBac);
router.get('/:nom/availability', filieresController.checkDisponibilite);

// =================== ROUTES ADMIN ===================
router.get('/admin', authenticateToken, requireAdmin, filieresController.getFilieres);
router.get('/admin/:id', authenticateToken, requireAdmin, filieresController.getFiliere);
router.post('/admin', authenticateToken, requireAdmin, filieresController.creerFiliere);
router.put('/admin/:id', authenticateToken, requireAdmin, filieresController.modifierFiliere);
router.delete('/admin/:id', authenticateToken, requireAdmin, filieresController.supprimerFiliere);
router.put('/admin/:id/types-bac', authenticateToken, requireAdmin, filieresController.updateTypesBac);

module.exports = router;