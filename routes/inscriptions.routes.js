// =================== FICHIER: inscriptions.routes.js ===================
// REMPLACER le contenu existant par celui-ci

const express = require('express');
const router = express.Router();
const inscriptionsController = require('../controllers/inscriptions.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// =================== ROUTES PUBLIQUES (SANS AUTHENTIFICATION) ===================

// ✅ IMPORTANT: Route publique pour vérifier le statut des inscriptions
router.get('/statut', inscriptionsController.getStatutInscriptions);

// ✅ AJOUT: Route pour les statistiques inscriptions (PUBLIC)
router.get('/stats', inscriptionsController.getStatsInscriptions);

// Recherche étudiants - PUBLIC
router.get('/rechercher-nouveau/:numeroDossier', inscriptionsController.rechercherNouveauEtudiant);
router.get('/rechercher-ancien/:matricule', inscriptionsController.rechercherAncienEtudiant);

// Vérifications - PUBLIC
router.get('/verifier-autorisation/:etudiantId', inscriptionsController.verifierAutorisation);

// Valider inscription - PUBLIC
router.post('/valider', inscriptionsController.validerInscription);

// Routes pour récupérer les inscriptions (pour les reçus)
router.get('/recu/:id', inscriptionsController.getInscriptionPourRecu);
router.get('/dernier-recu/:etudiant_id', inscriptionsController.getDernierRecuEtudiant);

// =================== ROUTES ADMIN (AVEC AUTHENTIFICATION) ===================

// Configuration admin
router.get('/config', inscriptionsController.getConfig);
router.put('/config', inscriptionsController.updateConfig);

// Toggle global
router.put('/toggle-global', inscriptionsController.toggleInscriptionsGlobal);
router.get('/statut-global', inscriptionsController.getStatutGlobal);

// Gestion inscriptions admin
router.get('/list', inscriptionsController.getInscriptions);
router.post('/creer', inscriptionsController.creerInscription);

// Restrictions admin
router.get('/restrictions', inscriptionsController.getRestrictions);
router.post('/restrictions', inscriptionsController.creerRestriction);
router.put('/restrictions/:id/toggle', inscriptionsController.toggleRestriction);
router.delete('/restrictions/:id', inscriptionsController.supprimerRestriction);

// Export admin
router.get('/export', inscriptionsController.exporterInscriptions);

module.exports = router;