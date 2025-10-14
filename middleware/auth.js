const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// Middleware d'authentification
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('🔐 Vérification token:', {
        hasAuthHeader: !!authHeader,
        hasToken: !!token,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'ABSENT',
        path: req.path,
        method: req.method
    });

    if (!token) {
        console.log('❌ Token manquant pour:', req.path);
        return res.status(401).json({ 
            error: 'Token d\'accès requis',
            details: 'Authorization header manquant ou invalide',
            path: req.path
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'votre_secret_jwt');
        console.log('🔓 Token décodé:', decoded);
        
        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1', 
            [decoded.userId]
        );
        
        if (result.rows.length === 0) {
            console.log('❌ Utilisateur non trouvé pour ID:', decoded.userId);
            return res.status(403).json({ 
                error: 'Token invalide',
                details: 'Utilisateur non trouvé'
            });
        }
        
        req.user = result.rows[0];
        console.log('✅ Utilisateur authentifié:', req.user.email, 'Role:', req.user.role);
        next();
    } catch (error) {
        console.error('❌ Erreur vérification token:', error.message);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Token expiré',
                details: 'Veuillez vous reconnecter'
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(403).json({ 
                error: 'Token invalide',
                details: error.message
            });
        }
        
        return res.status(403).json({ 
            error: 'Erreur d\'authentification' 
        });
    }
};

// Middleware pour vérifier les droits admin
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ 
            error: 'Authentification requise' 
        });
    }
    
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            error: 'Droits administrateur requis',
            details: `Votre rôle actuel: ${req.user.role}`
        });
    }
    
    next();
};

// Middleware optionnel (authentification si token présent)
const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next(); // Pas de token, on continue sans authentifier
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'votre_secret_jwt');
        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1', 
            [decoded.userId]
        );
        
        if (result.rows.length > 0) {
            req.user = result.rows[0];
        }
    } catch (error) {
        // En cas d'erreur, on continue sans authentifier
        console.log('Token invalide, continuation sans auth');
    }
    
    next();
};

module.exports = {
    authenticateToken,
    requireAdmin,
    optionalAuth
};