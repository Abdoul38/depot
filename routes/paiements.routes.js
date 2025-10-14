const express = require('express');
const router = express.Router();
const paiementsController = require('../controllers/paiements.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Routes publiques (inscription)
router.post('/initier', paiementsController.initierPaiement);
router.get('/statut/:transaction_id', paiementsController.verifierStatut);
router.get('/infos/:operateur', paiementsController.getInfosPaiement);

// Callback webhook (pas d'auth - appelé par l'opérateur)
router.post('/callback', paiementsController.handleCallback);

// Routes protégées
router.get('/historique/:inscription_id', authenticateToken, paiementsController.getHistorique);

// Routes admin
router.post('/admin/annuler/:transaction_id', authenticateToken, requireAdmin, paiementsController.annulerPaiement);
router.get('/admin/stats', authenticateToken, requireAdmin, paiementsController.getStatistiques);

module.exports = router;