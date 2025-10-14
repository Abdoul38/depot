const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth');

// Routes publiques
router.post('/register', authController.register);
router.post('/login', authController.login);

// Routes protégées
router.get('/profile', authenticateToken, authController.getProfile);
router.put('/profile', authenticateToken, authController.updateProfile);
router.put('/change-password', authenticateToken, authController.changePassword);

// Test d'authentification
router.get('/test', authenticateToken, authController.testAuth);

module.exports = router;