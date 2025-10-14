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

// =================== MIDDLEWARE GLOBAUX ===================
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads', {
    setHeaders: (res, path) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));

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

// =================== ROUTES MODULAIRES (ORDRE CRITIQUE) ===================

// 1. Routes d'authentification (les plus spécifiques en premier)
app.use('/api/auth', require('./routes/auth.routes'));

// 2. Routes admin (AVANT les routes génériques)
app.use('/api/admin/stats', require('./routes/stats.routes'));
app.use('/api/admin/etudiants', require('./routes/etudiants.routes'));
app.use('/api/admin/export', require('./routes/admin.routes')); // Si vous avez des exports
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


// 6. Routes publiques générales (EN DERNIER)
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
        error: 'Route non trouvée',
        path: req.path
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
            console.log('  • /api/admin - Administration\n');
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