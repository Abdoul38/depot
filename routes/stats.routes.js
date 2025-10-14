const express = require('express');
const router = express.Router();
const statsController = require('../controllers/stats.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Toutes les routes nécessitent authentification admin
router.use(authenticateToken);
router.use(requireAdmin);

// Dashboard principal
router.get('/dashboard', statsController.getDashboard);

// Statistiques par catégorie
router.get('/genre', statsController.getStatsByGenre);
router.get('/filieres', statsController.getStatsByFilieres);
router.get('/type-bac', statsController.getStatsByTypeBac);
router.get('/facultes-candidatures', statsController.getStatsByFacultes);
router.get('/temporelles', statsController.getStatsTemporelles);
router.get('/mentions-filieres', statsController.getStatsMentionsFilieres);
router.get('/lieu-obtention', statsController.getStatsByLieuObtention);
router.get('/genre-bac', statsController.getStatsGenreBac);

// Test de données
router.get('/test-data', statsController.getTestData);

module.exports = router;