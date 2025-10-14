const express = require('express');
const router = express.Router();
const applicationsController = require('../controllers/applications.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// =================== ROUTES ADMIN (EN PREMIER) ===================
router.get('/', authenticateToken, requireAdmin, applicationsController.getAllApplications);
router.get('/search', authenticateToken, requireAdmin, applicationsController.searchApplications);
router.put('/:id/status', authenticateToken, requireAdmin, applicationsController.updateApplicationStatus);

// =================== ROUTES UTILISATEUR SPÉCIFIQUES (AVANT :id) ===================
// Mes candidatures - DOIT ÊTRE AVANT /:id
router.get('/my', authenticateToken, applicationsController.getMyApplications);

// Créer une candidature
router.post('/', 
    authenticateToken,
    upload.fields([
        { name: 'photoIdentite', maxCount: 1 },
        { name: 'pieceIdentite', maxCount: 1 },
        { name: 'diplomeBac', maxCount: 1 },
        { name: 'releve', maxCount: 1 },
        { name: 'certificatNationalite', maxCount: 1 }
    ]),
    applicationsController.submitApplication
);
// Routes d'édition (après les routes admin, avant /:id)
router.get('/:id/can-edit', authenticateToken, applicationsController.canEditApplication);
router.get('/:id/edit', authenticateToken, applicationsController.getApplicationForEdit);
router.put('/:id', 
    authenticateToken,
    upload.fields([
        { name: 'photoIdentite', maxCount: 1 },
        { name: 'pieceIdentite', maxCount: 1 },
        { name: 'diplomeBac', maxCount: 1 },
        { name: 'releve', maxCount: 1 },
        { name: 'certificatNationalite', maxCount: 1 }
    ]),
    applicationsController.updateApplication
);

// =================== ROUTES AVEC :id (EN DERNIER) ===================
router.get('/:id/details', authenticateToken, applicationsController.getApplicationDetails);
router.get('/:id/documents/:documentType', authenticateToken, applicationsController.downloadDocument);
router.get('/:id', authenticateToken, applicationsController.getApplication);

module.exports = router;