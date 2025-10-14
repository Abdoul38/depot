const express = require('express');
const router = express.Router();
const exportController = require('../controllers/export.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// ✅ APPLIQUER LES MIDDLEWARES À TOUTES LES ROUTES
router.use(authenticateToken);
router.use(requireAdmin);

// =================== EXPORTS EXCEL ===================
router.get('/candidatures-complete', exportController.exportCandidaturesComplete);
router.get('/approuves-excel', exportController.exportApprouvesExcel);
router.get('/section/:type', exportController.exportParSection);

// =================== EXPORTS CSV SIMPLES ===================
router.get('/users', exportController.exportUsers);
router.get('/applications', exportController.exportApplications);

// =================== EXPORTS STATISTIQUES ===================
router.get('/statistiques/:type', exportController.exportStatistiques);

// =================== EXPORTS INSCRIPTIONS ===================
router.get('/inscriptions', exportController.exportInscriptions);

module.exports = router;