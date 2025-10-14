const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =================== CONFIGURATION ===================
const { pool, initializeDatabase } = require('./config/database');

// =================== MIDDLEWARE CORS COMPLET ===================
const allowedOrigins = [
    'https://depot-w4hn.onrender.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'https://localhost:3000'
];

// Middleware CORS principal
app.use(cors({
    origin: function (origin, callback) {
        // Autoriser les requêtes sans origine (postman, mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('🚫 Origin bloqué par CORS:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'Accept', 
        'X-Requested-With',
        'X-API-Key',
        'Origin',
        'Access-Control-Allow-Headers'
    ],
    exposedHeaders: [
        'Content-Range',
        'X-Content-Range'
    ],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// Middleware CORS manuel pour les en-têtes supplémentaires
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 
        'Content-Type, Authorization, Accept, X-Requested-With, X-API-Key, Origin, Access-Control-Allow-Headers');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Expose-Headers', 'Content-Range, X-Content-Range');
    
    // Répondre immédiatement aux pré-requêtes OPTIONS
    if (req.method === 'OPTIONS') {
        console.log('✅ Pré-requête OPTIONS traitée pour:', req.path);
        return res.status(200).end();
    }
    
    next();
});

// =================== MIDDLEWARE GLOBAUX ===================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir les fichiers statiques avec CORS
app.use('/uploads', express.static('uploads', {
    setHeaders: (res, path) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length');
    }
}));

app.use(express.static('public'));

// Middleware pour forcer JSON sur les routes API
app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    const originalSend = res.send;
    const originalJson = res.json;
    
    res.send = function(data) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (typeof data === 'object') {
            return originalSend.call(this, JSON.stringify(data));
        }
        return originalSend.call(this, data);
    };
    
    res.json = function(data) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return originalJson.call(this, data);
    };
    
    next();
});

// =================== ROUTES MODULAIRES ===================

// 1. Routes d'authentification (les plus spécifiques en premier)
app.use('/api/auth', require('./routes/auth.routes'));

