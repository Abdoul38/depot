const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Inscription
exports.register = async (req, res) => {
    try {
        const { nom, email, telephone, motDePasse, dateNaissance } = req.body;

        // Validation des champs
        if (!nom || !email || !telephone || !motDePasse) {
            return res.status(400).json({ 
                error: 'Tous les champs obligatoires doivent être remplis' 
            });
        }

        // Vérifier si l'utilisateur existe déjà
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR telephone = $2',
            [email, telephone]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ 
                error: 'Un utilisateur avec cet email ou téléphone existe déjà' 
            });
        }

        // Hasher le mot de passe
        const hashedPassword = await bcrypt.hash(motDePasse, 10);

        // Insérer le nouvel utilisateur
        const result = await pool.query(
            'INSERT INTO users (nom, email, telephone, mot_de_passe, date_naissance, role, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
            [nom, email, telephone, hashedPassword, dateNaissance, 'user']
        );

        const user = result.rows[0];
        delete user.mot_de_passe; // Ne pas retourner le mot de passe

        res.status(201).json({ 
            success: true,
            message: 'Compte créé avec succès', 
            user 
        });
    } catch (error) {
        console.error('Erreur inscription:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Connexion
exports.login = async (req, res) => {
    try {
        const { identifiant, motDePasse } = req.body;

        // Validation
        if (!identifiant || !motDePasse) {
            return res.status(400).json({ 
                error: 'Identifiant et mot de passe requis' 
            });
        }

        // Rechercher l'utilisateur (par email ou téléphone)
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR telephone = $1',
            [identifiant]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                error: 'Identifiants incorrects' 
            });
        }

        const user = result.rows[0];

        // Vérifier le mot de passe
        const validPassword = await bcrypt.compare(motDePasse, user.mot_de_passe);
        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Identifiants incorrects' 
            });
        }

        // Générer le token JWT
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET || 'votre_secret_jwt',
            { expiresIn: '24h' }
        );

        delete user.mot_de_passe; // Ne pas retourner le mot de passe

        res.json({ 
            success: true,
            message: 'Connexion réussie', 
            token, 
            user 
        });
    } catch (error) {
        console.error('Erreur connexion:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Récupérer le profil
exports.getProfile = async (req, res) => {
    try {
        const user = { ...req.user };
        delete user.mot_de_passe;
        
        res.json({ 
            success: true,
            user 
        });
    } catch (error) {
        console.error('Erreur récupération profil:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Mettre à jour le profil
exports.updateProfile = async (req, res) => {
    try {
        const { nom, email, telephone } = req.body;

        // Vérifier que l'email/téléphone n'est pas déjà utilisé
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE (email = $1 OR telephone = $2) AND id != $3',
            [email, telephone, req.user.id]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ 
                error: 'Cet email ou téléphone est déjà utilisé' 
            });
        }

        await pool.query(
            'UPDATE users SET nom = $1, email = $2, telephone = $3, updated_at = NOW() WHERE id = $4',
            [nom, email, telephone, req.user.id]
        );

        res.json({ 
            success: true,
            message: 'Profil mis à jour avec succès' 
        });
    } catch (error) {
        console.error('Erreur mise à jour profil:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Changer le mot de passe
exports.changePassword = async (req, res) => {
    try {
        const { ancienMotDePasse, nouveauMotDePasse } = req.body;

        if (!ancienMotDePasse || !nouveauMotDePasse) {
            return res.status(400).json({ 
                error: 'Ancien et nouveau mot de passe requis' 
            });
        }

        // Récupérer le mot de passe actuel
        const result = await pool.query(
            'SELECT mot_de_passe FROM users WHERE id = $1', 
            [req.user.id]
        );
        
        const currentPassword = result.rows[0].mot_de_passe;

        // Vérifier l'ancien mot de passe
        const validPassword = await bcrypt.compare(ancienMotDePasse, currentPassword);
        if (!validPassword) {
            return res.status(400).json({ 
                error: 'Ancien mot de passe incorrect' 
            });
        }

        // Hasher le nouveau mot de passe
        const hashedNewPassword = await bcrypt.hash(nouveauMotDePasse, 10);

        // Mettre à jour
        await pool.query(
            'UPDATE users SET mot_de_passe = $1, updated_at = NOW() WHERE id = $2',
            [hashedNewPassword, req.user.id]
        );

        res.json({ 
            success: true,
            message: 'Mot de passe changé avec succès' 
        });
    } catch (error) {
        console.error('Erreur changement mot de passe:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Test d'authentification
exports.testAuth = async (req, res) => {
    res.json({
        success: true,
        message: 'Authentification réussie',
        user: {
            id: req.user.id,
            nom: req.user.nom,
            email: req.user.email,
            role: req.user.role
        }
    });
};

module.exports = exports;