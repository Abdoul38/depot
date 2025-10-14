const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Toutes les routes nécessitent authentification admin
router.use(authenticateToken);
router.use(requireAdmin);

// =================== GESTION UTILISATEURS ===================
router.get('/users', adminController.getUsers);
router.post('/users', adminController.ajouterUser);

// =================== STATISTIQUES ===================
router.get('/stats', adminController.getStats);
router.get('/stats/facultes', adminController.getStatsFacultes);

// =================== EXPORTS ===================
router.get('/export/users', adminController.exportUsers);
router.get('/export/applications', adminController.exportApplications);
router.get('/export/candidatures-complete', adminController.exportCandidaturesComplete);
router.get('/export/section/:type', adminController.exportBySection);
router.get('/export/candidatures-complete', adminController.exportCandidaturesComplete);
router.get('/export/approuves-excel', adminController.exportApprouvesExcel);
router.get('/section/:type', adminController.exportParSection);
router.get('/export', adminController.exportInscriptions);

module.exports = router;