// 2. Routes admin (AVANT les routes génériques)
app.use('/api/admin/stats', require('./routes/stats.routes'));
app.use('/api/admin/etudiants', require('./routes/etudiants.routes'));
app.use('/api/admin/export', require('./routes/admin.routes'));
app.use('/api/admin', require('./routes/facultes.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/admin/applications', require('./routes/applications.routes'));
app.use('/api/admin/inscription', require('./routes/inscriptions.routes'));

// 3. Routes d'inscription et paiements (spécifiques)
app.use('/api/admin/inscriptions', require('./routes/admin.routes'));
app.use('/api/inscription', require('./routes/inscriptions.routes'));
app.use('/api/payment', require('./routes/paiements.routes'));

// 4. Routes applications
app.use('/api/applications', require('./routes/applications.routes'));

// 5. Routes publiques générales
app.get('/api/type-bacs', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT tb.id, tb.nom, tb.libelle, tb.description,
                   COUNT(DISTINCT ftb.filiere_id) as nombre_filieres
            FROM type_bacs tb
            LEFT JOIN filiere_type_bacs ftb ON tb.id = ftb.type_bac_id
            LEFT JOIN filieres f ON ftb.filiere_id = f.id AND f.active = true
            WHERE tb.active = true
            GROUP BY tb.id, tb.nom, tb.libelle, tb.description
            ORDER BY tb.nom
        `);
        
        res.json({ 
            typeBacs: result.rows,
            message: `${result.rows.length} type(s) de bac disponible(s)`
        });
    } catch (error) {
        console.error('Erreur récupération types de bac:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/filieres-by-bac/:typeBac', async (req, res) => {
    try {
        const { typeBac } = req.params;
        
        console.log(`🔍 Recherche filières pour type de bac: ${typeBac}`);
        
        const result = await pool.query(`
            SELECT DISTINCT f.id, f.nom, f.libelle, f.description, f.capacite_max,
                   fac.nom as faculte_nom, fac.libelle as faculte_libelle,
                   COUNT(app.id) as nombre_candidatures
            FROM filieres f
            JOIN facultes fac ON f.faculte_id = fac.id
            JOIN filiere_type_bacs ftb ON f.id = ftb.filiere_id
            JOIN type_bacs tb ON ftb.type_bac_id = tb.id
            LEFT JOIN applications app ON (
                f.nom = app.premier_choix OR 
                f.nom = app.deuxieme_choix OR 
                f.nom = app.troisieme_choix
            )
            WHERE f.active = true 
                AND fac.active = true 
                AND tb.active = true
                AND tb.nom = $1
            GROUP BY f.id, f.nom, f.libelle, f.description, f.capacite_max, 
                     fac.nom, fac.libelle
            ORDER BY fac.nom, f.nom
        `, [typeBac]);
        
        console.log(`✅ ${result.rows.length} filières trouvées pour ${typeBac}`);
        
        res.json({ 
            filieres: result.rows,
            message: `${result.rows.length} filière(s) trouvée(s) pour le ${typeBac}`
        });
        
    } catch (error) {
        console.error('❌ Erreur récupération filières par bac:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la récupération des filières',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Route de santé pour tester l'API
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'API EduFile fonctionne correctement',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Route pour obtenir la configuration CORS (debug)
app.get('/api/cors-config', (req, res) => {
    res.json({
        allowedOrigins: allowedOrigins,
        currentOrigin: req.headers.origin,
        corsEnabled: true,
        environment: process.env.NODE_ENV || 'development'
    });
});

// =================== GESTION D'ERREURS ===================

// Middleware de gestion d'erreurs
app.use((error, req, res, next) => {
    console.error('❌ Erreur globale:', error);
    
    // Forcer JSON même en cas d'erreur
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    if (res.headersSent) {
        return next(error);
    }
    
    const errorResponse = {
        success: false,
        error: 'Erreur serveur',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    };
    
    res.status(error.status || 500).json(errorResponse);
});

// Route 404 pour les routes API non trouvées
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route API non trouvée',
        path: req.path,
        method: req.method
    });
});

// =================== ROUTE CATCH-ALL SPA ===================

// Servir le frontend (doit être en dernier)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../depot/index.html'));
});

// =================== DÉMARRAGE DU SERVEUR ===================

async function startServer() {
    try {
        console.log('🔧 Initialisation de la base de données...');
        await initializeDatabase();
        
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log('\n================================');
            console.log('🚀 Serveur EduFile démarré');
            console.log('================================');
            console.log(`📍 Port: ${PORT}`);
            console.log(`🔗 API: http://localhost:${PORT}/api`);
            console.log(`🌐 Frontend: http://localhost:${PORT}`);
            console.log(`🌍 Domaine autorisé: https://depot-w4hn.onrender.com`);
            console.log(`💾 Base de données: PostgreSQL`);
            console.log(`🔐 Mode: ${process.env.NODE_ENV || 'development'}`);
            console.log('================================\n');
            
            console.log('📋 Routes disponibles:');
            console.log('  • /api/auth - Authentification');
            console.log('  • /api/applications - Gestion dossiers');
            console.log('  • /api/admin/stats - Statistiques');
            console.log('  • /api/admin/etudiants - Gestion étudiants');
            console.log('  • /api/inscription - Inscriptions');
            console.log('  • /api/payment - Paiements mobile');
            console.log('  • /api/facultes - Facultés & formations');
            console.log('  • /api/filieres - Filières');
            console.log('  • /api/admin - Administration');
            console.log('  • /api/health - Santé de l\'API');
            console.log('  • /api/cors-config - Configuration CORS\n');
        });

        // Gestion de l'arrêt propre du serveur
        const gracefulShutdown = async (signal) => {
            console.log(`\n${signal} reçu, arrêt propre du serveur...`);
            server.close(async () => {
                console.log('🔴 Serveur HTTP fermé');
                try {
                    await pool.end();
                    console.log('✅ Connexions PostgreSQL fermées proprement');
                } catch (error) {
                    console.error('Erreur lors de la fermeture des connexions:', error);
                }
                process.exit(0);
            });

            // Force l'arrêt après 10 secondes
            setTimeout(() => {
                console.error('⚠️ Arrêt forcé après timeout');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        
    } catch (error) {
        console.error('❌ Erreur lors du démarrage du serveur:', error);
        process.exit(1);
    }
}

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesse rejetée non gérée:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Exception non capturée:', error);
    process.exit(1);
});

// Démarrer le serveur
startServer();

// Nettoyer les paiements temporaires expirés toutes les heures
setInterval(async () => {
    try {
        const result = await pool.query(`
            DELETE FROM paiement_temporaire
            WHERE expires_at < NOW() AND statut IN ('en-attente', 'en-cours', 'expire')
            RETURNING id
        `);
        
        if (result.rows.length > 0) {
            console.log(`🗑️ ${result.rows.length} paiements temporaires expirés nettoyés`);
        }
    } catch (error) {
        console.error('Erreur nettoyage paiements temporaires:', error);
    }
}, 3600000); // Toutes les heures

module.exports = app;
