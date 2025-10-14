const express = require('express');
const router = express.Router();
const etudiantsController = require('../controllers/etudiants.controller');
const exportController = require('../controllers/export.controller');

const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Toutes les routes nécessitent authentification admin
router.use(authenticateToken);
router.use(requireAdmin);

// =================== ROUTES SPÉCIFIQUES (AVANT LES ROUTES AVEC :id) ===================

// Import/Export - DOIVENT ÊTRE EN PREMIER
// =================== ROUTES SPÉCIFIQUES (AVANT LES ROUTES AVEC :id) ===================

// Import/Export
router.get('/modele-excel', etudiantsController.telechargerModele);
router.post('/import', upload.single('fichier'), etudiantsController.importerEtudiants);

// Exports
router.get('/users', exportController.exportUsers);
router.get('/applications', exportController.exportApplications);
router.get('/statistiques/:type', exportController.exportStatistiques);
router.get('/inscriptions', exportController.exportInscriptions);

// CRUD Étudiants
router.get('/', etudiantsController.getEtudiants);
router.post('/', etudiantsController.creerEtudiant);

// =================== ROUTES AVEC PARAMÈTRES :id (EN DERNIER) ===================

// Routes avec paramètres spécifiques AVANT les routes génériques
router.get('/inscription/:id', etudiantsController.getInscriptionDetails);
router.get('/:etudiantId/derniere-inscription', etudiantsController.getDerniereInscription);
router.put('/:id/toggle-inscription', etudiantsController.toggleInscription);
router.post('/:id/generer-matricule', etudiantsController.genererMatricule);

// Routes génériques en dernier
router.get('/:id', etudiantsController.getEtudiant);
router.put('/:id', etudiantsController.updateEtudiant);
router.delete('/:id', etudiantsController.supprimerEtudiant);

module.exports = router;