
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
const paymentService = require('./paymentService');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration PostgreSQL pour Neon
// Configuration PostgreSQL pour LOCAL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'udh',
  user: process.env.DB_USER || '123456',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
// Middleware CORS plus permissif
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    // Intercepter res.send et res.json pour garantir le JSON
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



// Servir les fichiers uploadés
app.use('/uploads', express.static('uploads', {
  setHeaders: (res, path) => {
    // Autoriser CORS pour les images
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));
// Test de connexion à la base de données
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Erreur de connexion à PostgreSQL:', err);
  } else {
    console.log('✅ Connexion à PostgreSQL Neon réussie');
    console.log('📍 Host:', process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1]?.split('/')[0] : 'localhost');
  }
});


// Middleware


// Servir les fichiers statiques du frontend
app.use(express.static(path.join(__dirname, '../depot')));

// Configuration multer pour l'upload de fichiers
// Configuration multer pour l'upload de fichiers (CORRIGÉE)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB (augmenté pour les fichiers Excel)
  },
  fileFilter: (req, file, cb) => {
    // Types autorisés : images, PDF, et maintenant fichiers Excel
    const allowedTypes = /jpeg|jpg|png|pdf|xlsx|xls|csv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    // Types MIME pour les fichiers Excel
    const excelMimeTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.ms-excel.template.macroEnabled.12',
      'application/vnd.ms-excel.addin.macroEnabled.12',
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
      'text/csv'
    ];
    
    // Vérifier l'extension ET le type MIME
    if (extname && (mimetype || excelMimeTypes.includes(file.mimetype))) {
      return cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers JPEG, PNG, PDF, Excel (xlsx, xls) et CSV sont autorisés'));
    }
  }
});

// Fonction optimisée pour générer des numéros uniques à 6 chiffres
async function generateUniqueSixDigitNumber(table, column) {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const number = Math.floor(100000 + Math.random() * 900000);
    const fullNumber = 'UDH' + number;
    
    // Vérifier si le numéro existe déjà
    const result = await pool.query(
      `SELECT COUNT(*) FROM ${table} WHERE ${column} = $1`,
      [fullNumber]
    );
    
    if (parseInt(result.rows[0].count) === 0) {
      return fullNumber;
    }
    
    attempts++;
  }
  
  // Si on n'a pas trouvé de numéro unique après plusieurs tentatives
  throw new Error('Impossible de générer un numéro unique');
}

// Middleware d'authentification
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('🔍 Vérification token:', {
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
        
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
        
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
        // ... reste du code existant
    
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
    
    return res.status(403).json({ error: 'Erreur d\'authentification' });
  }
};

// Middleware pour vérifier les droits admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Droits administrateur requis' });
  }
  next();
};
// ✅ CORRECTION : Middleware qui log APRÈS l'authentification
const statsLogger = (req, res, next) => {
    console.log(`📊 [STATS] ${req.method} ${req.path}`);
    console.log('🔐 Auth header:', req.headers.authorization ? 'PRÉSENT' : 'ABSENT');
    // Attention : req.user n'est pas encore défini ici car authenticateToken n'a pas encore été appelé
    res.setHeader('Content-Type', 'application/json');
    next();
};


app.get('/api/admin/stats/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    console.log('=== DÉBUT ROUTE DASHBOARD ===');
    
    try {
        // Forcer JSON dès le début
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        // DÉBOGAGE AMÉLIORÉ
        console.log('📋 Headers reçus:', req.headers.authorization);
        console.log('👤 User from token:', req.user);
        console.log('🎭 User role:', req.user?.role);
        
        // Vérification utilisateur AMÉLIORÉE
        if (!req.user) {
            console.log('❌ ERREUR: req.user est undefined');
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non authentifié',
                details: 'Token invalide ou expiré'
            });
        }
        
        if (req.user.role !== 'admin') {
            console.log('❌ ERREUR: Rôle insuffisant:', req.user.role);
            return res.status(403).json({
                success: false,
                error: 'Accès administrateur requis',
                details: `Votre rôle actuel: ${req.user.role}`
            });
        }
        
        console.log('✅ Authentification OK - User:', req.user.email, 'Role:', req.user.role);
        
        // ... reste du code existant
        
        // Test connexion base de données
        try {
            await pool.query('SELECT 1');
            console.log('Connexion DB OK');
        } catch (dbError) {
            console.error('ERREUR DB:', dbError);
            return res.status(500).json({
                success: false,
                error: 'Erreur de connexion à la base de données',
                details: dbError.message
            });
        }
        
        // Compter les applications
        const countResult = await pool.query('SELECT COUNT(*) as total FROM applications');
        const totalApps = parseInt(countResult.rows[0].total);
        console.log('Total applications:', totalApps);
        
        // Si pas de données, retourner structure vide
        if (totalApps === 0) {
            console.log('Aucune donnée - retour structure vide');
            const emptyResponse = {
                success: true,
                message: 'Aucune candidature trouvée',
                general: {
                    total_candidatures: 0,
                    approuves: 0,
                    rejetes: 0,
                    en_attente: 0,
                    hommes: 0,
                    femmes: 0
                },
                topFilieres: [],
                repartitionBac: [],
                evolution: []
            };
            
            console.log('Envoi réponse vide:', JSON.stringify(emptyResponse).substring(0, 100));
            return res.json(emptyResponse);
        }
        
        // Requêtes avec gestion d'erreur individuelle
        let generalData = {
            total_candidatures: 0,
            approuves: 0,
            rejetes: 0,
            en_attente: 0,
            hommes: 0,
            femmes: 0
        };
        
        let topFilieres = [];
        let repartitionBac = [];
        let evolution = [];
        
        // 1. Statistiques générales
        try {
            const generalResult = await pool.query(`
                SELECT 
                    COUNT(*) as total_candidatures,
                    COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves,
                    COUNT(CASE WHEN statut = 'rejete' THEN 1 END) as rejetes,
                    COUNT(CASE WHEN statut = 'en-attente' THEN 1 END) as en_attente,
                    COUNT(CASE WHEN genre = 'masculin' THEN 1 END) as hommes,
                    COUNT(CASE WHEN genre = 'feminin' THEN 1 END) as femmes
                FROM applications
            `);
            
            if (generalResult.rows.length > 0) {
                const row = generalResult.rows[0];
                generalData = {
                    total_candidatures: parseInt(row.total_candidatures) || 0,
                    approuves: parseInt(row.approuves) || 0,
                    rejetes: parseInt(row.rejetes) || 0,
                    en_attente: parseInt(row.en_attente) || 0,
                    hommes: parseInt(row.hommes) || 0,
                    femmes: parseInt(row.femmes) || 0
                };
            }
            console.log('Stats générales OK:', generalData);
        } catch (error) {
            console.error('ERREUR stats générales:', error);
        }
        
        // 2. Top filières
        try {
            const filieresResult = await pool.query(`
                SELECT premier_choix as filiere, COUNT(*) as nombre
                FROM applications 
                WHERE premier_choix IS NOT NULL 
                    AND TRIM(premier_choix) != '' 
                GROUP BY premier_choix 
                ORDER BY nombre DESC 
                LIMIT 5
            `);
            
            topFilieres = filieresResult.rows.map(f => ({
                filiere: f.filiere,
                nombre: parseInt(f.nombre)
            }));
            console.log('Top filières OK:', topFilieres.length, 'éléments');
        } catch (error) {
            console.error('ERREUR top filières:', error);
        }
        
        // 3. Répartition bac
        try {
            const bacResult = await pool.query(`
                SELECT type_bac, COUNT(*) as nombre
                FROM applications 
                WHERE type_bac IS NOT NULL 
                    AND TRIM(type_bac) != ''
                GROUP BY type_bac 
                ORDER BY nombre DESC
                LIMIT 10
            `);
            
            repartitionBac = bacResult.rows.map(b => ({
                type_bac: b.type_bac,
                nombre: parseInt(b.nombre)
            }));
            console.log('Répartition bac OK:', repartitionBac.length, 'éléments');
        } catch (error) {
            console.error('ERREUR répartition bac:', error);
        }
        
        // 4. Évolution temporelle
        try {
            const evolutionResult = await pool.query(`
                SELECT 
                    TO_CHAR(created_at, 'Mon YYYY') as mois,
                    COUNT(*) as candidatures,
                    DATE_TRUNC('month', created_at) as mois_date
                FROM applications 
                WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
                GROUP BY TO_CHAR(created_at, 'Mon YYYY'), DATE_TRUNC('month', created_at)
                ORDER BY mois_date
            `);
            
            evolution = evolutionResult.rows.map(e => ({
                mois: e.mois,
                candidatures: parseInt(e.candidatures)
            }));
            console.log('Évolution OK:', evolution.length, 'éléments');
        } catch (error) {
            console.error('ERREUR évolution:', error);
        }
        
        // Construire la réponse finale
        const finalResponse = {
            success: true,
            timestamp: new Date().toISOString(),
            general: generalData,
            topFilieres: topFilieres,
            repartitionBac: repartitionBac,
            evolution: evolution
        };
        
        console.log('Réponse finale construite:', {
            success: finalResponse.success,
            total: finalResponse.general.total_candidatures,
            filieres: finalResponse.topFilieres.length,
            bacs: finalResponse.repartitionBac.length,
            evolution: finalResponse.evolution.length
        });
        
        // Vérifier que c'est du JSON valide
        try {
            JSON.stringify(finalResponse);
            console.log('JSON valide confirmé');
        } catch (jsonError) {
            console.error('ERREUR: JSON invalide:', jsonError);
            return res.status(500).json({
                success: false,
                error: 'Erreur de sérialisation JSON'
            });
        }
        
        // Envoyer la réponse
        res.json(finalResponse);
        console.log('=== RÉPONSE ENVOYÉE AVEC SUCCÈS ===');
        
    } catch (globalError) {
        console.error('=== ERREUR GLOBALE DASHBOARD ===');
        console.error('Message:', globalError.message);
        console.error('Stack:', globalError.stack);
        
        // S'assurer qu'on envoie du JSON même en cas d'erreur
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        const errorResponse = {
            success: false,
            error: 'Erreur serveur lors de la récupération des statistiques',
            details: globalError.message,
            timestamp: new Date().toISOString()
        };
        
        try {
            res.status(500).json(errorResponse);
        } catch (sendError) {
            console.error('ERREUR lors de l\'envoi de la réponse d\'erreur:', sendError);
            res.status(500).end('{"success":false,"error":"Erreur critique serveur"}');
        }
    }
});

// Inscription
app.post('/api/register', async (req, res) => {
  try {
    const { nom, email, telephone, motDePasse, dateNaissance } = req.body;

    // Vérifier si l'utilisateur existe déjà 
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR telephone = $2',
      [email, telephone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Un utilisateur avec cet email ou téléphone existe déjà' });
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

    res.status(201).json({ message: 'Compte créé avec succès', user });
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Connexion
app.post('/api/login', async (req, res) => {
  try {
    const { identifiant, motDePasse } = req.body;

    // Rechercher l'utilisateur
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR telephone = $1',
      [identifiant]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = result.rows[0];

    // Vérifier le mot de passe
    const validPassword = await bcrypt.compare(motDePasse, user.mot_de_passe);
    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Générer le token JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'votre_secret_jwt',
      { expiresIn: '24h' }
    );

    delete user.mot_de_passe; // Ne pas retourner le mot de passe

    res.json({ message: 'Connexion réussie', token, user });
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});



// Soumettre un dossier
app.post('/api/applications', authenticateToken, upload.fields([
  { name: 'photoIdentite', maxCount: 1 },
  { name: 'pieceIdentite', maxCount: 1 },
  { name: 'diplomeBac', maxCount: 1 },
  { name: 'releve', maxCount: 1 },
  { name: 'certificatNationalite', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('🔄 Début soumission dossier');
    console.log('User ID:', req.user?.id);
    console.log('Body fields:', Object.keys(req.body));
    console.log('Files:', Object.keys(req.files || {}));
    
    const {
      nom, prenom, dateNaissance, lieuNaissance, nationalite, genre,
      adresse, telephone, email, typeBac, lieuObtention, anneeObtention,
      mention, premierChoix, deuxiemeChoix, troisiemeChoix
    } = req.body;

    // Validation des champs obligatoires
    const requiredFields = {
      nom, prenom, dateNaissance, lieuNaissance, nationalite, genre,
      adresse, telephone, email, typeBac, lieuObtention, anneeObtention,
      mention, premierChoix, deuxiemeChoix, troisiemeChoix
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      console.error('Champs manquants:', missingFields);
      return res.status(400).json({ 
        error: `Champs obligatoires manquants: ${missingFields.join(', ')}` 
      });
    }

    // Générer un numéro de dossier unique
    const numeroDossier = await generateUniqueSixDigitNumber('applications', 'numero_dossier');

    // Préparer les chemins des fichiers
    const documents = {};
    if (req.files) {
      Object.keys(req.files).forEach(key => {
        documents[key] = req.files[key][0].filename;
      });
    }

    console.log('Documents uploadés:', documents);

    // Insérer le dossier
    const result = await pool.query(
      `INSERT INTO applications (
        user_id, numero_dossier, nom, prenom, date_naissance, lieu_naissance,
        nationalite, genre, adresse, telephone, email, type_bac, lieu_obtention,
        annee_obtention, mention, premier_choix, deuxieme_choix, troisieme_choix,
        documents, statut, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW()) RETURNING *`,
      [
        req.user.id, numeroDossier, nom, prenom, dateNaissance, lieuNaissance,
        nationalite, genre, adresse, telephone, email, typeBac, lieuObtention,
        anneeObtention, mention, premierChoix, deuxiemeChoix, troisiemeChoix,
        JSON.stringify(documents), 'en-attente'
      ]
    );

    console.log('✅ Dossier inséré avec succès:', result.rows[0].id);

    res.status(201).json({
      message: 'Dossier soumis avec succès',
      application: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur soumission dossier:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Erreur serveur lors de la soumission',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.get('/api/applications/my', authenticateToken, async (req, res) => {
    try {
        console.log('📋 Récupération dossiers pour user:', req.user.id);
        
        const result = await pool.query(
            'SELECT * FROM applications WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        
        console.log('📊 Nombre de dossiers trouvés:', result.rows.length);
        
        res.json({ applications: result.rows });
    } catch (error) {
        console.error('❌ Erreur récupération dossiers:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route de test pour vérifier l'authentification
app.get('/api/auth/test', authenticateToken, (req, res) => {
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
});


// Récupérer tous les utilisateurs (Admin)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nom, email, telephone, role, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({ users: result.rows }); // Retourner avec la clé 'users'
  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer tous les dossiers (Admin)
app.get('/api/admin/applications', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { statut, filiere } = req.query;
    
    let query = `
      SELECT a.*, u.nom as user_nom, u.email as user_email
      FROM applications a
      JOIN users u ON a.user_id = u.id
    `;
    
    const params = [];
    const conditions = [];
    
    if (statut) {
      conditions.push(`a.statut = $${params.length + 1}`);
      params.push(statut);
    }
    
    if (filiere) {
      conditions.push(`a.premier_choix = $${params.length + 1}`);
      params.push(filiere);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY a.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json({ applications: result.rows }); // Retourner avec la clé 'applications'
  } catch (error) {
    console.error('Erreur récupération dossiers admin:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour récupérer un dossier spécifique (admin - avec toutes les données)
app.get('/api/admin/applications/:id/quitus', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT a.*, u.nom as user_nom, u.email as user_email 
       FROM applications a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    res.json({ application: result.rows[0] });
  } catch (error) {
    console.error('Erreur récupération dossier admin:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour télécharger les documents (accès public aux fichiers)
app.get('/api/applications/:id/documents/:documentType', authenticateToken, async (req, res) => {
    try {
        const { id, documentType } = req.params;
        
        console.log('📥 Demande de téléchargement:', { id, documentType });
        
        // Récupérer l'application pour obtenir le nom du fichier
        const result = await pool.query(
            'SELECT * FROM applications WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            console.log('❌ Dossier non trouvé');
            return res.status(404).json({ error: 'Dossier non trouvé' });
        }

        const application = result.rows[0];
        
        // Vérifier les droits d'accès
        if (req.user.role !== 'admin' && application.user_id !== req.user.id) {
            console.log('❌ Accès non autorisé');
            return res.status(403).json({ error: 'Accès non autorisé' });
        }

        // Récupérer les documents
        let documents;
        try {
            documents = typeof application.documents === 'string' 
                ? JSON.parse(application.documents) 
                : application.documents || {};
        } catch (error) {
            console.error('❌ Erreur parsing documents:', error);
            documents = {};
        }

        console.log('📋 Documents disponibles:', documents);

        const filename = documents[documentType];
        if (!filename || filename === 'Non fourni' || filename === 'Optionnel') {
            console.log('❌ Document non disponible:', documentType);
            return res.status(404).json({ error: 'Document non trouvé' });
        }

        const filePath = path.join(__dirname, 'uploads', filename);
        console.log('📁 Chemin du fichier:', filePath);

        // Vérifier que le fichier existe
        if (!fs.existsSync(filePath)) {
            console.log('❌ Fichier physique non trouvé');
            return res.status(404).json({ error: 'Fichier physique non trouvé sur le serveur' });
        }

        // Définir le type MIME basé sur l'extension
        const ext = path.extname(filename).toLowerCase();
        let mimeType = 'application/octet-stream';
        
        switch(ext) {
            case '.pdf':
                mimeType = 'application/pdf';
                break;
            case '.jpg':
            case '.jpeg':
                mimeType = 'image/jpeg';
                break;
            case '.png':
                mimeType = 'image/png';
                break;
        }

        // Définir les en-têtes pour le téléchargement
        const documentNames = {
            'photoIdentite': 'Photo_identite',
            'pieceIdentite': 'Piece_identite',
            'diplomeBac': 'Diplome_bac', 
            'releve': 'Releve_notes',
            'certificatNationalite': 'Certificat_nationalite'
        };

        // Nettoyer les noms pour éviter les problèmes de caractères
        const cleanNom = (application.nom || '').replace(/[^a-zA-Z0-9éèêàâôöïîùûç]/g, '_').substring(0, 20);
        const cleanPrenom = (application.prenom || '').replace(/[^a-zA-Z0-9éèêàâôöïîùûç]/g, '_').substring(0, 15);

        // Utiliser l'extension du fichier original stocké
        const originalExt = path.extname(filename).toLowerCase();
        const downloadName = `${documentNames[documentType] || documentType}_${cleanNom}_${cleanPrenom}${originalExt}`;

        console.log('✅ Nom de téléchargement final:', downloadName);

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
         
        // Envoyer le fichier
        res.sendFile(filePath, (err) => {
            if (err) {
                console.error('❌ Erreur envoi fichier:', err);
                res.status(500).json({ error: 'Erreur lors de l\'envoi du fichier' });
            } else {
                console.log('✅ Fichier envoyé avec succès');
            }
        });

    } catch (error) {
        console.error('❌ Erreur téléchargement document:', error);
        res.status(500).json({ error: 'Erreur serveur lors du téléchargement' });
    }
});

// Route pour récupérer un dossier avec tous ses détails (admin et propriétaire)
app.get('/api/applications/:id/details', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT a.*, u.nom as user_nom, u.email as user_email 
       FROM applications a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    const application = result.rows[0];

    // Vérifier les droits d'accès
    if (req.user.role !== 'admin' && application.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Ajouter des informations sur l'existence des fichiers
    try {
      const documents = typeof application.documents === 'string' 
        ? JSON.parse(application.documents) 
        : application.documents || {};
      
      const documentsStatus = {};
      Object.entries(documents).forEach(([key, filename]) => {
        if (filename && filename !== 'Non fourni' && filename !== 'Optionnel') {
          const filePath = path.join(__dirname, 'uploads', filename);
          documentsStatus[key] = {
            filename: filename,
            exists: fs.existsSync(filePath),
            size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
          };
        } else {
          documentsStatus[key] = {
            filename: filename || 'Non fourni',
            exists: false,
            size: 0
          };
        }
      });

      application.documents_status = documentsStatus;
    } catch (error) {
      console.warn('Erreur vérification documents:', error);
      application.documents_status = {};
    }

    res.json({ application });

  } catch (error) {
    console.error('Erreur récupération détails dossier:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour générer et télécharger le quitus PDF
app.get('/api/applications/:id/quitus-pdf', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT a.*, u.nom as user_nom, u.email as user_email 
       FROM applications a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    const application = result.rows[0];

    // Vérifier les droits d'accès
    if (req.user.role !== 'admin' && application.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Pour cette implémentation, on retourne juste les données
    // Le PDF sera généré côté client
    res.json({ application });

  } catch (error) {
    console.error('Erreur génération quitus:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour télécharger tous les documents d'un dossier en ZIP (bonus)
app.get('/api/applications/:id/documents/zip', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier les droits admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Droits administrateur requis' });
    }

    const result = await pool.query(
      `SELECT a.*, u.nom as user_nom, u.email as user_email 
       FROM applications a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    const application = result.rows[0];
    const documents = typeof application.documents === 'string' 
      ? JSON.parse(application.documents) 
      : application.documents || {};

    // Vérifier qu'il y a au moins un document
    const validDocuments = Object.entries(documents).filter(([key, filename]) => 
      filename && filename !== 'Non fourni' && filename !== 'Optionnel'
    );

    if (validDocuments.length === 0) {
      return res.status(404).json({ error: 'Aucun document à télécharger' });
    }

    // Import archiver pour créer le ZIP
    const archiver = require('archiver');
    
    // Créer l'archive ZIP
    const archive = archiver('zip', {
      zlib: { level: 9 } // Niveau de compression
    });

    const zipName = `Dossier_${application.numero_dossier}_${application.nom}_${application.prenom}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    // Pipe l'archive vers la response
    archive.pipe(res);

    // Ajouter les fichiers à l'archive
    const documentNames = {
      'photoIdentite': 'Photo_identite',
      'pieceIdentite': 'Piece_identite', 
      'diplomeBac': 'Diplome_bac',
      'releve': 'Releve_notes',
      'certificatNationalite': 'Certificat_nationalite'
    };

    validDocuments.forEach(([key, filename]) => {
      const filePath = path.join(__dirname, 'uploads', filename);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filename);
        const archiveName = `${documentNames[key] || key}${ext}`;
        archive.file(filePath, { name: archiveName });
      }
    });

    // Finaliser l'archive
    archive.finalize();

    console.log(`📦 Archive téléchargée: ${zipName} par ${req.user.email}`);

  } catch (error) {
    console.error('Erreur création archive:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la création de l\'archive' });
  }
});

// Middleware pour servir les images avec les bons headers CORS
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static('uploads'));

// Route pour obtenir les statistiques des documents manquants (admin)
app.get('/api/admin/documents/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        numero_dossier, 
        nom, 
        prenom, 
        documents,
        created_at
      FROM applications 
      ORDER BY created_at DESC
    `);

    const stats = {
      total: result.rows.length,
      withMissingDocuments: 0,
      documentsStats: {
        photoIdentite: { present: 0, missing: 0 },
        pieceIdentite: { present: 0, missing: 0 },
        diplomeBac: { present: 0, missing: 0 },
        releve: { present: 0, missing: 0 },
        certificatNationalite: { present: 0, missing: 0 }
      }
    };

    result.rows.forEach(app => {
      try {
        const documents = typeof app.documents === 'string' 
          ? JSON.parse(app.documents) 
          : app.documents || {};

        let hasMissingDocs = false;

        Object.keys(stats.documentsStats).forEach(docType => {
          const filename = documents[docType];
          if (filename && filename !== 'Non fourni' && filename !== 'Optionnel') {
            // Vérifier si le fichier existe physiquement
            const filePath = path.join(__dirname, 'uploads', filename);
            if (fs.existsSync(filePath)) {
              stats.documentsStats[docType].present++;
            } else {
              stats.documentsStats[docType].missing++;
              hasMissingDocs = true;
            }
          } else {
            stats.documentsStats[docType].missing++;
            if (docType !== 'certificatNationalite') { // Le certificat de nationalité est optionnel
              hasMissingDocs = true;
            }
          }
        });

        if (hasMissingDocs) {
          stats.withMissingDocuments++;
        }

      } catch (error) {
        console.warn(`Erreur parsing documents pour le dossier ${app.id}:`, error);
        stats.withMissingDocuments++;
      }
    });

    res.json(stats);

  } catch (error) {
    console.error('Erreur statistiques documents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/admin/applications/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!['en-attente', 'approuve', 'rejete'].includes(statut)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    // Générer un numéro de dépôt seulement si le dossier est approuvé
    let numeroDepot = null;
    if (statut === 'approuve') {
  numeroDepot = await generateUniqueSixDigitNumber('applications', 'numero_depot');
}

    await pool.query(
      'UPDATE applications SET statut = $1, numero_depot = $2, updated_at = NOW() WHERE id = $3',
      [statut, numeroDepot, id]
    );

    // Récupérer le dossier mis à jour pour retourner les informations
    const result = await pool.query('SELECT * FROM applications WHERE id = $1', [id]);
    
    res.json({ 
      message: 'Statut mis à jour avec succès', 
      application: result.rows[0] 
    });
  } catch (error) {
    console.error('Erreur mise à jour statut:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route de recherche de dossiers (Admin)
app.get('/api/admin/applications/search', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Terme de recherche requis' });
    }

    const result = await pool.query(`
      SELECT a.*, u.nom as user_nom, u.email as user_email
      FROM applications a
      JOIN users u ON a.user_id = u.id
      WHERE a.numero_dossier ILIKE $1 
         OR a.nom ILIKE $1 
         OR a.prenom ILIKE $1 
         OR a.email ILIKE $1
      ORDER BY a.created_at DESC
    `, [`%${q}%`]);

    res.json({ applications: result.rows });
  } catch (error) {
    console.error('Erreur recherche dossiers:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// Ajouter une route pour récupérer un dossier spécifique
app.get('/api/applications/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT a.*, u.nom as user_nom, u.email as user_email 
       FROM applications a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    // Vérifier que l'utilisateur a le droit de voir ce dossier
    if (req.user.role !== 'admin' && result.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    res.json({ application: result.rows[0] });
  } catch (error) {
    console.error('Erreur récupération dossier:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter un utilisateur (Admin)
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { nom, email, telephone, role, motDePasse } = req.body;

    // Vérifier si l'utilisateur existe déjà 
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR telephone = $2',
      [email, telephone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Un utilisateur avec cet email ou téléphone existe déjà' });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(motDePasse, 10);

    // Insérer le nouvel utilisateur
    const result = await pool.query(
      'INSERT INTO users (nom, email, telephone, mot_de_passe, role, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
      [nom, email, telephone, hashedPassword, role]
    );

    const user = result.rows[0];
    delete user.mot_de_passe;

    res.status(201).json({ message: 'Utilisateur ajouté avec succès', user });
  } catch (error) {
    console.error('Erreur ajout utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques (Admin)
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = {};

    // Total utilisateurs
    const userCount = await pool.query('SELECT COUNT(*) FROM users WHERE role = $1', ['user']);
    stats.totalUsers = parseInt(userCount.rows[0].count);

    // Total dossiers
    const appCount = await pool.query('SELECT COUNT(*) FROM applications');
    stats.totalApplications = parseInt(appCount.rows[0].count);

    // Dossiers approuvés
    const approvedCount = await pool.query('SELECT COUNT(*) FROM applications WHERE statut = $1', ['approuve']);
    stats.approvedApplications = parseInt(approvedCount.rows[0].count);

    // Dossiers en attente
    const pendingCount = await pool.query('SELECT COUNT(*) FROM applications WHERE statut = $1', ['en-attente']);
    stats.pendingApplications = parseInt(pendingCount.rows[0].count);

    console.log('📊 Statistiques calculées:', stats);

    res.json({ stats });
  } catch (error) {
    console.error('Erreur récupération statistiques:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Routes utilisateur
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = { ...req.user };
    delete user.mot_de_passe; // Ne pas retourner le mot de passe
    
    res.json({ user });
  } catch (error) {
    console.error('Erreur récupération profil:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
// Mettre à jour le profil
app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { nom, email, telephone } = req.body;

    // Vérifier que l'email/téléphone n'est pas déjà utilisé par un autre utilisateur
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE (email = $1 OR telephone = $2) AND id != $3',
      [email, telephone, req.user.id]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Cet email ou téléphone est déjà utilisé' });
    }

    await pool.query(
      'UPDATE users SET nom = $1, email = $2, telephone = $3, updated_at = NOW() WHERE id = $4',
      [nom, email, telephone, req.user.id]
    );

    res.json({ message: 'Profil mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur mise à jour profil:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =================== ROUTES POUR LES FACULTÉS ===================

// Récupérer toutes les facultés
app.get('/api/admin/facultes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, 
             COUNT(fil.id) as nombre_filieres
      FROM facultes f
      LEFT JOIN filieres fil ON f.id = fil.faculte_id AND fil.active = true
      WHERE f.active = true
      GROUP BY f.id
      ORDER BY f.nom
    `);
    
    res.json({ facultes: result.rows });
  } catch (error) {
    console.error('Erreur récupération facultés:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer une nouvelle faculté
app.post('/api/admin/facultes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { nom, libelle, description } = req.body;
    
    if (!nom || !libelle) {
      return res.status(400).json({ error: 'Le nom et le libellé sont requis' });
    }
    
    const result = await pool.query(
      'INSERT INTO facultes (nom, libelle, description) VALUES ($1, $2, $3) RETURNING *',
      [nom.toUpperCase().trim(), libelle.trim(), description?.trim() || null]
    );
    
    res.status(201).json({ 
      message: 'Faculté créée avec succès', 
      faculte: result.rows[0] 
    });
  } catch (error) {
    if (error.code === '23505') { // Contrainte unique
      res.status(400).json({ error: 'Une faculté avec ce nom existe déjà' });
    } else {
      console.error('Erreur création faculté:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
});

// Modifier une faculté
app.put('/api/admin/facultes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, libelle, description, active } = req.body;
    
    const result = await pool.query(
      `UPDATE facultes 
       SET nom = $1, libelle = $2, description = $3, active = $4, updated_at = NOW()
       WHERE id = $5 
       RETURNING *`,
      [nom.toUpperCase().trim(), libelle.trim(), description?.trim() || null, active, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Faculté non trouvée' });
    }
    
    res.json({ message: 'Faculté mise à jour avec succès', faculte: result.rows[0] });
  } catch (error) {
    console.error('Erreur modification faculté:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une faculté (soft delete)
app.delete('/api/admin/facultes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier s'il y a des filières liées
    const filiereCheck = await pool.query(
      'SELECT COUNT(*) FROM filieres WHERE faculte_id = $1 AND active = true',
      [id]
    );
    
    if (parseInt(filiereCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Impossible de supprimer cette faculté car elle contient des filières actives' 
      });
    }
    
    const result = await pool.query(
      'UPDATE facultes SET active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Faculté non trouvée' });
    }
    
    res.json({ message: 'Faculté supprimée avec succès' });
  } catch (error) {
    console.error('Erreur suppression faculté:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =================== ROUTES POUR LES TYPES DE BAC ===================

// Récupérer tous les types de bac
// Récupérer tous les types de bac (Admin) - CORRECTION
app.get('/api/admin/type-bacs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tb.*, 
             COUNT(ftb.filiere_id) as nombre_filieres
      FROM type_bacs tb
      LEFT JOIN filiere_type_bacs ftb ON tb.id = ftb.type_bac_id
      LEFT JOIN filieres f ON ftb.filiere_id = f.id AND f.active = true
      WHERE tb.active = true
      GROUP BY tb.id
      ORDER BY tb.nom
    `);
    
    res.json({ typeBacs: result.rows });
  } catch (error) {
    console.error('Erreur récupération types de bac:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un nouveau type de bac
app.post('/api/admin/type-bacs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { nom, libelle, description } = req.body;
    
    if (!nom || !libelle) {
      return res.status(400).json({ error: 'Le nom et le libellé sont requis' });
    }
    
    const result = await pool.query(
      'INSERT INTO type_bacs (nom, libelle, description) VALUES ($1, $2, $3) RETURNING *',
      [nom.toUpperCase().trim(), libelle.trim(), description?.trim() || null]
    );
    
    res.status(201).json({ 
      message: 'Type de bac créé avec succès', 
      typeBac: result.rows[0] 
    });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Un type de bac avec ce nom existe déjà' });
    } else {
      console.error('Erreur création type de bac:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
});

// Modifier un type de bac
app.put('/api/admin/type-bacs/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, libelle, description, active } = req.body;
    
    const result = await pool.query(
      `UPDATE type_bacs 
       SET nom = $1, libelle = $2, description = $3, active = $4, updated_at = NOW()
       WHERE id = $5 
       RETURNING *`,
      [nom.toUpperCase().trim(), libelle.trim(), description?.trim() || null, active, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Type de bac non trouvé' });
    }
    
    res.json({ message: 'Type de bac mis à jour avec succès', typeBac: result.rows[0] });
  } catch (error) {
    console.error('Erreur modification type de bac:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =================== ROUTES POUR LES FILIÈRES ===================

// Récupérer toutes les filières (Admin) - CORRECTION
app.get('/api/admin/filieres', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, 
             fac.nom as faculte_nom, 
             fac.libelle as faculte_libelle,
             COUNT(DISTINCT app.id) as nombre_candidatures,
             ARRAY_AGG(DISTINCT tb.nom) FILTER (WHERE tb.nom IS NOT NULL) as types_bac_autorises
      FROM filieres f
      JOIN facultes fac ON f.faculte_id = fac.id
      LEFT JOIN filiere_type_bacs ftb ON f.id = ftb.filiere_id
      LEFT JOIN type_bacs tb ON ftb.type_bac_id = tb.id AND tb.active = true
      LEFT JOIN applications app ON f.nom = app.premier_choix OR f.nom = app.deuxieme_choix OR f.nom = app.troisieme_choix
      WHERE f.active = true AND fac.active = true
      GROUP BY f.id, fac.nom, fac.libelle
      ORDER BY fac.nom, f.nom
    `);
    
    res.json({ filieres: result.rows });
  } catch (error) {
    console.error('Erreur récupération filières:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
// Créer une nouvelle filière
app.post('/api/admin/filieres', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { nom, libelle, description, faculte_id, capacite_max, types_bac_ids } = req.body;
    
    if (!nom || !libelle || !faculte_id) {
      return res.status(400).json({ error: 'Le nom, le libellé et la faculté sont requis' });
    }
    
    // Commencer une transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Créer la filière
      const filiereResult = await client.query(
        `INSERT INTO filieres (nom, libelle, description, faculte_id, capacite_max) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [nom.toUpperCase().trim(), libelle.trim(), description?.trim() || null, faculte_id, capacite_max || null]
      );
      
      const filiere = filiereResult.rows[0];
      
      // Ajouter les types de bac autorisés
      if (types_bac_ids && types_bac_ids.length > 0) {
        for (const typeBacId of types_bac_ids) {
          await client.query(
            'INSERT INTO filiere_type_bacs (filiere_id, type_bac_id) VALUES ($1, $2)',
            [filiere.id, typeBacId]
          );
        }
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({ 
        message: 'Filière créée avec succès', 
        filiere 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Une filière avec ce nom existe déjà dans cette faculté' });
    } else {
      console.error('Erreur création filière:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
});

// Modifier une filière
app.put('/api/admin/filieres/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, libelle, description, faculte_id, capacite_max, active, types_bac_ids } = req.body;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Mettre à jour la filière
      const result = await client.query(
        `UPDATE filieres 
         SET nom = $1, libelle = $2, description = $3, faculte_id = $4, 
             capacite_max = $5, active = $6, updated_at = NOW()
         WHERE id = $7 
         RETURNING *`,
        [nom.toUpperCase().trim(), libelle.trim(), description?.trim() || null, 
         faculte_id, capacite_max || null, active, id]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Filière non trouvée');
      }
      
      // Mettre à jour les types de bac autorisés
      if (types_bac_ids !== undefined) {
        // Supprimer les anciennes associations
        await client.query('DELETE FROM filiere_type_bacs WHERE filiere_id = $1', [id]);
        
        // Ajouter les nouvelles associations
        if (types_bac_ids.length > 0) {
          for (const typeBacId of types_bac_ids) {
            await client.query(
              'INSERT INTO filiere_type_bacs (filiere_id, type_bac_id) VALUES ($1, $2)',
              [id, typeBacId]
            );
          }
        }
      }
      
      await client.query('COMMIT');
      
      res.json({ message: 'Filière mise à jour avec succès', filiere: result.rows[0] });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Erreur modification filière:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/admin/diplomes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*,  
             fac.libelle as faculte_libelle,
             f.nom as filiere_nom,
             f.libelle as filiere_libelle
      FROM diplomes d
      JOIN facultes fac ON d.faculte_id = fac.id
      LEFT JOIN filieres f ON d.filiere_id = f.id
      WHERE d.active = true AND fac.active = true
      ORDER BY fac.nom, f.nom
    `);
    
    res.json({ diplomes: result.rows });
    
  } catch (error) {
    console.error('❌ Erreur récupération diplômes:', error);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: error.message 
    });
  }
});

// Créer une nouvelle filière
app.post('/api/admin/diplomes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {libelle, faculte_id, filiere_id } = req.body;
    
    if (!libelle || !faculte_id || !filiere_id) {
      return res.status(400).json({ 
        error: 'le libellé, la faculté et la filière sont requis' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO diplomes (libelle, faculte_id, filiere_id) 
       VALUES ($1, $2, $3) RETURNING *`,
      [libelle.trim(), faculte_id, filiere_id]
    );
    
    res.status(201).json({ 
      message: 'Diplôme créé avec succès', 
      diplome: result.rows[0] 
    });
    
  } catch (error) {
    console.error('❌ Erreur création diplôme:', error);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: error.message 
    });
  }
});

// Modifier une filière
app.put('/api/admin/diplomes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, libelle, faculte_id, filiere_id, active } = req.body;
    
    const result = await pool.query(
      `UPDATE diplomes 
       SET libelle = $1, faculte_id = $2, filiere_id = $3, active = $4, updated_at = NOW()
       WHERE id = $5 
       RETURNING *`,
      [libelle.trim(), faculte_id, filiere_id, active !== false, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Diplôme non trouvé' });
    }
    
    res.json({ 
      message: 'Diplôme mis à jour avec succès', 
      diplome: result.rows[0] 
    });
    
  } catch (error) {
    console.error('❌ Erreur modification diplôme:', error);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: error.message 
    });
  }
});

app.delete('/api/admin/diplomes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE diplomes SET active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Diplôme non trouvé' });
    }
    
    res.json({ message: 'Diplôme supprimé avec succès' });
    
  } catch (error) {
    console.error('❌ Erreur suppression diplôme:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =================== ROUTES PUBLIQUES POUR LES FORMULAIRES ===================

// Récupérer les facultés actives (pour les formulaires publics)
app.get('/api/facultes', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nom, libelle FROM facultes WHERE active = true ORDER BY nom'
    );
    res.json({ facultes: result.rows });
  } catch (error) {
    console.error('Erreur récupération facultés publiques:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les types de bac actifs (route publique)
app.get('/api/type-bacs', async (req, res) => {
    try {
        console.log('📚 Récupération des types de bac publics');
        
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
        
        console.log(`✅ ${result.rows.length} types de bac trouvés`);
        
        res.json({ 
            typeBacs: result.rows,
            message: `${result.rows.length} type(s) de bac disponible(s)`
        });
        
    } catch (error) {
        console.error('❌ Erreur récupération types de bac publics:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la récupération des types de bac'
        });
    }
});


// Récupérer les filières actives avec filtrage optionnel par faculté ou type de bac
app.get('/api/filieres', async (req, res) => {
    try {
        const { faculte_id, type_bac } = req.query;
        
        console.log('📚 Récupération des filières publiques', { faculte_id, type_bac });
        
        let query = `
            SELECT DISTINCT f.id, f.nom, f.libelle, f.capacite_max, f.description,
                   fac.nom as faculte_nom, fac.libelle as faculte_libelle,
                   COUNT(app.id) as nombre_candidatures
            FROM filieres f
            JOIN facultes fac ON f.faculte_id = fac.id
        `;
        
        const params = [];
        const conditions = ['f.active = true', 'fac.active = true'];
        
        if (faculte_id) {
            conditions.push(`f.faculte_id = $${params.length + 1}`);
            params.push(faculte_id);
        }
        
        if (type_bac) {
            query += ` JOIN filiere_type_bacs ftb ON f.id = ftb.filiere_id
                       JOIN type_bacs tb ON ftb.type_bac_id = tb.id`;
            conditions.push(`tb.nom = $${params.length + 1}`);
            conditions.push('tb.active = true');
            params.push(type_bac);
        }
        
        query += ` LEFT JOIN applications app ON (
                       f.nom = app.premier_choix OR 
                       f.nom = app.deuxieme_choix OR 
                       f.nom = app.troisieme_choix
                   )
                   WHERE ` + conditions.join(' AND ') + `
                   GROUP BY f.id, f.nom, f.libelle, f.capacite_max, f.description,
                            fac.nom, fac.libelle
                   ORDER BY fac.nom, f.nom`;
        
        const result = await pool.query(query, params);
        
        console.log(`✅ ${result.rows.length} filières trouvées`);
        
        res.json({ 
            filieres: result.rows,
            filters: { faculte_id, type_bac },
            count: result.rows.length
        });
        
    } catch (error) {
        console.error('❌ Erreur récupération filières publiques:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la récupération des filières'
        });
    }
});

app.get('/api/debug/type-bacs-filieres', async (req, res) => {
    try {
        // Récupérer tous les types de bac avec leurs filières
        const result = await pool.query(`
            SELECT tb.nom as type_bac, tb.libelle as type_bac_libelle,
                   f.nom as filiere_nom, f.libelle as filiere_libelle,
                   fac.nom as faculte_nom
            FROM type_bacs tb
            LEFT JOIN filiere_type_bacs ftb ON tb.id = ftb.type_bac_id
            LEFT JOIN filieres f ON ftb.filiere_id = f.id AND f.active = true
            LEFT JOIN facultes fac ON f.faculte_id = fac.id AND fac.active = true
            WHERE tb.active = true
            ORDER BY tb.nom, fac.nom, f.nom
        `);
        
        // Organiser les données par type de bac
        const data = {};
        result.rows.forEach(row => {
            if (!data[row.type_bac]) {
                data[row.type_bac] = {
                    libelle: row.type_bac_libelle,
                    filieres: []
                };
            }
            if (row.filiere_nom) {
                data[row.type_bac].filieres.push({
                    nom: row.filiere_nom,
                    libelle: row.filiere_libelle,
                    faculte: row.faculte_nom
                });
            }
        });
        
        res.json({ debug_data: data });
        
    } catch (error) {
        console.error('❌ Erreur debug:', error);
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
// 2. Route pour récupérer les statistiques des filières par type de bac (optionnel)
app.get('/api/admin/stats/filieres-by-bac', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT tb.nom as type_bac, tb.libelle as type_bac_libelle,
                   COUNT(DISTINCT f.id) as nombre_filieres,
                   COUNT(DISTINCT app.id) as nombre_candidatures,
                   COUNT(DISTINCT CASE WHEN app.statut = 'approuve' THEN app.id END) as candidatures_approuvees
            FROM type_bacs tb
            LEFT JOIN filiere_type_bacs ftb ON tb.id = ftb.type_bac_id
            LEFT JOIN filieres f ON ftb.filiere_id = f.id AND f.active = true
            LEFT JOIN applications app ON (
                f.nom = app.premier_choix OR 
                f.nom = app.deuxieme_choix OR 
                f.nom = app.troisieme_choix
            )
            WHERE tb.active = true
            GROUP BY tb.id, tb.nom, tb.libelle
            ORDER BY tb.nom
        `);
        
        res.json({ stats: result.rows });
    } catch (error) {
        console.error('Erreur statistiques filières par bac:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


// =================== STATISTIQUES AVANCÉES ===================

// Statistiques détaillées par faculté
app.get('/api/admin/stats/facultes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.nom, f.libelle,
             COUNT(DISTINCT fil.id) as nombre_filieres,
             COUNT(DISTINCT CASE 
               WHEN app.premier_choix = fil.nom OR 
                    app.deuxieme_choix = fil.nom OR 
                    app.troisieme_choix = fil.nom 
               THEN app.id END) as nombre_candidatures,
             COUNT(DISTINCT CASE 
               WHEN (app.premier_choix = fil.nom OR 
                     app.deuxieme_choix = fil.nom OR 
                     app.troisieme_choix = fil.nom) 
                    AND app.statut = 'approuve'
               THEN app.id END) as candidatures_approuvees
      FROM facultes f
      LEFT JOIN filieres fil ON f.id = fil.faculte_id AND fil.active = true
      LEFT JOIN applications app ON (fil.nom = app.premier_choix OR 
                                   fil.nom = app.deuxieme_choix OR 
                                   fil.nom = app.troisieme_choix)
      WHERE f.active = true
      GROUP BY f.id, f.nom, f.libelle
      ORDER BY f.nom
    `);
    
    res.json({ stats: result.rows });
  } catch (error) {
    console.error('Erreur statistiques facultés:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 3. Route pour récupérer les informations détaillées d'une filière
app.get('/api/filieres/:id/details', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT f.*, fac.nom as faculte_nom, fac.libelle as faculte_libelle,
                   COUNT(DISTINCT app.id) as nombre_candidatures,
                   COUNT(DISTINCT CASE WHEN app.statut = 'approuve' THEN app.id END) as candidatures_approuvees,
                   ARRAY_AGG(DISTINCT tb.nom) FILTER (WHERE tb.nom IS NOT NULL) as types_bac_autorises,
                   ARRAY_AGG(DISTINCT tb.libelle) FILTER (WHERE tb.libelle IS NOT NULL) as types_bac_libelles
            FROM filieres f
            JOIN facultes fac ON f.faculte_id = fac.id
            LEFT JOIN filiere_type_bacs ftb ON f.id = ftb.filiere_id
            LEFT JOIN type_bacs tb ON ftb.type_bac_id = tb.id AND tb.active = true
            LEFT JOIN applications app ON (
                f.nom = app.premier_choix OR 
                f.nom = app.deuxieme_choix OR 
                f.nom = app.troisieme_choix
            )
            WHERE f.id = $1 AND f.active = true
            GROUP BY f.id, fac.nom, fac.libelle
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Filière non trouvée' });
        }
        
        res.json({ filiere: result.rows[0] });
    } catch (error) {
        console.error('Erreur récupération détails filière:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// 4. Route pour vérifier la disponibilité d'une filière
app.get('/api/filieres/:nom/availability', async (req, res) => {
    try {
        const { nom } = req.params;
        
        const result = await pool.query(`
            SELECT f.capacite_max,
                   COUNT(DISTINCT CASE WHEN app.statut = 'approuve' THEN app.id END) as places_prises,
                   (f.capacite_max - COUNT(DISTINCT CASE WHEN app.statut = 'approuve' THEN app.id END)) as places_disponibles,
                   CASE 
                       WHEN f.capacite_max IS NULL THEN true
                       WHEN f.capacite_max > COUNT(DISTINCT CASE WHEN app.statut = 'approuve' THEN app.id END) THEN true
                       ELSE false
                   END as places_disponibles_bool
            FROM filieres f
            LEFT JOIN applications app ON (
                f.nom = app.premier_choix OR 
                f.nom = app.deuxieme_choix OR 
                f.nom = app.troisieme_choix
            )
            WHERE f.nom ILIKE $1 AND f.active = true
            GROUP BY f.id, f.capacite_max
        `, [nom]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Filière non trouvée' });
        }
        
        const availability = result.rows[0];
        availability.message = availability.places_disponibles_bool ? 
            'Places disponibles' : 
            'Capacité maximale atteinte';
            
        res.json({ availability });
    } catch (error) {
        console.error('Erreur vérification disponibilité filière:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 5. Route pour récupérer toutes les filières avec leurs types de bac autorisés (pour l'admin)
app.get('/api/admin/filieres-complete', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT f.*, 
                   fac.nom as faculte_nom, 
                   fac.libelle as faculte_libelle,
                   COUNT(DISTINCT app.id) as nombre_candidatures,
                   COUNT(DISTINCT CASE WHEN app.statut = 'approuve' THEN app.id END) as candidatures_approuvees,
                   ARRAY_AGG(DISTINCT tb.nom ORDER BY tb.nom) FILTER (WHERE tb.nom IS NOT NULL) as types_bac_autorises,
                   ARRAY_AGG(DISTINCT JSONB_BUILD_OBJECT('id', tb.id, 'nom', tb.nom, 'libelle', tb.libelle)) FILTER (WHERE tb.id IS NOT NULL) as types_bac_details
            FROM filieres f
            JOIN facultes fac ON f.faculte_id = fac.id
            LEFT JOIN filiere_type_bacs ftb ON f.id = ftb.filiere_id
            LEFT JOIN type_bacs tb ON ftb.type_bac_id = tb.id AND tb.active = true
            LEFT JOIN applications app ON (
                f.nom = app.premier_choix OR 
                f.nom = app.deuxieme_choix OR 
                f.nom = app.troisieme_choix
            )
            WHERE f.active = true AND fac.active = true
            GROUP BY f.id, fac.nom, fac.libelle
            ORDER BY fac.nom, f.nom
        `);
        
        res.json({ filieres: result.rows });
    } catch (error) {
        console.error('Erreur récupération filières complètes:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 6. Route pour mettre à jour les types de bac d'une filière
app.put('/api/admin/filieres/:id/types-bac', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { types_bac_ids } = req.body;
        
        if (!Array.isArray(types_bac_ids)) {
            return res.status(400).json({ error: 'types_bac_ids doit être un tableau' });
        }
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Supprimer les anciennes associations
            await client.query('DELETE FROM filiere_type_bacs WHERE filiere_id = $1', [id]);
            
            // Ajouter les nouvelles associations
            for (const typeBacId of types_bac_ids) {
                await client.query(
                    'INSERT INTO filiere_type_bacs (filiere_id, type_bac_id) VALUES ($1, $2)',
                    [id, typeBacId]
                );
            }
            
            await client.query('COMMIT');
            
            res.json({ message: 'Types de bac mis à jour avec succès' });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Erreur mise à jour types de bac:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Changer le mot de passe
app.put('/api/change-password', authenticateToken, async (req, res) => {
  try {
    const { ancienMotDePasse, nouveauMotDePasse } = req.body;

    // Récupérer le mot de passe actuel
    const result = await pool.query('SELECT mot_de_passe FROM users WHERE id = $1', [req.user.id]);
    const currentPassword = result.rows[0].mot_de_passe;

    // Vérifier l'ancien mot de passe
    const validPassword = await bcrypt.compare(ancienMotDePasse, currentPassword);
    if (!validPassword) {
      return res.status(400).json({ error: 'Ancien mot de passe incorrect' });
    }

    // Hasher le nouveau mot de passe
    const hashedNewPassword = await bcrypt.hash(nouveauMotDePasse, 10);

    // Mettre à jour
    await pool.query(
      'UPDATE users SET mot_de_passe = $1, updated_at = NOW() WHERE id = $2',
      [hashedNewPassword, req.user.id]
    );

    res.json({ message: 'Mot de passe changé avec succès' });
  } catch (error) {
    console.error('Erreur changement mot de passe:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Export des données (Admin)
app.get('/api/admin/export/:type', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type } = req.params;

    if (type === 'users') {
      const result = await pool.query(
        'SELECT nom, email, telephone, role, created_at FROM users ORDER BY created_at DESC'
      );
      
      // Convertir en CSV
      const csv = [
        'Nom,Email,Téléphone,Rôle,Date d\'inscription',
        ...result.rows.map(row => 
          `"${row.nom}","${row.email}","${row.telephone}","${row.role}","${new Date(row.created_at).toLocaleDateString('fr-FR')}"`
        )
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=utilisateurs.csv');
      res.send(csv);
      
    } else if (type === 'applications') {
      const result = await pool.query(`
        SELECT a.numero_dossier, a.nom, a.prenom,a.date_naissance,a.lieu_naissance,a.lieu_obtention,a.nationalite,a.adresse, a.email, a.premier_choix,a.deuxieme_choix,a.troisieme_choix,
               a.type_bac, a.statut, a.created_at
        FROM applications a
        ORDER BY a.created_at DESC
      `);
      
      const csv = [
        'Numéro dossier,Nom,Prénom,Date_Naiss,Lieu_Naiss,Lieu_Obtention,Adress,Nationalite,Email,Premier choix, Deuxieme choix, Troisieme Choix,Type Bac,Statut,Date de dépôt',
        ...result.rows.map(row => 
          `"${row.numero_dossier}","${row.nom}","${row.prenom}","${row.email}","${row.premier_choix}","${row.type_bac}","${row.statut}","${new Date(row.created_at).toLocaleDateString('fr-FR')}"`
        )
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=dossiers.csv');
      res.send(csv);
    } else {
      res.status(400).json({ error: 'Type d\'export invalide' });
    }
  } catch (error) {
    console.error('Erreur export:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route catch-all pour le frontend SPA (doit être à la fin)


// Ajouter ces routes dans server.js après les routes existantes

// =================== NOUVELLES ROUTES STATISTIQUES AVEC GRAPHIQUES ===================

// Statistiques par genre
app.get('/api/admin/stats/genre', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('👫 Récupération stats genre...');
    
    const result = await pool.query(`
      SELECT 
        genre,
        COUNT(*) as nombre,
        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves,
        COUNT(CASE WHEN statut = 'rejete' THEN 1 END) as rejetes,
        COUNT(CASE WHEN statut = 'en-attente' THEN 1 END) as en_attente
      FROM applications 
      WHERE genre IS NOT NULL AND TRIM(genre) != ''
      GROUP BY genre 
      ORDER BY nombre DESC
    `);
    
    const response = {
      success: true,
      stats: result.rows.map(row => ({
        genre: row.genre,
        nombre: parseInt(row.nombre),
        approuves: parseInt(row.approuves),
        rejetes: parseInt(row.rejetes),
        en_attente: parseInt(row.en_attente)
      }))
    };
    
    console.log(`✅ ${result.rows.length} stats genre récupérées`);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Erreur stats genre:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur',
      details: error.message
    });
  }
});
// Statistiques par filière
app.get('/api/admin/stats/filieres', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('📚 Récupération stats filières...');
    
    const result = await pool.query(`
      SELECT 
        premier_choix as filiere,
        COUNT(*) as nombre,
        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves
      FROM applications 
      WHERE premier_choix IS NOT NULL 
        AND TRIM(premier_choix) != ''
      GROUP BY premier_choix 
      ORDER BY nombre DESC 
      LIMIT 15
    `);
    
    const response = {
      success: true,
      stats: result.rows.map(row => ({
        filiere: row.filiere,
        nombre: parseInt(row.nombre),
        approuves: parseInt(row.approuves)
      }))
    };
    
    console.log(`✅ ${result.rows.length} stats filières récupérées`);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Erreur stats filières:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur',
      details: error.message
    });
  }
});


// Statistiques par type de bac
app.get('/api/admin/stats/type-bac', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🎓 Récupération stats type bac...');
    
    const result = await pool.query(`
      SELECT 
        type_bac,
        COUNT(*) as nombre,
        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves
      FROM applications 
      WHERE type_bac IS NOT NULL 
        AND TRIM(type_bac) != ''
      GROUP BY type_bac 
      ORDER BY nombre DESC
    `);
    
    const response = {
      success: true,
      stats: result.rows.map(row => ({
        type_bac: row.type_bac,
        nombre: parseInt(row.nombre),
        approuves: parseInt(row.approuves)
      }))
    };
    
    console.log(`✅ ${result.rows.length} stats type bac récupérées`);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Erreur stats type bac:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur',
      details: error.message
    });
  }
});
app.get('/api/admin/stats/test-data', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🔍 Test données statistiques...');
    
    // Compter total
    const countResult = await pool.query('SELECT COUNT(*) as total FROM applications');
    const totalApplications = parseInt(countResult.rows[0].total);
    
    console.log(`Total applications: ${totalApplications}`);
    
    if (totalApplications === 0) {
      return res.json({
        success: false,
        message: 'Aucun dossier trouvé en base de données',
        total: 0,
        suggestions: [
          'Vérifiez que des dossiers ont été soumis',
          'Vérifiez la connexion à la base de données',
          'Créez des données de test si nécessaire'
        ]
      });
    }
    
    // Échantillon
    const sampleResult = await pool.query(`
      SELECT id, nom, prenom, genre, type_bac, premier_choix, statut, created_at 
      FROM applications 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    // Répartitions
    const statusResult = await pool.query(`
      SELECT statut, COUNT(*) as count 
      FROM applications 
      GROUP BY statut
    `);
    
    const genderResult = await pool.query(`
      SELECT genre, COUNT(*) as count 
      FROM applications 
      WHERE genre IS NOT NULL
      GROUP BY genre
    `);
    
    const bacResult = await pool.query(`
      SELECT type_bac, COUNT(*) as count 
      FROM applications 
      WHERE type_bac IS NOT NULL AND type_bac != ''
      GROUP BY type_bac
    `);
    
    res.json({
      success: true,
      total_applications: totalApplications,
      sample_data: sampleResult.rows,
      distributions: {
        status: statusResult.rows,
        gender: genderResult.rows,
        bac_type: bacResult.rows
      },
      message: 'Données récupérées avec succès'
    });
    
  } catch (error) {
    console.error('❌ Erreur test données:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du test des données',
      details: error.message
    });
  }
});

// 6. ROUTE DE NETTOYAGE DES DONNÉES
app.delete('/api/admin/stats/clear-test-data', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🗑️ Nettoyage données de test...');
    
    const result = await pool.query('DELETE FROM applications WHERE email LIKE \'%@test.com\'');
    const deletedCount = result.rowCount;
    
    console.log(`🗑️ ${deletedCount} dossiers de test supprimés`);
    
    res.json({
      success: true,
      message: `${deletedCount} dossiers de test supprimés`,
      deleted_count: deletedCount
    });
    
  } catch (error) {
    console.error('❌ Erreur nettoyage:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du nettoyage',
      details: error.message
    });
  }
});

// 7. MIDDLEWARE DE GESTION D'ERREUR GLOBAL POUR LES STATS
app.use('/api/admin/stats', (error, req, res, next) => {
    console.error('MIDDLEWARE ERREUR STATS:', error);
    
    // Forcer JSON même en cas d'erreur
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    if (res.headersSent) {
        return next(error);
    }
    
    const errorResponse = {
        success: false,
        error: 'Erreur dans le module statistiques',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Erreur interne',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    };
    
    res.status(500).json(errorResponse);
});

console.log('Corrections JSON appliquées - Redémarrez le serveur');

// Statistiques par lieu d'obtention
app.get('/api/admin/stats/lieu-obtention', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        lieu_obtention,
        COUNT(*) as nombre,
        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves,
        COUNT(CASE WHEN statut = 'rejete' THEN 1 END) as rejetes,
        COUNT(CASE WHEN statut = 'en-attente' THEN 1 END) as en_attente,
        COUNT(DISTINCT type_bac) as diversite_bacs
      FROM applications 
      GROUP BY lieu_obtention 
      ORDER BY nombre DESC
    `);
    
    res.json({ 
      stats: result.rows,
      total: result.rows.reduce((sum, row) => sum + parseInt(row.nombre), 0)
    });
  } catch (error) {
    console.error('Erreur statistiques par lieu d\'obtention:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques temporelles (évolution par mois)
app.get('/api/admin/stats/temporelles', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as mois,
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as mois_libelle,
        COUNT(*) as nombre_candidatures,
        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves,
        COUNT(CASE WHEN genre = 'masculin' THEN 1 END) as hommes,
        COUNT(CASE WHEN genre = 'feminin' THEN 1 END) as femmes
      FROM applications 
      WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at) 
      ORDER BY mois
    `);
    
    res.json({ 
      stats: result.rows,
      period: '12 derniers mois'
    });
  } catch (error) {
    console.error('Erreur statistiques temporelles:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques par faculté
// Dans server.js, remplacer la route /api/admin/stats/facultes-candidatures
app.get('/api/admin/stats/facultes-candidatures', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('Récupération stats facultés...');
    
    const result = await pool.query(`
      SELECT 
        fac.nom as faculte,
        fac.libelle as faculte_libelle,
        COUNT(DISTINCT f.id) as nombre_filieres,
        COUNT(CASE WHEN UPPER(TRIM(a.premier_choix)) = UPPER(TRIM(f.nom)) THEN a.id END)::integer as premier_choix,
        COUNT(CASE WHEN UPPER(TRIM(a.deuxieme_choix)) = UPPER(TRIM(f.nom)) THEN a.id END)::integer as deuxieme_choix,
        COUNT(CASE WHEN UPPER(TRIM(a.troisieme_choix)) = UPPER(TRIM(f.nom)) THEN a.id END)::integer as troisieme_choix,
        COUNT(CASE 
          WHEN (UPPER(TRIM(a.premier_choix)) = UPPER(TRIM(f.nom)) OR 
                UPPER(TRIM(a.deuxieme_choix)) = UPPER(TRIM(f.nom)) OR 
                UPPER(TRIM(a.troisieme_choix)) = UPPER(TRIM(f.nom)))
               AND a.statut = 'approuve' 
          THEN a.id END)::integer as approuves,
        (COUNT(CASE WHEN UPPER(TRIM(a.premier_choix)) = UPPER(TRIM(f.nom)) THEN a.id END) +
         COUNT(CASE WHEN UPPER(TRIM(a.deuxieme_choix)) = UPPER(TRIM(f.nom)) THEN a.id END) +
         COUNT(CASE WHEN UPPER(TRIM(a.troisieme_choix)) = UPPER(TRIM(f.nom)) THEN a.id END))::integer as total_candidatures
      FROM facultes fac
      JOIN filieres f ON f.faculte_id = fac.id AND f.active = true
      LEFT JOIN applications a ON (
        UPPER(TRIM(a.premier_choix)) = UPPER(TRIM(f.nom)) OR
        UPPER(TRIM(a.deuxieme_choix)) = UPPER(TRIM(f.nom)) OR
        UPPER(TRIM(a.troisieme_choix)) = UPPER(TRIM(f.nom))
      )
      WHERE fac.active = true
      GROUP BY fac.id, fac.nom, fac.libelle
      HAVING COUNT(CASE WHEN UPPER(TRIM(a.premier_choix)) = UPPER(TRIM(f.nom)) THEN a.id END) +
             COUNT(CASE WHEN UPPER(TRIM(a.deuxieme_choix)) = UPPER(TRIM(f.nom)) THEN a.id END) +
             COUNT(CASE WHEN UPPER(TRIM(a.troisieme_choix)) = UPPER(TRIM(f.nom)) THEN a.id END) > 0
      ORDER BY total_candidatures DESC
    `);
    
    console.log(`${result.rows.length} facultés trouvées avec candidatures`);
    
    res.json({ 
      success: true,
      stats: result.rows,
      total: result.rows.reduce((sum, row) => sum + parseInt(row.total_candidatures || 0), 0)
    });
    
  } catch (error) {
    console.error('Erreur stats facultés:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur',
      details: error.message 
    });
  }
});
// Export détaillé des candidatures avec toutes les informations
app.get('/api/admin/export/candidatures-complete', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('📊 Export complet des candidatures...');
    
    const result = await pool.query(`
      SELECT 
        -- Numéros
        a.id,
        a.numero_dossier,
        a.numero_depot,
        
        -- Informations personnelles
        a.nom,
        a.prenom,
        TO_CHAR(a.date_naissance, 'DD/MM/YYYY') as date_naissance,
        a.lieu_naissance,
        a.nationalite,
        CASE WHEN a.genre = 'masculin' THEN 'Masculin' ELSE 'Féminin' END as genre,
        a.adresse,
        a.telephone,
        a.email,
        
        -- Informations baccalauréat
        a.type_bac,
        a.lieu_obtention,
        a.annee_obtention,
        a.mention,
        
        -- Choix de formation
        a.premier_choix,
        a.deuxieme_choix,
        a.troisieme_choix,
        
        -- Statut et dates
        CASE 
          WHEN a.statut = 'approuve' THEN 'Approuvé'
          WHEN a.statut = 'rejete' THEN 'Rejeté'
          ELSE 'En attente'
        END as statut,
        TO_CHAR(a.created_at, 'DD/MM/YYYY HH24:MI') as date_depot,
        TO_CHAR(a.updated_at, 'DD/MM/YYYY HH24:MI') as date_modification,
        
        -- Informations utilisateur
        u.id as user_id,
        u.nom as nom_utilisateur,
        u.email as email_utilisateur,
        u.telephone as telephone_utilisateur,
        
        -- Informations de la filière du premier choix
        f1.id as filiere_id,
        f1.libelle as premier_choix_libelle,
        f1.capacite_max as capacite_filiere,
        fac1.id as faculte_id,
        fac1.nom as faculte_premier_choix,
        fac1.libelle as faculte_libelle,
        
        -- Documents (vérification présence)
        CASE WHEN a.documents::text LIKE '%photoIdentite%' AND a.documents::text NOT LIKE '%"photoIdentite":"Non fourni"%' THEN 'Oui' ELSE 'Non' END as photo_identite,
        CASE WHEN a.documents::text LIKE '%pieceIdentite%' AND a.documents::text NOT LIKE '%"pieceIdentite":"Non fourni"%' THEN 'Oui' ELSE 'Non' END as piece_identite,
        CASE WHEN a.documents::text LIKE '%diplomeBac%' AND a.documents::text NOT LIKE '%"diplomeBac":"Non fourni"%' THEN 'Oui' ELSE 'Non' END as diplome_bac,
        CASE WHEN a.documents::text LIKE '%releve%' AND a.documents::text NOT LIKE '%"releve":"Non fourni"%' THEN 'Oui' ELSE 'Non' END as releve_notes,
        CASE WHEN a.documents::text LIKE '%certificatNationalite%' AND a.documents::text NOT LIKE '%"certificatNationalite":"Non fourni"%' AND a.documents::text NOT LIKE '%"certificatNationalite":"Optionnel"%' THEN 'Oui' ELSE 'Non' END as certificat_nationalite,
        
        -- Documents JSON complet (optionnel)
        a.documents::text as documents_json
        
      FROM applications a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN filieres f1 ON UPPER(TRIM(f1.nom)) = UPPER(TRIM(a.premier_choix))
      LEFT JOIN facultes fac1 ON f1.faculte_id = fac1.id
      ORDER BY a.created_at DESC
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aucune candidature trouvée' });
    }
    
    // Créer le CSV avec TOUS les champs
    const headers = [
      'ID',
      'Numero Dossier',
      'Numero Depot',
      'Nom',
      'Prenom',
      'Date Naissance',
      'Lieu Naissance',
      'Nationalite',
      'Genre',
      'Adresse',
      'Telephone',
      'Email',
      'Type Bac',
      'Lieu Obtention',
      'Annee Obtention',
      'Mention',
      'Premier Choix',
      'Filiere Premier Choix',
      'Faculte Premier Choix',
      'Faculte Libelle',
      'Capacite Filiere',
      'Deuxieme Choix',
      'Troisieme Choix',
      'Statut',
      'Date Depot',
      'Date Modification',
      'User ID',
      'Nom Utilisateur',
      'Email Utilisateur',
      'Telephone Utilisateur',
      'Photo Identite',
      'Piece Identite',
      'Diplome Bac',
      'Releve Notes',
      'Certificat Nationalite'
    ].join(',');
    
    const rows = result.rows.map(row => {
      return [
        row.id,
        row.numero_dossier,
        row.numero_depot || 'N/A',
        `"${(row.nom || '').replace(/"/g, '""')}"`,
        `"${(row.prenom || '').replace(/"/g, '""')}"`,
        row.date_naissance,
        `"${(row.lieu_naissance || '').replace(/"/g, '""')}"`,
        row.nationalite,
        row.genre,
        `"${(row.adresse || '').replace(/"/g, '""')}"`,
        row.telephone,
        row.email,
        row.type_bac,
        `"${(row.lieu_obtention || '').replace(/"/g, '""')}"`,
        row.annee_obtention,
        row.mention,
        `"${(row.premier_choix || '').replace(/"/g, '""')}"`,
        `"${(row.premier_choix_libelle || row.premier_choix || '').replace(/"/g, '""')}"`,
        `"${(row.faculte_premier_choix || 'N/A').replace(/"/g, '""')}"`,
        `"${(row.faculte_libelle || 'N/A').replace(/"/g, '""')}"`,
        row.capacite_filiere || 'Illimitée',
        `"${(row.deuxieme_choix || '').replace(/"/g, '""')}"`,
        `"${(row.troisieme_choix || '').replace(/"/g, '""')}"`,
        row.statut,
        row.date_depot,
        row.date_modification,
        row.user_id,
        `"${(row.nom_utilisateur || '').replace(/"/g, '""')}"`,
        row.email_utilisateur,
        row.telephone_utilisateur,
        row.photo_identite,
        row.piece_identite,
        row.diplome_bac,
        row.releve_notes,
        row.certificat_nationalite
      ].join(',');
    });
    
    const csv = [headers, ...rows].join('\n');
    
    const filename = `candidatures_complete_${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM UTF-8 pour Excel
    
    console.log(`✅ Export de ${result.rows.length} candidatures avec tous les champs`);
    
  } catch (error) {
    console.error('❌ Erreur export complet:', error);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: error.message 
    });
  }
});
// Export par section spécifique (genre, faculté, etc.)
// =================== DANS SERVER.JS - AJOUTER CES ROUTES ===================

// 1. INSTALLER D'ABORD LE PACKAGE EXCEL


// =================== ROUTES D'EXPORT CORRIGÉES ===================

// Export Excel des dossiers approuvés (COMPLET)
app.get('/api/admin/export/approuves-excel', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('📊 Export Excel des dossiers approuvés...');
    
    const result = await pool.query(`
      SELECT 
        a.numero_dossier,
        a.numero_depot,
        a.nom,
        a.prenom,
        TO_CHAR(a.date_naissance, 'DD/MM/YYYY') as date_naissance,
        a.lieu_naissance,
        a.nationalite,
        CASE WHEN a.genre = 'masculin' THEN 'Masculin' ELSE 'Féminin' END as genre,
        a.adresse,
        a.telephone,
        a.email,
        a.type_bac,
        a.lieu_obtention,
        a.annee_obtention,
        a.mention,
        a.premier_choix,
        a.deuxieme_choix,
        a.troisieme_choix,
        TO_CHAR(a.created_at, 'DD/MM/YYYY HH24:MI') as date_depot,
        -- Informations de la filière
        f1.libelle as premier_choix_libelle,
        fac1.nom as faculte_premier_choix,
        fac1.libelle as faculte_libelle,
        -- Vérification documents
        CASE WHEN a.documents::text LIKE '%photoIdentite%' THEN 'Oui' ELSE 'Non' END as photo_identite,
        CASE WHEN a.documents::text LIKE '%pieceIdentite%' THEN 'Oui' ELSE 'Non' END as piece_identite,
        CASE WHEN a.documents::text LIKE '%diplomeBac%' THEN 'Oui' ELSE 'Non' END as diplome_bac,
        CASE WHEN a.documents::text LIKE '%releve%' THEN 'Oui' ELSE 'Non' END as releve_notes,
        CASE WHEN a.documents::text LIKE '%certificatNationalite%' THEN 'Oui' ELSE 'Non' END as certificat_nationalite,
        u.nom as nom_compte_utilisateur,
        u.email as email_compte
      FROM applications a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN filieres f1 ON UPPER(TRIM(f1.nom)) = UPPER(TRIM(a.premier_choix))
      LEFT JOIN facultes fac1 ON f1.faculte_id = fac1.id
      WHERE a.statut = 'approuve'
      ORDER BY a.created_at DESC
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aucun dossier approuvé trouvé' });
    }
    
    // Créer le workbook Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Université Djibo Hamani - EduFile';
    workbook.created = new Date();
    
    // Feuille principale - Tous les dossiers approuvés
    const worksheet = workbook.addWorksheet('Dossiers Approuvés', {
      properties: { tabColor: { argb: '28a745' } }
    });
    
    // Définir les colonnes avec largeurs
    worksheet.columns = [
      { header: 'N° Dossier', key: 'numero_dossier', width: 15 },
      { header: 'N° Dépôt', key: 'numero_depot', width: 15 },
      { header: 'Nom', key: 'nom', width: 20 },
      { header: 'Prénom', key: 'prenom', width: 20 },
      { header: 'Date Naissance', key: 'date_naissance', width: 15 },
      { header: 'Lieu Naissance', key: 'lieu_naissance', width: 20 },
      { header: 'Nationalité', key: 'nationalite', width: 15 },
      { header: 'Genre', key: 'genre', width: 12 },
      { header: 'Adresse', key: 'adresse', width: 30 },
      { header: 'Téléphone', key: 'telephone', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Type Bac', key: 'type_bac', width: 12 },
      { header: 'Lieu Obtention', key: 'lieu_obtention', width: 15 },
      { header: 'Année Obtention', key: 'annee_obtention', width: 15 },
      { header: 'Mention', key: 'mention', width: 12 },
      { header: 'Premier Choix', key: 'premier_choix', width: 20 },
      { header: 'Filière Libellé', key: 'premier_choix_libelle', width: 30 },
      { header: 'Faculté', key: 'faculte_premier_choix', width: 15 },
      { header: 'Faculté Libellé', key: 'faculte_libelle', width: 35 },
      { header: 'Deuxième Choix', key: 'deuxieme_choix', width: 20 },
      { header: 'Troisième Choix', key: 'troisieme_choix', width: 20 },
      { header: 'Date Dépôt', key: 'date_depot', width: 18 },
      { header: 'Photo', key: 'photo_identite', width: 8 },
      { header: 'Pièce ID', key: 'piece_identite', width: 8 },
      { header: 'Diplôme', key: 'diplome_bac', width: 8 },
      { header: 'Relevé', key: 'releve_notes', width: 8 },
      { header: 'Certificat', key: 'certificat_nationalite', width: 10 }
    ];
    
    // Style de l'en-tête
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '28a745' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 25;
    
    // Ajouter les données
    result.rows.forEach((row, index) => {
      const excelRow = worksheet.addRow(row);
      
      // Alternance de couleurs
      if (index % 2 === 0) {
        excelRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'F8F9FA' }
        };
      }
      
      // Colorer les documents manquants en rouge
      ['photo_identite', 'piece_identite', 'diplome_bac', 'releve_notes'].forEach((doc, colIndex) => {
        const cell = excelRow.getCell(23 + colIndex);
        if (cell.value === 'Non') {
          cell.font = { color: { argb: 'DC3545' }, bold: true };
        } else {
          cell.font = { color: { argb: '28a745' }, bold: true };
        }
      });
    });
    
    // Bordures pour toutes les cellules
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
    
    // Figer la première ligne
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }
    ];
    
    // ===== FEUILLE 2: STATISTIQUES PAR FACULTÉ =====
    const statsSheet = workbook.addWorksheet('Statistiques par Faculté', {
      properties: { tabColor: { argb: '667eea' } }
    });
    
    const statsResult = await pool.query(`
      SELECT 
        fac.nom as faculte,
        fac.libelle as faculte_libelle,
        COUNT(DISTINCT a.id) as total_approuves,
        COUNT(DISTINCT CASE WHEN a.genre = 'masculin' THEN a.id END) as hommes,
        COUNT(DISTINCT CASE WHEN a.genre = 'feminin' THEN a.id END) as femmes,
        STRING_AGG(DISTINCT a.type_bac, ', ') as types_bac
      FROM applications a
      JOIN filieres f ON UPPER(TRIM(f.nom)) = UPPER(TRIM(a.premier_choix))
      JOIN facultes fac ON f.faculte_id = fac.id
      WHERE a.statut = 'approuve'
      GROUP BY fac.nom, fac.libelle
      ORDER BY total_approuves DESC
    `);
    
    statsSheet.columns = [
      { header: 'Faculté', key: 'faculte', width: 20 },
      { header: 'Libellé', key: 'faculte_libelle', width: 40 },
      { header: 'Total Approuvés', key: 'total_approuves', width: 18 },
      { header: 'Hommes', key: 'hommes', width: 12 },
      { header: 'Femmes', key: 'femmes', width: 12 },
      { header: 'Types Bac', key: 'types_bac', width: 30 }
    ];
    
    statsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    statsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '667eea' }
    };
    
    statsResult.rows.forEach(row => {
      statsSheet.addRow(row);
    });
    
    // ===== FEUILLE 3: PAR FILIÈRE =====
    const filiereSheet = workbook.addWorksheet('Par Filière', {
      properties: { tabColor: { argb: 'ffc107' } }
    });
    
    const filiereResult = await pool.query(`
      SELECT 
        a.premier_choix as filiere,
        f.libelle as filiere_libelle,
        fac.nom as faculte,
        COUNT(*) as nombre_approuves,
        COUNT(CASE WHEN a.genre = 'masculin' THEN 1 END) as hommes,
        COUNT(CASE WHEN a.genre = 'feminin' THEN 1 END) as femmes
      FROM applications a
      LEFT JOIN filieres f ON UPPER(TRIM(f.nom)) = UPPER(TRIM(a.premier_choix))
      LEFT JOIN facultes fac ON f.faculte_id = fac.id
      WHERE a.statut = 'approuve'
      GROUP BY a.premier_choix, f.libelle, fac.nom
      ORDER BY nombre_approuves DESC
    `);
    
    filiereSheet.columns = [
      { header: 'Filière', key: 'filiere', width: 20 },
      { header: 'Libellé', key: 'filiere_libelle', width: 35 },
      { header: 'Faculté', key: 'faculte', width: 20 },
      { header: 'Approuvés', key: 'nombre_approuves', width: 15 },
      { header: 'Hommes', key: 'hommes', width: 12 },
      { header: 'Femmes', key: 'femmes', width: 12 }
    ];
    
    filiereSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    filiereSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'ffc107' }
    };
    
    filiereResult.rows.forEach(row => {
      filiereSheet.addRow(row);
    });
    
    // Générer le fichier
    const filename = `Dossiers_Approuves_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    await workbook.xlsx.write(res);
    res.end();
    
    console.log(`✅ Export Excel de ${result.rows.length} dossiers approuvés`);
    
  } catch (error) {
    console.error('❌ Erreur export Excel:', error);
    res.status(500).json({ 
      error: 'Erreur serveur lors de l\'export Excel',
      details: error.message 
    });
  }
});

// Export par section (CORRIGÉ)
app.get('/api/admin/export/section/:type', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { type } = req.params;
        const { filter } = req.query;
        
        console.log(`📊 Export section ${type}${filter ? ` - Filtre: ${filter}` : ''}`);
        
        let query = '';
        let params = [];
        let filename = '';
        let sheetName = '';
        let columns = [];
        
        switch(type) {
            case 'par-faculte':
    if (filter) {
        query = `
            SELECT 
                -- Numéros
                a.id,
                a.numero_dossier, 
                a.numero_depot,
                
                -- Informations personnelles
                a.nom, 
                a.prenom, 
                TO_CHAR(a.date_naissance, 'DD/MM/YYYY') as date_naissance,
                a.lieu_naissance,
                a.nationalite,
                CASE WHEN a.genre = 'masculin' THEN 'Masculin' ELSE 'Féminin' END as genre,
                a.adresse,
                a.telephone,
                a.email,
                
                -- Informations baccalauréat
                a.type_bac,
                a.lieu_obtention,
                a.annee_obtention,
                a.mention,
                
                -- Choix de formation
                a.premier_choix,
                a.deuxieme_choix,
                a.troisieme_choix,
                
                -- Statut
                CASE 
                    WHEN a.statut = 'approuve' THEN 'Approuvé'
                    WHEN a.statut = 'rejete' THEN 'Rejeté'
                    ELSE 'En attente'
                END as statut,
                
                -- Informations faculté/filière
                fac.nom as faculte, 
                fac.libelle as faculte_libelle,
                f.libelle as filiere_libelle,
                
                -- Dates
                TO_CHAR(a.created_at, 'DD/MM/YYYY HH24:MI') as date_depot,
                TO_CHAR(a.updated_at, 'DD/MM/YYYY HH24:MI') as date_modification
            FROM applications a
            JOIN filieres f ON UPPER(TRIM(f.nom)) = UPPER(TRIM(a.premier_choix))
            JOIN facultes fac ON f.faculte_id = fac.id
            WHERE fac.nom = $1
            ORDER BY a.created_at DESC
        `;
        params = [filter];
        filename = `Export_Faculte_${filter}_${new Date().toISOString().split('T')[0]}.xlsx`;
        sheetName = `Faculté ${filter}`;
    } else {
        query = `
            SELECT 
                -- Numéros
                a.id,
                a.numero_dossier, 
                a.numero_depot,
                
                -- Informations personnelles
                a.nom, 
                a.prenom, 
                TO_CHAR(a.date_naissance, 'DD/MM/YYYY') as date_naissance,
                a.lieu_naissance,
                a.nationalite,
                CASE WHEN a.genre = 'masculin' THEN 'Masculin' ELSE 'Féminin' END as genre,
                a.adresse,
                a.telephone,
                a.email,
                
                -- Informations baccalauréat
                a.type_bac,
                a.lieu_obtention,
                a.annee_obtention,
                a.mention,
                
                -- Choix de formation
                a.premier_choix,
                a.deuxieme_choix,
                a.troisieme_choix,
                
                -- Statut
                CASE 
                    WHEN a.statut = 'approuve' THEN 'Approuvé'
                    WHEN a.statut = 'rejete' THEN 'Rejeté'
                    ELSE 'En attente'
                END as statut,
                
                -- Informations faculté/filière
                fac.nom as faculte, 
                fac.libelle as faculte_libelle,
                f.libelle as filiere_libelle,
                
                -- Dates
                TO_CHAR(a.created_at, 'DD/MM/YYYY HH24:MI') as date_depot,
                TO_CHAR(a.updated_at, 'DD/MM/YYYY HH24:MI') as date_modification
            FROM applications a
            JOIN filieres f ON UPPER(TRIM(f.nom)) = UPPER(TRIM(a.premier_choix))
            JOIN facultes fac ON f.faculte_id = fac.id
            ORDER BY fac.nom, a.created_at DESC
        `;
        filename = `Export_Toutes_Facultes_${new Date().toISOString().split('T')[0]}.xlsx`;
        sheetName = 'Toutes Facultés';
    }
    
    columns = [
        { header: 'ID', key: 'id', width: 8 },
        { header: 'N° DOSSIER', key: 'numero_dossier', width: 15 },
        { header: 'N° DÉPÔT', key: 'numero_depot', width: 15 },
        { header: 'NOM', key: 'nom', width: 20 },
        { header: 'PRÉNOM', key: 'prenom', width: 20 },
        { header: 'DATE NAISSANCE', key: 'date_naissance', width: 15 },
        { header: 'LIEU NAISSANCE', key: 'lieu_naissance', width: 20 },
        { header: 'NATIONALITÉ', key: 'nationalite', width: 15 },
        { header: 'GENRE', key: 'genre', width: 12 },
        { header: 'ADRESSE', key: 'adresse', width: 30 },
        { header: 'TÉLÉPHONE', key: 'telephone', width: 15 },
        { header: 'EMAIL', key: 'email', width: 25 },
        { header: 'TYPE BAC', key: 'type_bac', width: 12 },
        { header: 'LIEU OBTENTION', key: 'lieu_obtention', width: 15 },
        { header: 'ANNÉE OBTENTION', key: 'annee_obtention', width: 15 },
        { header: 'MENTION', key: 'mention', width: 12 },
        { header: 'PREMIER CHOIX', key: 'premier_choix', width: 20 },
        { header: 'DEUXIÈME CHOIX', key: 'deuxieme_choix', width: 20 },
        { header: 'TROISIÈME CHOIX', key: 'troisieme_choix', width: 20 },
        { header: 'FILIÈRE LIBELLÉ', key: 'filiere_libelle', width: 30 },
        { header: 'FACULTÉ', key: 'faculte', width: 15 },
        { header: 'FACULTÉ LIBELLÉ', key: 'faculte_libelle', width: 35 },
        { header: 'STATUT', key: 'statut', width: 15 },
        { header: 'DATE DÉPÔT', key: 'date_depot', width: 18 },
        { header: 'DATE MODIFICATION', key: 'date_modification', width: 18 }
    ];
    break;
                
            case 'par-genre':
                query = `
                    SELECT 
                        CASE WHEN a.genre = 'masculin' THEN 'Masculin' ELSE 'Féminin' END as genre,
                        a.numero_dossier, a.nom, a.prenom, a.email, a.telephone,
                        a.type_bac, a.premier_choix,
                        CASE 
                            WHEN a.statut = 'approuve' THEN 'Approuvé'
                            WHEN a.statut = 'rejete' THEN 'Rejeté'
                            ELSE 'En attente'
                        END as statut,
                        TO_CHAR(a.created_at, 'DD/MM/YYYY') as date_depot
                    FROM applications a
                    ${filter ? 'WHERE a.genre = $1' : ''}
                    ORDER BY a.genre, a.created_at DESC
                `;
                if (filter) params = [filter];
                filename = `Export_Genre_${filter || 'Tous'}_${new Date().toISOString().split('T')[0]}.xlsx`;
                sheetName = `Genre ${filter || 'Tous'}`;
                
                columns = [
                    { header: 'FACULTE', key: 'faculte', width: 15 },
                    { header: 'LIBELLE FACULTE', key: 'faculte_libelle', width: 35 },
                    { header: 'NUMERO DOSSIER', key: 'numero_dossier', width: 15 },
                    { header: 'NOM', key: 'nom', width: 20 },
                    { header: 'PRENOM', key: 'prenom', width: 20 },
                    { header: 'Date_Naiss', key: 'date_naissance', width: 15 },
                    { header: 'Lieu_Naiss', key: 'lieu_naissance', width: 20 },
                    { header: 'Adresse', key: 'adresse', width: 20 },
                    { header: 'Nationalité', key: 'nationalite', width: 15 },
                    { header: 'EMAIL', key: 'email', width: 25 },
                    { header: 'GENRE', key: 'genre', width: 12 },
                    { header: 'TYPE BAC', key: 'type_bac', width: 12 },
                    { header: 'PREMIER CHOIX', key: 'premier_choix', width: 20 },
                    { header: 'DEUXIEME CHOIX', key: 'deuxieme_choix', width: 20 },
                    { header: 'TROISIEME CHOIX', key: 'troisieme_choix', width: 20 },
                    { header: 'STATUT', key: 'statut', width: 15 },
                    { header: 'DATE DEPOT', key: 'date_depot', width: 15 }
                ];
                break;
                
            case 'par-statut':
                const statutFilter = filter || 'en-attente';
                query = `
                    SELECT 
                        a.numero_dossier, a.numero_depot, a.nom, a.prenom, a.email, a.telephone,
                        CASE WHEN a.genre = 'masculin' THEN 'Masculin' ELSE 'Féminin' END as genre,
                        a.type_bac, a.premier_choix,, a.deuxieme_choix,, a.troisieme_choix,
                        CASE 
                            WHEN a.statut = 'approuve' THEN 'Approuvé'
                            WHEN a.statut = 'rejete' THEN 'Rejeté'
                            ELSE 'En attente'
                        END as statut,
                        TO_CHAR(a.created_at, 'DD/MM/YYYY') as date_depot
                    FROM applications a
                    WHERE a.statut = $1
                    ORDER BY a.created_at DESC
                `;
                params = [statutFilter];
                filename = `Export_Statut_${statutFilter}_${new Date().toISOString().split('T')[0]}.xlsx`;
                sheetName = `Statut ${statutFilter}`;
                
                columns = [
                    { header: 'FACULTE', key: 'faculte', width: 15 },
                    { header: 'LIBELLE FACULTE', key: 'faculte_libelle', width: 35 },
                    { header: 'NUMERO DOSSIER', key: 'numero_dossier', width: 15 },
                    { header: 'NOM', key: 'nom', width: 20 },
                    { header: 'PRENOM', key: 'prenom', width: 20 },
                    { header: 'Date_Naiss', key: 'date_naissance', width: 15 },
                    { header: 'Lieu_Naiss', key: 'lieu_naissance', width: 20 },
                    { header: 'Adresse', key: 'adresse', width: 20 },
                    { header: 'Nationalité', key: 'nationalite', width: 15 },
                    { header: 'EMAIL', key: 'email', width: 25 },
                    { header: 'GENRE', key: 'genre', width: 12 },
                    { header: 'TYPE BAC', key: 'type_bac', width: 12 },
                    { header: 'PREMIER CHOIX', key: 'premier_choix', width: 20 },
                    { header: 'DEUXIEME CHOIX', key: 'deuxieme_choix', width: 20 },
                    { header: 'TROISIEME CHOIX', key: 'troisieme_choix', width: 20 },
                    { header: 'STATUT', key: 'statut', width: 15 },
                    { header: 'DATE DEPOT', key: 'date_depot', width: 15 }
                ];
                break;
                
            default:
                return res.status(400).json({ error: 'Type d\'export invalide' });
        }
        
        console.log('Exécution requête:', query);
        console.log('Paramètres:', params);
        
        const result = await pool.query(query, params);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Aucune donnée trouvée pour ces critères',
                type,
                filter 
            });
        }
        
        console.log(`Données récupérées: ${result.rows.length} lignes`);
        
        // Créer workbook Excel avec ExcelJS
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheetName);
        
        // Définir les colonnes
        worksheet.columns = columns;
        
        // Style en-tête
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '667eea' }
        };
        worksheet.getRow(1).alignment = { 
            vertical: 'middle', 
            horizontal: 'center' 
        };
        worksheet.getRow(1).height = 25;
        
        // Ajouter données avec alternance de couleurs
        result.rows.forEach((row, index) => {
            const excelRow = worksheet.addRow(row);
            
            // Alternance de couleurs
            if (index % 2 === 0) {
                excelRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F8F9FA' }
                };
            }
        });
        
        // Bordures pour toutes les cellules
        worksheet.eachRow((row) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });
        
        // Figer la première ligne
        worksheet.views = [
            { state: 'frozen', ySplit: 1 }
        ];
        
        // Envoyer le fichier
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
        
        console.log(`✅ Export ${type} - ${result.rows.length} lignes envoyées`);
        
    } catch (error) {
        console.error('❌ Erreur export section:', error);
        res.status(500).json({ 
            error: 'Erreur lors de l\'export',
            details: error.message 
        });
    }
});

// 2. ROUTE DASHBOARD CORRIGÉE
app.get('/api/admin/stats/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    console.log('=== DÉBUT ROUTE DASHBOARD ===');
    
    try {
        // Forcer JSON dès le début
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        console.log('User:', req.user?.email, 'Role:', req.user?.role);
        
        // Vérification utilisateur
        if (!req.user || req.user.role !== 'admin') {
            console.log('ERREUR: Accès non autorisé');
            return res.status(403).json({
                success: false,
                error: 'Accès administrateur requis'
            });
        }
        
        // Test connexion base de données
        try {
            await pool.query('SELECT 1');
            console.log('Connexion DB OK');
        } catch (dbError) {
            console.error('ERREUR DB:', dbError);
            return res.status(500).json({
                success: false,
                error: 'Erreur de connexion à la base de données',
                details: dbError.message
            });
        }
        
        // Compter les applications
        const countResult = await pool.query('SELECT COUNT(*) as total FROM applications');
        const totalApps = parseInt(countResult.rows[0].total);
        console.log('Total applications:', totalApps);
        
        // Si pas de données, retourner structure vide
        if (totalApps === 0) {
            console.log('Aucune donnée - retour structure vide');
            const emptyResponse = {
                success: true,
                message: 'Aucune candidature trouvée',
                general: {
                    total_candidatures: 0,
                    approuves: 0,
                    rejetes: 0,
                    en_attente: 0,
                    hommes: 0,
                    femmes: 0
                },
                topFilieres: [],
                repartitionBac: [],
                evolution: []
            };
            
            console.log('Envoi réponse vide:', JSON.stringify(emptyResponse).substring(0, 100));
            return res.json(emptyResponse);
        }
        
        // Requêtes avec gestion d'erreur individuelle
        let generalData = {
            total_candidatures: 0,
            approuves: 0,
            rejetes: 0,
            en_attente: 0,
            hommes: 0,
            femmes: 0
        };
        
        let topFilieres = [];
        let repartitionBac = [];
        let evolution = [];
        
        // 1. Statistiques générales
        try {
            const generalResult = await pool.query(`
                SELECT 
                    COUNT(*) as total_candidatures,
                    COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves,
                    COUNT(CASE WHEN statut = 'rejete' THEN 1 END) as rejetes,
                    COUNT(CASE WHEN statut = 'en-attente' THEN 1 END) as en_attente,
                    COUNT(CASE WHEN genre = 'masculin' THEN 1 END) as hommes,
                    COUNT(CASE WHEN genre = 'feminin' THEN 1 END) as femmes
                FROM applications
            `);
            
            if (generalResult.rows.length > 0) {
                const row = generalResult.rows[0];
                generalData = {
                    total_candidatures: parseInt(row.total_candidatures) || 0,
                    approuves: parseInt(row.approuves) || 0,
                    rejetes: parseInt(row.rejetes) || 0,
                    en_attente: parseInt(row.en_attente) || 0,
                    hommes: parseInt(row.hommes) || 0,
                    femmes: parseInt(row.femmes) || 0
                };
            }
            console.log('Stats générales OK:', generalData);
        } catch (error) {
            console.error('ERREUR stats générales:', error);
        }
        
        // 2. Top filières
        try {
            const filieresResult = await pool.query(`
                SELECT premier_choix as filiere, COUNT(*) as nombre
                FROM applications 
                WHERE premier_choix IS NOT NULL 
                    AND TRIM(premier_choix) != '' 
                GROUP BY premier_choix 
                ORDER BY nombre DESC 
                LIMIT 5
            `);
            
            topFilieres = filieresResult.rows.map(f => ({
                filiere: f.filiere,
                nombre: parseInt(f.nombre)
            }));
            console.log('Top filières OK:', topFilieres.length, 'éléments');
        } catch (error) {
            console.error('ERREUR top filières:', error);
        }
        
        // 3. Répartition bac
        try {
            const bacResult = await pool.query(`
                SELECT type_bac, COUNT(*) as nombre
                FROM applications 
                WHERE type_bac IS NOT NULL 
                    AND TRIM(type_bac) != ''
                GROUP BY type_bac 
                ORDER BY nombre DESC
                LIMIT 10
            `);
            
            repartitionBac = bacResult.rows.map(b => ({
                type_bac: b.type_bac,
                nombre: parseInt(b.nombre)
            }));
            console.log('Répartition bac OK:', repartitionBac.length, 'éléments');
        } catch (error) {
            console.error('ERREUR répartition bac:', error);
        }
        
        // 4. Évolution temporelle
        try {
            const evolutionResult = await pool.query(`
                SELECT 
                    TO_CHAR(created_at, 'Mon YYYY') as mois,
                    COUNT(*) as candidatures,
                    DATE_TRUNC('month', created_at) as mois_date
                FROM applications 
                WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
                GROUP BY TO_CHAR(created_at, 'Mon YYYY'), DATE_TRUNC('month', created_at)
                ORDER BY mois_date
            `);
            
            evolution = evolutionResult.rows.map(e => ({
                mois: e.mois,
                candidatures: parseInt(e.candidatures)
            }));
            console.log('Évolution OK:', evolution.length, 'éléments');
        } catch (error) {
            console.error('ERREUR évolution:', error);
        }
        
        // Construire la réponse finale
        const finalResponse = {
            success: true,
            timestamp: new Date().toISOString(),
            general: generalData,
            topFilieres: topFilieres,
            repartitionBac: repartitionBac,
            evolution: evolution
        };
        
        console.log('Réponse finale construite:', {
            success: finalResponse.success,
            total: finalResponse.general.total_candidatures,
            filieres: finalResponse.topFilieres.length,
            bacs: finalResponse.repartitionBac.length,
            evolution: finalResponse.evolution.length
        });
        
        // Vérifier que c'est du JSON valide
        try {
            JSON.stringify(finalResponse);
            console.log('JSON valide confirmé');
        } catch (jsonError) {
            console.error('ERREUR: JSON invalide:', jsonError);
            return res.status(500).json({
                success: false,
                error: 'Erreur de sérialisation JSON'
            });
        }
        
        // Envoyer la réponse
        res.json(finalResponse);
        console.log('=== RÉPONSE ENVOYÉE AVEC SUCCÈS ===');
        
    } catch (globalError) {
        console.error('=== ERREUR GLOBALE DASHBOARD ===');
        console.error('Message:', globalError.message);
        console.error('Stack:', globalError.stack);
        
        // S'assurer qu'on envoie du JSON même en cas d'erreur
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        const errorResponse = {
            success: false,
            error: 'Erreur serveur lors de la récupération des statistiques',
            details: globalError.message,
            timestamp: new Date().toISOString()
        };
        
        try {
            res.status(500).json(errorResponse);
        } catch (sendError) {
            console.error('ERREUR lors de l\'envoi de la réponse d\'erreur:', sendError);
            res.status(500).end('{"success":false,"error":"Erreur critique serveur"}');
        }
    }
});

app.get('/api/admin/stats/test', authenticateToken, requireAdmin, (req, res) => {
    console.log('Route de test appelée');
    res.json({
        success: true,
        message: 'Test réussi',
        timestamp: new Date().toISOString(),
        user: req.user?.email,
        role: req.user?.role
    });
});

app.get('/api/admin/test-routes', authenticateToken, requireAdmin, async (req, res) => {
    try {
        console.log('🧪 Test des routes statistiques...');
        
        const routes = [
            '/admin/stats/dashboard',
            '/admin/stats/genre', 
            '/admin/stats/filieres',
            '/admin/stats/type-bac'
        ];
        
        const results = {};
        
        for (const route of routes) {
            try {
                // Simuler un appel interne pour tester
                const testResult = await pool.query('SELECT COUNT(*) FROM applications');
                results[route] = {
                    status: 'OK',
                    available: true,
                    data_count: testResult.rows[0].count
                };
            } catch (error) {
                results[route] = {
                    status: 'ERROR',
                    available: false,
                    error: error.message
                };
            }
        }
        
        res.json({
            success: true,
            test_time: new Date().toISOString(),
            routes: results,
            database_connection: 'OK'
        });
        
    } catch (error) {
        console.error('❌ Erreur test routes:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du test des routes',
            details: error.message
        });
    }
});

// Export des statistiques en CSV
app.get('/api/admin/export/statistiques/:type', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type } = req.params;
    let query = '';
    let filename = '';
    
    switch(type) {
      case 'genre':
        query = `
          SELECT genre, COUNT(*) as total,
                 COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves,
                 COUNT(CASE WHEN statut = 'rejete' THEN 1 END) as rejetes
          FROM applications GROUP BY genre
        `;
        filename = 'statistiques_genre.csv';
        break;
        
      case 'filieres':
        query = `
          SELECT premier_choix as filiere, COUNT(*) as total,
                 COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves
          FROM applications GROUP BY premier_choix ORDER BY total DESC
        `;
        filename = 'statistiques_filieres.csv';
        break;
        
      case 'type_bac':
        query = `
          SELECT type_bac, COUNT(*) as total,
                 COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves
          FROM applications GROUP BY type_bac ORDER BY total DESC
        `;
        filename = 'statistiques_type_bac.csv';
        break;
        
      default:
        return res.status(400).json({ error: 'Type de statistique invalide' });
    }
    
    const result = await pool.query(query);
    
    // Créer le CSV
    const headers = Object.keys(result.rows[0] || {}).join(',');
    const rows = result.rows.map(row => Object.values(row).join(','));
    const csv = [headers, ...rows].join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM pour UTF-8
    
  } catch (error) {
    console.error('Erreur export statistiques:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques croisées : Genre × Type de Bac
app.get('/api/admin/stats/genre-bac', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        genre,
        type_bac,
        COUNT(*) as nombre,
        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves
      FROM applications 
      GROUP BY genre, type_bac 
      ORDER BY genre, nombre DESC
    `);
    
    res.json({ 
      stats: result.rows
    });
  } catch (error) {
    console.error('Erreur statistiques genre × bac:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques des mentions par filière
app.get('/api/admin/stats/mentions-filieres', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        premier_choix as filiere,
        mention,
        COUNT(*) as nombre,
        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves
      FROM applications 
      GROUP BY premier_choix, mention 
      HAVING COUNT(*) > 0
      ORDER BY filiere, nombre DESC
    `);
    
    res.json({ 
      stats: result.rows
    });
  } catch (error) {
    console.error('Erreur statistiques mentions × filières:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
// Télécharger le modèle Excel avec filière et niveau
// Dans server.js - Route pour télécharger le modèle Excel
app.get('/api/admin/etudiants/modele-excel', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Étudiants');
    
    // Définir les colonnes
    worksheet.columns = [
      { header: 'Numéro Dossier*', key: 'numero_dossier', width: 20 },
      { header: 'Matricule', key: 'matricule', width: 20 },
      { header: 'Nom*', key: 'nom', width: 20 },
      { header: 'Prénom*', key: 'prenom', width: 20 },
      { header: 'Date Naissance* (YYYY-MM-DD)', key: 'date_naissance', width: 25 },
      { header: 'Lieu Naissance*', key: 'lieu_naissance', width: 20 },
      { header: 'Nationalité*', key: 'nationalite', width: 15 },
      { header: 'Genre* (masculin/feminin)', key: 'genre', width: 25 },
      { header: 'Adresse*', key: 'adresse', width: 30 },
      { header: 'Téléphone*', key: 'telephone', width: 15 },
      { header: 'Email*', key: 'email', width: 25 },
      { header: 'Type Bac', key: 'type_bac', width: 12 },
      { header: 'Lieu Obtention', key: 'lieu_obtention', width: 20 },
      { header: 'Année Obtention', key: 'annee_obtention', width: 15 },
      { header: 'Mention', key: 'mention', width: 12 },
      { header: 'Filière* (nom exact)', key: 'filiere', width: 25 },
      { header: 'Niveau* (L1,L2,L3,M1,M2)', key: 'niveau', width: 25 }
    ];
    
    // Style de l'en-tête
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '667eea' }
    };
    worksheet.getRow(1).alignment = { 
      vertical: 'middle', 
      horizontal: 'center',
      wrapText: true 
    };
    worksheet.getRow(1).height = 30;
    
    // Ajouter des exemples
    worksheet.addRow({
      numero_dossier: 'UDH123456',
      matricule: '',
      nom: 'MOUSSA',
      prenom: 'Aissatou',
      date_naissance: '2000-01-15',
      lieu_naissance: 'Tahoua',
      nationalite: 'nigerienne',
      genre: 'feminin',
      adresse: 'Quartier Koira Kano, Tahoua',
      telephone: '+227 90 00 00 00',
      email: 'aissatou.moussa@example.com',
      type_bac: 'BAC C',
      lieu_obtention: 'Tahoua',
      annee_obtention: '2023-2024',
      mention: 'Bien',
      filiere: 'INFORMATIQUE',
      niveau: 'L1'
    });
    
    worksheet.addRow({
      numero_dossier: 'UDH789012',
      matricule: '2023UDH001',
      nom: 'IBRAHIM',
      prenom: 'Mariama',
      date_naissance: '1999-05-20',
      lieu_naissance: 'Niamey',
      nationalite: 'nigerienne',
      genre: 'feminin',
      adresse: 'Quartier Yantala, Niamey',
      telephone: '+227 91 11 11 11',
      email: 'mariama.ibrahim@example.com',
      type_bac: 'BAC D',
      lieu_obtention: 'Niamey',
      annee_obtention: '2022-2023',
      mention: 'Assez Bien',
      filiere: 'MATHEMATIQUES',
      niveau: 'L2'
    });
    
    // Alterner les couleurs des lignes
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F8F9FA' }
          };
        });
      }
    });
    
    // Bordures pour toutes les cellules
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'CCCCCC' } },
          left: { style: 'thin', color: { argb: 'CCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'CCCCCC' } },
          right: { style: 'thin', color: { argb: 'CCCCCC' } }
        };
      });
    });
    
    // ===== FEUILLE 2: LISTE DES FILIÈRES =====
    const filiereSheet = workbook.addWorksheet('Liste Filières');
    
    // Récupérer toutes les filières actives
    const filieres = await pool.query(`
      SELECT f.nom, f.libelle, fac.nom as faculte, fac.libelle as faculte_libelle,
             STRING_AGG(DISTINCT tb.nom, ', ' ORDER BY tb.nom) as types_bac
      FROM filieres f
      JOIN facultes fac ON f.faculte_id = fac.id
      LEFT JOIN filiere_type_bacs ftb ON f.id = ftb.filiere_id
      LEFT JOIN type_bacs tb ON ftb.type_bac_id = tb.id
      WHERE f.active = true AND fac.active = true
      GROUP BY f.nom, f.libelle, fac.nom, fac.libelle
      ORDER BY fac.nom, f.nom
    `);
    
    filiereSheet.columns = [
      { header: 'Nom Filière (à utiliser)', key: 'nom', width: 25 },
      { header: 'Libellé', key: 'libelle', width: 40 },
      { header: 'Faculté', key: 'faculte', width: 15 },
      { header: 'Faculté Libellé', key: 'faculte_libelle', width: 35 },
      { header: 'Types Bac Autorisés', key: 'types_bac', width: 25 }
    ];
    
    // Style en-tête feuille filières
    filiereSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    filiereSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '28a745' }
    };
    filiereSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    filiereSheet.getRow(1).height = 25;
    
    // Ajouter les filières
    filieres.rows.forEach((filiere, index) => {
      const row = filiereSheet.addRow(filiere);
      
      // Alterner les couleurs
      if (index % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F0FFF0' }
          };
        });
      }
      
      // Bordures
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
    
    // ===== FEUILLE 3: INSTRUCTIONS =====
    const instructionSheet = workbook.addWorksheet('Instructions');
    instructionSheet.getColumn(1).width = 120;
    
    const instructions = [
      { text: 'INSTRUCTIONS D\'IMPORTATION', style: { bold: true, size: 16, color: { argb: '667eea' } } },
      { text: '' },
      { text: 'CHAMPS OBLIGATOIRES (marqués par *)', style: { bold: true, size: 14 } },
      { text: '• Numéro de dossier : Doit commencer par UDH (ex: UDH123456)' },
      { text: '• Nom, Prénom, Date de naissance, Lieu de naissance' },
      { text: '• Nationalité, Genre, Adresse, Téléphone, Email' },
      { text: '• Filière : Doit correspondre EXACTEMENT au NOM dans la feuille "Liste Filières"' },
      { text: '• Niveau : L1, L2, L3, M1 ou M2' },
      { text: '' },
      { text: 'INFORMATIONS IMPORTANTES', style: { bold: true, size: 14 } },
      { text: '1. Date de naissance au format YYYY-MM-DD (ex: 2000-01-15)' },
      { text: '2. Genre : exactement "masculin" ou "feminin" (sans accent)' },
      { text: '3. Matricule : Optionnel pour nouveaux étudiants (sera généré automatiquement si vide)' },
      { text: '4. Type Bac, Lieu obtention, Année, Mention : Optionnels' },
      { text: '' },
      { text: 'FILIÈRE ET NIVEAU', style: { bold: true, size: 14, color: { argb: 'dc3545' } } },
      { text: '⚠️  IMPORTANT : Filière et niveau sont OBLIGATOIRES et DÉFINITIFS' },
      { text: '• La filière et le niveau définis ici seront ceux de l\'étudiant' },
      { text: '• Lors des inscriptions, ces informations ne pourront pas être modifiées' },
      { text: '• Vérifiez bien la filière dans la feuille "Liste Filières"' },
      { text: '• Le nom de la filière doit être en MAJUSCULES (ex: INFORMATIQUE)' },
      { text: '' },
      { text: 'EXEMPLES DE FILIÈRES VALIDES', style: { bold: true, size: 14 } },
      { text: '• INFORMATIQUE, MATHEMATIQUES, PHYSIQUE, CHIMIE, BIOLOGIE' },
      { text: '• FRANCAIS, ANGLAIS, HISTOIRE, GEOGRAPHIE' },
      { text: '• MEDECINE, PHARMACIE' },
      { text: '• GESTION, ECONOMIE, COMPTABILITE' },
      { text: '' },
      { text: 'NIVEAUX VALIDES', style: { bold: true, size: 14 } },
      { text: '• L1 : Licence 1ère année' },
      { text: '• L2 : Licence 2ème année' },
      { text: '• L3 : Licence 3ème année' },
      { text: '• M1 : Master 1ère année' },
      { text: '• M2 : Master 2ème année' },
      { text: '' },
      { text: 'EN CAS D\'ERREUR', style: { bold: true, size: 14 } },
      { text: '• Vérifiez que le nom de la filière est exactement comme dans "Liste Filières"' },
      { text: '• Vérifiez que le niveau est bien L1, L2, L3, M1 ou M2' },
      { text: '• Vérifiez que tous les champs obligatoires sont remplis' },
      { text: '• En cas de problème, contactez l\'administrateur système' }
    ];
    
    instructions.forEach((instruction, index) => {
      const row = instructionSheet.addRow([instruction.text]);
      if (instruction.style) {
        row.getCell(1).font = instruction.style;
      }
      
      // Coloration des titres
      if (instruction.style?.bold && instruction.style?.size > 13) {
        row.getCell(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'F0F0F0' }
        };
      }
      
      row.height = 20;
    });
    
    // ===== FEUILLE 4: VALIDATION DES DONNÉES =====
    const validationSheet = workbook.addWorksheet('Validation');
    validationSheet.getColumn(1).width = 100;
    
    validationSheet.addRow(['RÈGLES DE VALIDATION']).font = { bold: true, size: 14 };
    validationSheet.addRow([]);
    validationSheet.addRow(['Votre fichier sera rejeté si :']);
    validationSheet.addRow(['✗ Le numéro de dossier existe déjà dans la base']);
    validationSheet.addRow(['✗ Le nom de la filière n\'existe pas ou est mal écrit']);
    validationSheet.addRow(['✗ Le niveau n\'est pas L1, L2, L3, M1 ou M2']);
    validationSheet.addRow(['✗ Le genre n\'est pas "masculin" ou "feminin"']);
    validationSheet.addRow(['✗ La date de naissance n\'est pas au format YYYY-MM-DD']);
    validationSheet.addRow(['✗ L\'email n\'est pas valide']);
    validationSheet.addRow(['✗ Des champs obligatoires sont vides']);
    validationSheet.addRow([]);
    validationSheet.addRow(['CONSEILS']);
    validationSheet.addRow(['✓ Copiez exactement les noms de filières depuis la feuille "Liste Filières"']);
    validationSheet.addRow(['✓ Utilisez les exemples de la feuille "Étudiants" comme référence']);
    validationSheet.addRow(['✓ Testez d\'abord avec 2-3 lignes avant d\'importer tout le fichier']);
    validationSheet.addRow(['✓ Gardez une copie de sauvegarde de vos données']);
    
    // Protection de la feuille Instructions (lecture seule)
    instructionSheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true
    });
    
    validationSheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true
    });
    
    // Définir les headers HTTP
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Modele_Import_Etudiants.xlsx"');
    
    // Écrire et envoyer le fichier
    await workbook.xlsx.write(res);
    res.end();
    
    console.log('✅ Modèle Excel généré avec succès');
    
  } catch (error) {
    console.error('❌ Erreur génération modèle:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération du modèle',
      details: error.message 
    });
  }
});
// Import avec filière et niveau optionnels
// Route d'import corrigée avec meilleure gestion d'erreurs
// Import AVEC filière et niveau optionnels
app.post('/api/admin/etudiants/import', authenticateToken, requireAdmin, upload.single('fichier'), async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    
    if (!req.file) {
      return res.status(400).json({ error: 'Fichier Excel requis' });
    }
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const worksheet = workbook.getWorksheet('Étudiants');
    
    if (!worksheet) {
      return res.status(400).json({ error: 'Feuille "Étudiants" non trouvée' });
    }
    
    const etudiants = [];
    const erreurs = [];
    
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      
      try {
        const etudiant = {
          numero_dossier: row.getCell(1).value?.toString().trim(),
          matricule: row.getCell(2).value?.toString().trim() || null,
          nom: row.getCell(3).value?.toString().trim(),
          prenom: row.getCell(4).value?.toString().trim(),
          date_naissance: row.getCell(5).value,
          lieu_naissance: row.getCell(6).value?.toString().trim(),
          nationalite: row.getCell(7).value?.toString().trim(),
          genre: row.getCell(8).value?.toString().trim().toLowerCase(),
          adresse: row.getCell(9).value?.toString().trim(),
          telephone: row.getCell(10).value?.toString().trim(),
          email: row.getCell(11).value?.toString().trim(),
          type_bac: row.getCell(12).value?.toString().trim() || null,
          lieu_obtention: row.getCell(13).value?.toString().trim() || null,
          annee_obtention: row.getCell(14).value?.toString().trim() || null,
          mention: row.getCell(15).value?.toString().trim() || null,
          filiere: row.getCell(16).value?.toString().trim() || null,
          niveau: row.getCell(17).value?.toString().trim() || null
        };
        
        // Validation
        const champsObligatoires = [
          'numero_dossier', 'nom', 'prenom', 'date_naissance', 
          'lieu_naissance', 'nationalite', 'genre', 'adresse', 
          'telephone', 'email'
        ];
        
        const champsManquants = champsObligatoires.filter(champ => !etudiant[champ]);
        
        if (champsManquants.length > 0) {
          throw new Error(`Champs obligatoires manquants: ${champsManquants.join(', ')}`);
        }
        
        if (!['masculin', 'feminin'].includes(etudiant.genre)) {
          throw new Error('Genre invalide');
        }
        
        if (etudiant.filiere && etudiant.niveau) {
          if (!['L1', 'L2', 'L3', 'M1', 'M2'].includes(etudiant.niveau)) {
            throw new Error('Niveau invalide');
          }
        } else if ((etudiant.filiere && !etudiant.niveau) || (!etudiant.filiere && etudiant.niveau)) {
          throw new Error('Filière et niveau doivent être fournis ensemble');
        }
        
        etudiants.push(etudiant);
      } catch (error) {
        erreurs.push({ ligne: rowNumber, erreur: error.message });
      }
    });
    
    // Insérer les étudiants
    const client = await pool.connect();
    let imported = 0;
    let updated = 0;
    
    try {
      await client.query('BEGIN');
      
      for (const etudiant of etudiants) {
        try {
          let filiereId = null;
          
          if (etudiant.filiere) {
            const filiereResult = await client.query(
              'SELECT id FROM filieres WHERE UPPER(nom) = UPPER($1) AND active = true',
              [etudiant.filiere]
            );
            
            if (filiereResult.rows.length === 0) {
              throw new Error(`Filière "${etudiant.filiere}" non trouvée`);
            }
            
            filiereId = filiereResult.rows[0].id;
          }
          
          const existing = await client.query(
            'SELECT id FROM etudiant WHERE numero_dossier = $1',
            [etudiant.numero_dossier]
          );
          
          if (existing.rows.length > 0) {
            await client.query(`
              UPDATE etudiant SET
                nom = $1, prenom = $2, date_naissance = $3, lieu_naissance = $4,
                nationalite = $5, genre = $6, adresse = $7, telephone = $8,
                email = $9, type_bac = $10, lieu_obtention = $11,
                annee_obtention = $12, mention = $13, 
                filiere_id = $14, niveau = $15, updated_at = NOW()
              WHERE numero_dossier = $16
            `, [
              etudiant.nom, etudiant.prenom, etudiant.date_naissance, etudiant.lieu_naissance,
              etudiant.nationalite, etudiant.genre, etudiant.adresse, etudiant.telephone,
              etudiant.email, etudiant.type_bac, etudiant.lieu_obtention,
              etudiant.annee_obtention, etudiant.mention,
              filiereId, etudiant.niveau,
              etudiant.numero_dossier
            ]);
            updated++;
          } else {
            await client.query(`
              INSERT INTO etudiant (
                numero_dossier, matricule, nom, prenom, date_naissance, lieu_naissance,
                nationalite, genre, adresse, telephone, email, type_bac, lieu_obtention,
                annee_obtention, mention, filiere_id, niveau
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            `, [
              etudiant.numero_dossier, etudiant.matricule, etudiant.nom, etudiant.prenom,
              etudiant.date_naissance, etudiant.lieu_naissance, etudiant.nationalite,
              etudiant.genre, etudiant.adresse, etudiant.telephone, etudiant.email,
              etudiant.type_bac, etudiant.lieu_obtention, etudiant.annee_obtention, 
              etudiant.mention, filiereId, etudiant.niveau
            ]);
            imported++;
          }
          
        } catch (error) {
          erreurs.push({ 
            etudiant: `${etudiant.nom} ${etudiant.prenom}`, 
            erreur: error.message 
          });
        }
      }
      
      await client.query('COMMIT');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      imported,
      updated,
      total: etudiants.length,
      erreurs,
      message: `${imported} nouveaux, ${updated} mis à jour`
    });
    
  } catch (error) {
    console.error('Erreur import:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Erreur lors de l\'import' });
  }
});
// =================== ROUTES INSCRIPTION ===================

// Importer des étudiants depuis Excel

// Rechercher un étudiant (nouveau avec numéro de dossier)
// CORRIGER ces deux routes dans server.js :

// Rechercher nouveau étudiant - AVEC JOIN
app.get('/api/inscription/rechercher-nouveau/:numeroDossier', async (req, res) => {
  try {
    const { numeroDossier } = req.params;
    
    const result = await pool.query(`
      SELECT e.*, 
             f.nom as filiere, 
             f.libelle as filiere_libelle,
             fac.nom as faculte,
             fac.libelle as faculte_libelle
      FROM etudiant e
      LEFT JOIN filieres f ON e.filiere_id = f.id
      LEFT JOIN facultes fac ON f.faculte_id = fac.id
      WHERE e.numero_dossier = $1 
        AND e.peut_inscrire = true 
        AND e.statut = 'actif'
    `, [numeroDossier]);
    
    if (result.rows.length === 0) {
      return res.json({ success: false, message: 'Étudiant non trouvé ou non autorisé' });
    }
    
    res.json({ success: true, etudiant: result.rows[0] });
  } catch (error) {
    console.error('Erreur recherche étudiant:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rechercher ancien étudiant - AVEC JOIN
app.get('/api/inscription/rechercher-ancien/:matricule', async (req, res) => {
  try {
    const { matricule } = req.params;
    
    const result = await pool.query(`
      SELECT e.*, 
             f.nom as filiere, 
             f.libelle as filiere_libelle,
             fac.nom as faculte,
             fac.libelle as faculte_libelle
      FROM etudiant e
      LEFT JOIN filieres f ON e.filiere_id = f.id
      LEFT JOIN facultes fac ON f.faculte_id = fac.id
      WHERE e.matricule = $1 
        AND e.peut_inscrire = true 
        AND e.statut = 'actif'
    `, [matricule]);
    
    if (result.rows.length === 0) {
      return res.json({ success: false, message: 'Étudiant non trouvé ou non autorisé' });
    }
    
    res.json({ success: true, etudiant: result.rows[0] });
  } catch (error) {
    console.error('Erreur recherche étudiant:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Vérifier autorisation d'inscription
app.get('/api/inscription/verifier-autorisation/:etudiantId', async (req, res) => {
  try {
    const { etudiantId } = req.params;
    
    // Vérifier configuration globale
    const config = await pool.query(`
      SELECT * FROM config_inscription 
      WHERE actif = true 
      ORDER BY created_at DESC LIMIT 1
    `);
    
    if (config.rows.length === 0 || !config.rows[0].actif) {
      return res.json({ 
        autorise: false, 
        raison: 'Les inscriptions sont fermées' 
      });
    }
    
    // Vérifier restrictions spécifiques étudiant
    const restriction = await pool.query(`
      SELECT * FROM restriction_inscription 
      WHERE etudiant_id = $1 AND actif = true AND type = 'etudiant'
    `, [etudiantId]);
    
    if (restriction.rows.length > 0) {
      return res.json({ 
        autorise: false, 
        raison: restriction.rows[0].raison || 'Votre inscription est bloquée' 
      });
    }
    
    res.json({ autorise: true });
  } catch (error) {
    console.error('Erreur vérification autorisation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Valider une inscription
app.post('/api/inscription/valider', async (req, res) => {
  try {
    const { etudiant_id, filiere_id, niveau, mode_paiement, telephone_paiement, montant } = req.body;
    
    // Vérifier restrictions
    const restrictions = await pool.query(`
      SELECT * FROM restriction_inscription 
      WHERE actif = true 
      AND (
        (type = 'etudiant' AND etudiant_id = $1) OR
        (type = 'filiere' AND filiere_id = $2) OR
        (type = 'niveau' AND niveau = $3) OR
        (type = 'filiere_niveau' AND filiere_id = $2 AND niveau = $3)
      )
    `, [etudiant_id, filiere_id, niveau]);
    
    if (restrictions.rows.length > 0) {
      return res.status(403).json({ 
        error: 'Inscription non autorisée',
        raison: restrictions.rows[0].raison 
      });
    }
    
    // Créer l'inscription
    const result = await pool.query(`
      INSERT INTO inscription (
        etudiant_id, annee_universitaire,
        mode_paiement, telephone_paiement, montant
      ) VALUES ($1,'2017-2019', $2, $3, $4)
      RETURNING *
    `, [etudiant_id,mode_paiement, telephone_paiement, montant]);
    
    res.json({ success: true, inscription: result.rows[0] });
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

// Export des inscriptions
app.get('/api/admin/inscriptions/export', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        e.matricule, e.numero_dossier, e.nom, e.prenom, e.email, e.telephone,
        f.nom as filiere, fac.nom as faculte,
        e.niveau, i.annee_universitaire, i.mode_paiement, i.montant,
        i.statut_inscription, i.statut_paiement,
        TO_CHAR(i.date_inscription, 'DD/MM/YYYY HH24:MI') as date_inscription
      FROM inscription i
      JOIN etudiant e ON i.etudiant_id = e.id
      JOIN filieres f ON e.filiere_id = f.id
      JOIN facultes fac ON f.faculte_id = fac.id
      ORDER BY i.date_inscription DESC
    `);
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inscriptions');
    
    worksheet.columns = [
      { header: 'Matricule', key: 'matricule', width: 20 },
      { header: 'N° Dossier', key: 'numero_dossier', width: 15 },
      { header: 'Nom', key: 'nom', width: 20 },
      { header: 'Prénom', key: 'prenom', width: 20 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Téléphone', key: 'telephone', width: 15 },
      { header: 'Faculté', key: 'faculte', width: 20 },
      { header: 'Filière', key: 'filiere', width: 25 },
      { header: 'Niveau', key: 'niveau', width: 10 },
      { header: 'Année Universitaire', key: 'annee_universitaire', width: 20 },
      { header: 'Mode Paiement', key: 'mode_paiement', width: 15 },
      { header: 'Montant', key: 'montant', width: 12 },
      { header: 'Statut Inscription', key: 'statut_inscription', width: 18 },
      { header: 'Statut Paiement', key: 'statut_paiement', width: 18 },
      { header: 'Date Inscription', key: 'date_inscription', width: 20 }
    ];
    
    result.rows.forEach(row => worksheet.addRow(row));
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Inscriptions.xlsx"');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Erreur export inscriptions:', error);
    res.status(500).json({ error: 'Erreur lors de l\'export' });
  }
});
// =================== GESTION DES AUTORISATIONS D'INSCRIPTION ===================

// Obtenir la configuration globale
// Vérifier cette route dans server.js


// Mettre à jour la configuration globale
app.put('/api/admin/inscription/config', async (req, res) => {
  try {
    const { actif, annee_universitaire, date_ouverture, date_fermeture, message_fermeture } = req.body;
    
    const result = await pool.query(`
      INSERT INTO config_inscription (actif, annee_universitaire, date_ouverture, date_fermeture, message_fermeture)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        actif = EXCLUDED.actif,
        annee_universitaire = EXCLUDED.annee_universitaire,
        date_ouverture = EXCLUDED.date_ouverture,
        date_fermeture = EXCLUDED.date_fermeture,
        message_fermeture = EXCLUDED.message_fermeture,
        updated_at = NOW()
      RETURNING *
    `, [actif, annee_universitaire, date_ouverture, date_fermeture, message_fermeture]);
    
    res.json({ success: true, config: result.rows[0] });
  } catch (error) {
    console.error('Erreur mise à jour config:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir toutes les restrictions
app.get('/api/admin/inscription/restrictions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*,
             e.nom as etudiant_nom, e.prenom as etudiant_prenom, e.numero_dossier,
             f.nom as filiere_nom, f.libelle as filiere_libelle
      FROM restriction_inscription r
      LEFT JOIN etudiant e ON r.etudiant_id = e.id
      LEFT JOIN filieres f ON r.filiere_id = f.id
      ORDER BY r.created_at DESC
    `);
    
    res.json({ restrictions: result.rows });
  } catch (error) {
    console.error('Erreur récupération restrictions:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer une restriction
app.post('/api/admin/inscription/restrictions', async (req, res) => {
  try {
    const { type, filiere_id, niveau, etudiant_id, raison } = req.body;
    
    const result = await pool.query(`
      INSERT INTO restriction_inscription (type, filiere_id, niveau, etudiant_id, raison, actif)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `, [type, filiere_id, niveau, etudiant_id, raison]);
    
    res.json({ success: true, restriction: result.rows[0] });
  } catch (error) {
    console.error('Erreur création restriction:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une restriction
app.delete('/api/admin/inscription/restrictions/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM restriction_inscription WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression restriction:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Activer/Désactiver une restriction
app.put('/api/admin/inscription/restrictions/:id/toggle', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE restriction_inscription 
      SET actif = NOT actif, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [req.params.id]);
    
    res.json({ success: true, restriction: result.rows[0] });
  } catch (error) {
    console.error('Erreur toggle restriction:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =================== GESTION DES ÉTUDIANTS ===================

// Liste de tous les étudiants
// Route GET pour récupérer TOUS les étudiants (avec ou sans inscription)
// Route GET pour récupérer TOUS les étudiants (avec ou sans inscription)
app.get('/api/admin/etudiants', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { search, statut } = req.query;
    
    console.log('📚 Récupération étudiants - Filtres:', { search, statut });
    
    let query = `
      SELECT DISTINCT ON (e.id)
        e.id,
        e.matricule,
        e.numero_dossier,
        e.nom,
        e.prenom,
        e.date_naissance,
        e.lieu_naissance,
        e.nationalite,
        e.genre,
        e.adresse,
        e.telephone,
        e.email,
        e.type_bac,
        e.lieu_obtention,
        e.annee_obtention,
        e.mention,
        e.filiere_id,
        e.niveau,
        e.statut,
        e.peut_inscrire,
        e.created_at,
        e.updated_at,
        
        -- Informations de la filière
        f.nom as filiere,
        f.libelle as filiere_libelle,
        fac.nom as faculte,
        fac.libelle as faculte_libelle,
        
        -- Statut de la dernière inscription
        i_recent.statut_inscription,
        i_recent.annee_universitaire,
        
        -- Nombre total d'inscriptions
        (SELECT COUNT(*) FROM inscription WHERE etudiant_id = e.id) as nombre_inscriptions
        
      FROM etudiant e
      
      -- JOIN avec filière
      LEFT JOIN filieres f ON e.filiere_id = f.id
      LEFT JOIN facultes fac ON f.faculte_id = fac.id
      
      -- JOIN avec la dernière inscription
      LEFT JOIN LATERAL (
        SELECT statut_inscription, annee_universitaire, date_inscription
        FROM inscription
        WHERE etudiant_id = e.id
        ORDER BY date_inscription DESC
        LIMIT 1
      ) i_recent ON true
      
      WHERE 1=1
    `;
    
    const params = [];
    
    if (search && search.trim() !== '') {
      params.push(`%${search.trim()}%`);
      query += ` AND (
        e.nom ILIKE $${params.length} OR 
        e.prenom ILIKE $${params.length} OR 
        e.numero_dossier ILIKE $${params.length} OR 
        e.matricule ILIKE $${params.length} OR 
        e.email ILIKE $${params.length}
      )`;
    }
    
    if (statut && statut.trim() !== '') {
      params.push(statut.trim());
      query += ` AND e.statut = $${params.length}`;
    }
    
    query += ` ORDER BY e.id, e.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    console.log(`✅ ${result.rows.length} étudiants trouvés`);
    
    res.json({ 
      success: true,
      etudiants: result.rows,
      total: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Erreur récupération étudiants:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur',
      details: error.message 
    });
  }
});

// Détails d'un étudiant
// Remplacer la route existante par celle-ci :
app.get('/api/admin/etudiants/:id', async (req, res) => {
  try {
    // Récupérer l'étudiant avec sa filière
    const etudiantResult = await pool.query(`
      SELECT e.*, 
             f.nom as filiere,
             f.libelle as filiere_libelle,
             fac.nom as faculte,
             fac.libelle as faculte_libelle
      FROM etudiant e
      LEFT JOIN filieres f ON e.filiere_id = f.id
      LEFT JOIN facultes fac ON f.faculte_id = fac.id
      WHERE e.id = $1
    `, [req.params.id]);
    
    if (etudiantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Étudiant non trouvé' });
    }
    
    // Récupérer les inscriptions avec les infos de filière/niveau de l'étudiant
    const inscriptionsResult = await pool.query(`
      SELECT i.*,
             e.niveau,
             f.nom as filiere_nom, 
             f.libelle as filiere_libelle,
             fac.nom as faculte_nom,
             fac.libelle as faculte_libelle
      FROM inscription i
      JOIN etudiant e ON i.etudiant_id = e.id
      LEFT JOIN filieres f ON e.filiere_id = f.id
      LEFT JOIN facultes fac ON f.faculte_id = fac.id
      WHERE i.etudiant_id = $1
      ORDER BY i.date_inscription DESC
    `, [req.params.id]);
    
    res.json({
      success: true,
      etudiant: etudiantResult.rows[0],
      inscriptions: inscriptionsResult.rows
    });
  } catch (error) {
    console.error('Erreur détails étudiant:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur',
      details: error.message 
    });
  }
});

// Modifier un étudiant
app.put('/api/admin/etudiants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      matricule, nom, prenom, date_naissance, lieu_naissance,
      nationalite, genre, adresse, telephone, email,
      type_bac, lieu_obtention, annee_obtention, mention,
      statut, peut_inscrire
    } = req.body;
    
    const result = await pool.query(`
      UPDATE etudiant SET
        matricule = $1, nom = $2, prenom = $3, date_naissance = $4,
        lieu_naissance = $5, nationalite = $6, genre = $7, adresse = $8,
        telephone = $9, email = $10, type_bac = $11, lieu_obtention = $12,
        annee_obtention = $13, mention = $14, statut = $15, peut_inscrire = $16,
        updated_at = NOW()
      WHERE id = $17
      RETURNING *
    `, [
      matricule, nom, prenom, date_naissance, lieu_naissance,
      nationalite, genre, adresse, telephone, email,
      type_bac, lieu_obtention, annee_obtention, mention,
      statut, peut_inscrire, id
    ]);
    
    res.json({ success: true, etudiant: result.rows[0] });
  } catch (error) {
    console.error('Erreur modification étudiant:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Activer/Désactiver l'inscription d'un étudiant
app.put('/api/admin/etudiants/:id/toggle-inscription', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE etudiant 
      SET peut_inscrire = NOT peut_inscrire, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [req.params.id]);
    
    res.json({ success: true, etudiant: result.rows[0] });
  } catch (error) {
    console.error('Erreur toggle inscription:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un étudiant
app.delete('/api/admin/etudiants/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM etudiant WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression étudiant:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Générer un matricule automatique
app.post('/api/admin/etudiants/:id/generer-matricule', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const annee = new Date().getFullYear();
    
    // Compter les étudiants de l'année
    const countResult = await pool.query(`
      SELECT COUNT(*) as count FROM etudiant 
      WHERE matricule LIKE $1
    `, [`${annee}UDH%`]);
    
    const nextNumber = parseInt(countResult.rows[0].count) + 1;
    const matricule = `${annee}UDH${nextNumber.toString().padStart(4, '0')}`;
    
    const result = await pool.query(`
      UPDATE etudiant 
      SET matricule = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [matricule, req.params.id]);
    
    res.json({ success: true, etudiant: result.rows[0] });
  } catch (error) {
    console.error('Erreur génération matricule:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
// Route à ajouter dans votre fichier serveur (inscrire.js ou server.js)
// Après les autres routes /admin/etudiants

// Créer un étudiant manuellement
app.post('/api/admin/etudiants/creer', async (req, res) => {
  try {
    const {
      numero_dossier, matricule, nom, prenom, date_naissance, lieu_naissance,
      nationalite, genre, adresse, telephone, email, type_bac, lieu_obtention,
      annee_obtention, mention, statut, peut_inscrire
    } = req.body;
    
    // Validation des champs obligatoires
    if (!numero_dossier || !nom || !prenom || !date_naissance || !lieu_naissance ||
        !nationalite || !genre || !adresse || !telephone || !email) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    
    // Vérifier que le numéro de dossier n'existe pas
    const checkDossier = await pool.query(
      'SELECT id FROM etudiant WHERE numero_dossier = $1',
      [numero_dossier]
    );
    
    if (checkDossier.rows.length > 0) {
      return res.status(400).json({ error: 'Ce numéro de dossier existe déjà' });
    }
    
    // Vérifier le matricule s'il est fourni
    if (matricule) {
      const checkMatricule = await pool.query(
        'SELECT id FROM etudiant WHERE matricule = $1',
        [matricule]
      );
      
      if (checkMatricule.rows.length > 0) {
        return res.status(400).json({ error: 'Ce matricule existe déjà' });
      }
    }
    
    // Insérer l'étudiant
    const result = await pool.query(`
      INSERT INTO etudiant (
        numero_dossier, matricule, nom, prenom, date_naissance, lieu_naissance,
        nationalite, genre, adresse, telephone, email, type_bac, lieu_obtention,
        annee_obtention, mention, statut, peut_inscrire
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
      numero_dossier, matricule, nom, prenom, date_naissance, lieu_naissance,
      nationalite, genre, adresse, telephone, email, type_bac, lieu_obtention,
      annee_obtention, mention, statut || 'actif', peut_inscrire !== false
    ]);
    
    console.log('✅ Étudiant créé:', result.rows[0].numero_dossier);
    
    res.json({ success: true, etudiant: result.rows[0] });
    
  } catch (error) {
    console.error('❌ Erreur création étudiant:', error);
    
    if (error.code === '23505') { // Violation de contrainte unique
      return res.status(400).json({ error: 'Numéro de dossier ou matricule déjà existant' });
    }
    
    res.status(500).json({ error: 'Erreur lors de la création de l\'étudiant' });
  }
});

// Route pour obtenir les filières actives (pour inscription publique)
app.get('/api/filieres/actives', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.id, f.nom, f.libelle, f.description, f.capacite_max,
             fac.nom as faculte_nom, fac.libelle as faculte_libelle
      FROM filieres f
      JOIN facultes fac ON f.faculte_id = fac.id
      WHERE f.active = true AND fac.active = true
      ORDER BY fac.nom, f.nom
    `);
    
    res.json({ filieres: result.rows });
  } catch (error) {
    console.error('Erreur récupération filières actives:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour obtenir la configuration d'inscription (publique)
app.get('/api/inscription/config', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM config_inscription 
      ORDER BY created_at DESC LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return res.json({ 
        ouvert: false, 
        message: 'Configuration non trouvée' 
      });
    }
    
    const config = result.rows[0];
    
    // ⚠️ CORRECTION ICI - Vérifier UNIQUEMENT config.actif
    const ouvert = config.actif === true;
    
    console.log('🔍 Statut inscription:', {
      actif: config.actif,
      ouvert: ouvert,
      message: config.message_fermeture
    });
    
    res.json({
      ouvert: ouvert,
      config: config,
      message: ouvert 
        ? 'Les inscriptions sont ouvertes' 
        : (config.message_fermeture || 'Les inscriptions sont fermées par l\'administration')
    });
    
  } catch (error) {
    console.error('❌ Erreur config inscription:', error);
    res.status(500).json({ 
      ouvert: false,
      error: 'Erreur serveur'
    });
  }
});
// REMPLACER la route /api/admin/inscription/creer
app.post('/api/admin/inscription/creer', async (req, res) => {
  try {
    const { 
      etudiant_id, 
      annee_universitaire,
      mode_paiement,
      montant,
      statut_paiement,
      statut_inscription
    } = req.body;
    
    console.log('📝 Création inscription admin:', req.body);
    
    // Validation
    if (!etudiant_id || !annee_universitaire) {
      return res.status(400).json({ 
        error: 'Champs obligatoires manquants',
        details: 'etudiant_id et annee_universitaire sont requis'
      });
    }
    
    // Vérifier que l'étudiant existe et a une filière/niveau
    const etudiantCheck = await pool.query(`
      SELECT e.id, e.peut_inscrire, e.filiere_id, e.niveau, e.nom, e.prenom,
             f.nom as filiere_nom, f.libelle as filiere_libelle
      FROM etudiant e
      LEFT JOIN filieres f ON e.filiere_id = f.id
      WHERE e.id = $1
    `, [etudiant_id]);
    
    if (etudiantCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Étudiant non trouvé' });
    }
    
    const etudiant = etudiantCheck.rows[0];
    
    if (!etudiant.peut_inscrire) {
      return res.status(403).json({ 
        error: 'Cet étudiant n\'est pas autorisé à s\'inscrire' 
      });
    }
    
    if (!etudiant.filiere_id || !etudiant.niveau) {
      return res.status(400).json({ 
        error: 'L\'étudiant doit avoir une filière et un niveau définis',
        details: `Filière: ${etudiant.filiere_id || 'Non définie'}, Niveau: ${etudiant.niveau || 'Non défini'}`
      });
    }
    
    
    
    // CORRECTION : Créer l'inscription AVEC filiere_id et niveau
    const result = await pool.query(`
      INSERT INTO inscription (
        etudiant_id, 
        annee_universitaire,
        mode_paiement,
        montant,
        statut_paiement,
        statut_inscription,
        date_validation       -- CORRIGÉ : position correcte
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [
      etudiant_id, 
      annee_universitaire,
      mode_paiement || null,
      montant || null,
      statut_paiement || 'en-attente',
      statut_inscription || 'validee'
    ]);
    
    console.log('✅ Inscription créée:', result.rows[0].id);
    
    res.json({ 
      success: true, 
      inscription: result.rows[0],
      message: `Inscription créée pour ${etudiant.prenom} ${etudiant.nom} en ${etudiant.filiere_libelle} - ${etudiant.niveau}`
    });
    
  } catch (error) {
    console.error('❌ Erreur création inscription:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur',
      details: error.message
    });
  }
});
// Route pour obtenir toutes les inscriptions
app.get('/api/admin/inscriptions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        i.*,
        e.matricule, e.numero_dossier, e.nom, e.prenom, e.email, e.telephone,
        e.niveau,
        f.nom as filiere,
        f.libelle as filiere_libelle,
        fac.nom as faculte,
        fac.libelle as faculte_libelle
      FROM inscription i
      JOIN etudiant e ON i.etudiant_id = e.id
      LEFT JOIN filieres f ON e.filiere_id = f.id
      LEFT JOIN facultes fac ON f.faculte_id = fac.id
      ORDER BY i.date_inscription DESC
    `);
    
    res.json({ 
      success: true,
      inscriptions: result.rows 
    });
  } catch (error) {
    console.error('Erreur récupération inscriptions:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
app.put('/api/admin/inscription/toggle-global', async (req, res) => {
  try {
    const { actif, raison } = req.body;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Mettre a jour la configuration
      await client.query(`
        UPDATE config_inscription 
        SET actif = $1, 
            message_fermeture = $2,
            updated_at = NOW()
        WHERE annee_universitaire = '2024-2025'
      `, [actif, raison || '']);
      
      // Mettre a jour tous les etudiants
      if (!actif) {
        await client.query(`
          UPDATE etudiant 
          SET peut_inscrire = false, updated_at = NOW()
          WHERE peut_inscrire = true
        `);
      } else {
        await client.query(`
          UPDATE etudiant 
          SET peut_inscrire = true, updated_at = NOW()
          WHERE statut = 'actif' AND peut_inscrire = false
        `);
      }
      
      await client.query('COMMIT');
      
      const statsResult = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE peut_inscrire = true) as etudiants_autorises,
          COUNT(*) FILTER (WHERE peut_inscrire = false) as etudiants_bloques,
          COUNT(*) as total_etudiants
        FROM etudiant
      `);
      
      res.json({ 
        success: true,
        actif,
        message: actif ? 'Inscriptions debloquees' : 'Inscriptions bloquees',
        statistiques: statsResult.rows[0]
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Erreur toggle:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur'
    });
  }
});
app.get('/api/admin/inscription/statut-global', async (req, res) => {
  try {
    const configResult = await pool.query(`
      SELECT * FROM config_inscription 
      WHERE annee_universitaire = '2024-2025'
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE peut_inscrire = true) as etudiants_autorises,
        COUNT(*) FILTER (WHERE peut_inscrire = false) as etudiants_bloques,
        COUNT(*) as total_etudiants,
        COUNT(*) FILTER (WHERE statut = 'actif') as etudiants_actifs
      FROM etudiant
    `);
    
    const config = configResult.rows[0] || { 
      actif: false, 
      annee_universitaire: '2024-2025',
      message_fermeture: 'Configuration non initialisée'
    };
    
    res.json({
      success: true,
      config,
      statistiques: statsResult.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Erreur récupération statut global:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur',
      details: error.message 
    });
  }
});

// Dans server.js - Route /api/payment/initier
app.post('/api/payment/initier', async (req, res) => {
  try {
    const {
      etudiant_id,
      annee_universitaire,
      operateur,
      telephone,
      montant
    } = req.body;

    console.log('💵 Initiation paiement:', { etudiant_id, operateur, telephone, montant });

    // Validation
    if (!etudiant_id || !annee_universitaire || !operateur || !telephone || !montant) {
      return res.status(400).json({
        success: false,
        error: 'Paramètres manquants'
      });
    }

    // Vérifier que l'étudiant existe et peut s'inscrire
    const etudiantCheck = await pool.query(`
      SELECT e.*, f.nom as filiere, f.libelle as filiere_libelle
      FROM etudiant e
      LEFT JOIN filieres f ON e.filiere_id = f.id
      WHERE e.id = $1 AND e.peut_inscrire = true AND e.statut = 'actif'
    `, [etudiant_id]);

    if (etudiantCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Étudiant non autorisé à s\'inscrire'
      });
    }

    const etudiant = etudiantCheck.rows[0];

    

    // Vérifier qu'il n'y a pas de paiement en cours non expiré
    const paiementEnCours = await pool.query(`
      SELECT * FROM paiement_temporaire
      WHERE etudiant_id = $1 
        AND annee_universitaire = $2
        AND statut IN ('en-attente', 'en-cours')
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `, [etudiant_id, annee_universitaire]);

    if (paiementEnCours.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Un paiement est déjà en cours. Veuillez patienter ou réessayer dans 30 minutes.',
        transaction: paiementEnCours.rows[0]
      });
    }

    // Initier le paiement avec l'opérateur
    const paymentResult = await paymentService.initierPaiement({
      operateur,
      telephone,
      montant,
      etudiant_id,
      etudiant_nom: etudiant.nom,
      etudiant_prenom: etudiant.prenom
    });

    if (!paymentResult.success) {
      return res.status(500).json({
        success: false,
        error: paymentResult.error,
        message: 'Échec de l\'initiation du paiement'
      });
    }

    // Enregistrer le paiement TEMPORAIRE (pas l'inscription)
    const paiementTempResult = await pool.query(`
      INSERT INTO paiement_temporaire (
        etudiant_id, annee_universitaire, transaction_id, operateur, 
        telephone, montant, statut, data_operateur
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      etudiant_id,
      annee_universitaire,
      paymentResult.transactionId,
      operateur,
      telephone,
      montant,
      paymentResult.statut || 'en-cours',
      JSON.stringify(paymentResult.data)
    ]);

    console.log('✅ Paiement temporaire créé:', paymentResult.transactionId);

    res.json({
      success: true,
      paiement: paiementTempResult.rows[0],
      transaction_id: paymentResult.transactionId,
      message: `Paiement initié avec ${operateur}. Veuillez valider sur votre téléphone.`,
      instructions: `Composez le code envoyé au ${telephone} pour valider le paiement de ${montant} FCFA.`
    });

  } catch (error) {
    console.error('❌ Erreur initiation paiement:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur',
      details: error.message
    });
  }
});

// 2. Vérifier le statut d'un paiement
// Dans server.js - Route /api/payment/statut/:transaction_id
app.get('/api/payment/statut/:transaction_id', async (req, res) => {
  try {
    const { transaction_id } = req.params;

    console.log('🔍 Vérification statut:', transaction_id);

    // Récupérer le paiement temporaire
    const paiementTempResult = await pool.query(`
      SELECT * FROM paiement_temporaire
      WHERE transaction_id = $1
    `, [transaction_id]);

    if (paiementTempResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction non trouvée'
      });
    }

    const paiementTemp = paiementTempResult.rows[0];

    // Si déjà expiré, retourner l'info
    if (paiementTemp.expires_at < new Date() && paiementTemp.statut !== 'reussi') {
      await pool.query(`
        UPDATE paiement_temporaire
        SET statut = 'expire'
        WHERE transaction_id = $1
      `, [transaction_id]);

      return res.json({
        success: false,
        statut: 'expire',
        message: 'Le délai de paiement a expiré. Veuillez réessayer.'
      });
    }

    // Vérifier auprès de l'opérateur
    const statutResult = await paymentService.verifierStatut(
      transaction_id,
      paiementTemp.operateur
    );

    if (!statutResult.success) {
      return res.json({
        success: false,
        error: 'Impossible de vérifier le statut',
        details: statutResult.error
      });
    }

    // Mapper le statut
    let nouveauStatut = paiementTemp.statut;
    
    if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'VALIDATED'].includes(statutResult.statut)) {
      nouveauStatut = 'reussi';
    } else if (['FAILED', 'REJECTED', 'ERROR'].includes(statutResult.statut)) {
      nouveauStatut = 'echoue';
    } else if (['PENDING', 'PROCESSING', 'IN_PROGRESS'].includes(statutResult.statut)) {
      nouveauStatut = 'en-cours';
    }

    // ✅ SI PAIEMENT RÉUSSI : Créer l'inscription ET la transaction
    if (nouveauStatut === 'reussi') {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // 1. Créer l'inscription
        const inscriptionResult = await client.query(`
          INSERT INTO inscription (
            etudiant_id, annee_universitaire, mode_paiement, telephone_paiement,
            montant, statut_paiement, statut_inscription, date_validation
          ) VALUES ($1, $2, $3, $4, $5, 'valide', 'validee', NOW())
          RETURNING *
        `, [
          paiementTemp.etudiant_id,
          paiementTemp.annee_universitaire,
          paiementTemp.operateur,
          paiementTemp.telephone,
          paiementTemp.montant
        ]);

        // 2. Créer la transaction définitive
        await client.query(`
          INSERT INTO transactions_paiement (
            inscription_id, transaction_id, operateur, telephone, montant,
            statut, message_operateur, data_operateur, date_validation
          ) VALUES ($1, $2, $3, $4, $5, 'reussi', $6, $7, NOW())
        `, [
          inscriptionResult.rows[0].id,
          transaction_id,
          paiementTemp.operateur,
          paiementTemp.telephone,
          paiementTemp.montant,
          statutResult.data?.message || 'Paiement validé',
          JSON.stringify(statutResult.data)
        ]);

        // 3. Supprimer le paiement temporaire
        await client.query(`
          DELETE FROM paiement_temporaire WHERE transaction_id = $1
        `, [transaction_id]);

        await client.query('COMMIT');

        console.log('✅ Inscription créée après validation paiement:', inscriptionResult.rows[0].id);

        return res.json({
          success: true,
          statut: 'reussi',
          inscription: inscriptionResult.rows[0],
          message: 'Paiement validé ! Votre inscription est confirmée.'
        });

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    // Si échec, mettre à jour le statut temporaire
    if (nouveauStatut === 'echoue') {
      await pool.query(`
        UPDATE paiement_temporaire
        SET statut = 'echoue'
        WHERE transaction_id = $1
      `, [transaction_id]);

      return res.json({
        success: false,
        statut: 'echoue',
        message: 'Le paiement a échoué. Veuillez réessayer.'
      });
    }

    // Sinon, en cours
    await pool.query(`
      UPDATE paiement_temporaire
      SET statut = $1, data_operateur = $2
      WHERE transaction_id = $3
    `, [nouveauStatut, JSON.stringify(statutResult.data), transaction_id]);

    res.json({
      success: true,
      statut: nouveauStatut,
      message: 'Paiement en cours de traitement...'
    });

  } catch (error) {
    console.error('❌ Erreur vérification statut:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur',
      details: error.message
    });
  }
});

// 3. Callback des opérateurs (webhook)
app.post('/api/payment/callback', async (req, res) => {
  try {
    console.log('📞 Callback reçu:', req.body);

    const { transaction_id, status, operator, data } = req.body;

    if (!transaction_id) {
      return res.status(400).json({ error: 'Transaction ID manquant' });
    }

    // Récupérer la transaction
    const transactionResult = await pool.query(`
      SELECT * FROM transactions_paiement
      WHERE transaction_id = $1
    `, [transaction_id]);

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction non trouvée' });
    }

    const transaction = transactionResult.rows[0];

    // Mapper le statut
    let nouveauStatut = 'en-cours';
    
    if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(status)) {
      nouveauStatut = 'reussi';
    } else if (['FAILED', 'REJECTED', 'ERROR'].includes(status)) {
      nouveauStatut = 'echoue';
    } else if (['CANCELLED'].includes(status)) {
      nouveauStatut = 'annule';
    }

    // Mettre à jour la transaction
    await pool.query(`
      UPDATE transactions_paiement
      SET statut = $1,
          message_operateur = $2,
          data_operateur = $3,
          date_validation = CASE WHEN $1 = 'reussi' THEN NOW() ELSE date_validation END,
          updated_at = NOW()
      WHERE transaction_id = $4
    `, [
      nouveauStatut,
      data?.message || 'Callback reçu',
      JSON.stringify(data),
      transaction_id
    ]);

    // Mettre à jour l'inscription si nécessaire
    if (nouveauStatut === 'reussi') {
      await pool.query(`
        UPDATE inscription
        SET statut_paiement = 'valide',
            statut_inscription = 'validee',
            date_validation = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [transaction.inscription_id]);
    } else if (nouveauStatut === 'echoue') {
      await pool.query(`
        UPDATE inscription
        SET statut_paiement = 'refuse',
            updated_at = NOW()
        WHERE id = $1
      `, [transaction.inscription_id]);
    }

    console.log(`✅ Callback traité: ${transaction_id} - ${nouveauStatut}`);

    // Réponse au format attendu par l'opérateur
    res.json({
      success: true,
      message: 'Callback traité',
      transaction_id
    });

  } catch (error) {
    console.error('❌ Erreur callback:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// 4. Obtenir l'historique des paiements d'une inscription
app.get('/api/payment/historique/:inscription_id', async (req, res) => {
  try {
    const { inscription_id } = req.params;

    const result = await pool.query(`
      SELECT * FROM transactions_paiement
      WHERE inscription_id = $1
      ORDER BY created_at DESC
    `, [inscription_id]);

    res.json({
      success: true,
      transactions: result.rows
    });

  } catch (error) {
    console.error('❌ Erreur historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// 5. Annuler un paiement (admin)
app.post('/api/admin/payment/annuler/:transaction_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { transaction_id } = req.params;
    const { raison } = req.body;

    await pool.query(`
      UPDATE transactions_paiement
      SET statut = 'annule',
          message_operateur = $1,
          updated_at = NOW()
      WHERE transaction_id = $2
    `, [raison || 'Annulé par l\'administrateur', transaction_id]);

    res.json({
      success: true,
      message: 'Paiement annulé'
    });

  } catch (error) {
    console.error('❌ Erreur annulation:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Obtenir les informations de paiement (numéros marchands)
app.get('/api/payment/infos/:operateur', async (req, res) => {
  try {
    const { operateur } = req.params;
    
    const infos = paymentService.getInfosPaiement(operateur);
    
    res.json({
      success: true,
      infos: infos,
      instructions: `Envoyez ${req.query.montant || '50000'} FCFA au numéro ${infos.numero} via ${operateur.toUpperCase()}`
    });
    
  } catch (error) {
    console.error('Erreur infos paiement:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// 6. Statistiques des paiements (admin)
app.get('/api/admin/payment/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN statut = 'reussi' THEN 1 END) as paiements_reussis,
        COUNT(CASE WHEN statut = 'echoue' THEN 1 END) as paiements_echoues,
        COUNT(CASE WHEN statut = 'en-cours' THEN 1 END) as paiements_en_cours,
        SUM(CASE WHEN statut = 'reussi' THEN montant ELSE 0 END) as montant_total_reussi,
        operateur,
        COUNT(*) as nombre_par_operateur
      FROM transactions_paiement
      GROUP BY operateur
    `);

    res.json({
      success: true,
      stats: stats.rows
    });

  } catch (error) {
    console.error('❌ Erreur stats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

console.log('✅ Routes de paiement mobile chargées');
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../depot/index.html'));
});

// Initialisation de la base de données

async function initializeDatabase() {
  try {
    console.log('🔧 Initialisation de la base de données...');

    // Créer la table users
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        telephone VARCHAR(20) UNIQUE NOT NULL,
        mot_de_passe VARCHAR(255) NOT NULL,
        date_naissance DATE,
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Créer la table facultes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS facultes (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL UNIQUE,
        libelle VARCHAR(255) NOT NULL,
        description TEXT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Créer la table type_bacs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS type_bacs (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(50) NOT NULL UNIQUE,
        libelle VARCHAR(100) NOT NULL,
        description TEXT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Créer la table filieres
    await pool.query(`
      CREATE TABLE IF NOT EXISTS filieres (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        libelle VARCHAR(255) NOT NULL,
        description TEXT,
        faculte_id INTEGER NOT NULL REFERENCES facultes(id) ON DELETE RESTRICT,
        capacite_max INTEGER DEFAULT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(nom, faculte_id)
      );
    `);

    // Créer la table diplomes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS diplomes (
        id SERIAL PRIMARY KEY,
        libelle VARCHAR(255) NOT NULL,
        faculte_id INTEGER NOT NULL REFERENCES facultes(id) ON DELETE RESTRICT,
        filiere_id INTEGER NOT NULL REFERENCES filieres(id) ON DELETE RESTRICT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Créer la table de liaison filiere_type_bacs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS filiere_type_bacs (
        id SERIAL PRIMARY KEY,
        filiere_id INTEGER NOT NULL REFERENCES filieres(id) ON DELETE CASCADE,
        type_bac_id INTEGER NOT NULL REFERENCES type_bacs(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(filiere_id, type_bac_id)
      );
    `);

    // Créer la table applications
    await pool.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        numero_dossier VARCHAR(50) UNIQUE NOT NULL,
        numero_depot VARCHAR(50),
        
        -- Informations personnelles (VARCHAR simple)
        nom VARCHAR(255) NOT NULL,
        prenom VARCHAR(255) NOT NULL,
        date_naissance DATE NOT NULL,
        lieu_naissance VARCHAR(255) NOT NULL,
        nationalite VARCHAR(50) NOT NULL,
        genre VARCHAR(20) NOT NULL,
        adresse TEXT NOT NULL,
        telephone VARCHAR(20) NOT NULL,
        email VARCHAR(255) NOT NULL,
        
        -- Informations baccalauréat
        type_bac VARCHAR(50) NOT NULL,
        lieu_obtention VARCHAR(255) NOT NULL,
        annee_obtention VARCHAR(10) NOT NULL,
        mention VARCHAR(50) NOT NULL,
        
        -- Choix de formation
        premier_choix VARCHAR(255) NOT NULL,
        deuxieme_choix VARCHAR(255) NOT NULL,
        troisieme_choix VARCHAR(255) NOT NULL,
        
        -- Documents
        documents JSONB,
        
        -- Statut (VARCHAR au lieu d'ENUM)
        statut VARCHAR(20) DEFAULT 'en-attente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  
    // Ajouter les contraintes CHECK pour applications
    await pool.query(`
      ALTER TABLE applications 
      DROP CONSTRAINT IF EXISTS check_genre,
      DROP CONSTRAINT IF EXISTS check_statut;
      
      ALTER TABLE applications 
      ADD CONSTRAINT check_genre CHECK (genre IN ('masculin', 'feminin')),
      ADD CONSTRAINT check_statut CHECK (statut IN ('en-attente', 'approuve', 'rejete'));
    `).catch(err => {
      console.log('Contraintes déjà existantes ou erreur mineure:', err.message);
    });

    // Table etudiant AVEC filiere_id AJOUTÉ
    // Dans la fonction initializeDatabase(), remplacer la création de la table etudiant
await pool.query(`
  CREATE TABLE IF NOT EXISTS etudiant (
    id SERIAL PRIMARY KEY,
    matricule VARCHAR(50) UNIQUE,
    numero_dossier VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255) NOT NULL,
    date_naissance DATE NOT NULL,
    lieu_naissance VARCHAR(255) NOT NULL,
    nationalite VARCHAR(50) NOT NULL,
    genre VARCHAR(20) NOT NULL,
    adresse TEXT NOT NULL,
    telephone VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    type_bac VARCHAR(50),
    lieu_obtention VARCHAR(255),
    annee_obtention VARCHAR(10),
    mention VARCHAR(50),
    
    -- Filière et niveau définitifs de l'étudiant
    filiere_id INTEGER REFERENCES filieres(id) ON DELETE SET NULL,
    niveau VARCHAR(10) CHECK (niveau IN ('L1', 'L2', 'L3', 'M1', 'M2', 'D1', 'D2', 'D3')),
    
    statut VARCHAR(20) DEFAULT 'actif',
    peut_inscrire BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (genre IN ('masculin', 'feminin')),
    CHECK (statut IN ('actif', 'inactif', 'diplome', 'abandonne'))
  );
`);

    // Table inscription avec contrôles granulaires
    // Table inscription simplifiée
await pool.query(`
  CREATE TABLE IF NOT EXISTS inscription (
    id SERIAL PRIMARY KEY,
    etudiant_id INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
    annee_universitaire VARCHAR(20) NOT NULL,
    mode_paiement VARCHAR(50),
    telephone_paiement VARCHAR(20),
    montant INTEGER,
    statut_paiement VARCHAR(20) DEFAULT 'en-attente',
    statut_inscription VARCHAR(20) DEFAULT 'en-attente',
    date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_validation TIMESTAMP,
    validee_par INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(etudiant_id, annee_universitaire),
    CHECK (statut_paiement IN ('en-attente', 'valide', 'refuse')),
    CHECK (statut_inscription IN ('en-attente', 'validee', 'annulee'))
  );
`);
await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions_paiement (
      id SERIAL PRIMARY KEY,
      inscription_id INTEGER NOT NULL REFERENCES inscription(id) ON DELETE CASCADE,
      transaction_id VARCHAR(100) UNIQUE NOT NULL,
      operateur VARCHAR(20) NOT NULL,
      telephone VARCHAR(20) NOT NULL,
      montant INTEGER NOT NULL,
      statut VARCHAR(20) DEFAULT 'en-attente',
      message_operateur TEXT,
      data_operateur JSONB,
      tentatives INTEGER DEFAULT 0,
      date_initiation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      date_validation TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (statut IN ('en-attente', 'PENDING', 'reussi', 'echoue', 'annule', 'expire'))
    );
  `);
await pool.query(`
  CREATE TABLE IF NOT EXISTS paiement_temporaire (
    id SERIAL PRIMARY KEY,
    etudiant_id INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
    annee_universitaire VARCHAR(20) NOT NULL,
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    operateur VARCHAR(20) NOT NULL,
    telephone VARCHAR(20) NOT NULL,
    montant INTEGER NOT NULL,
    statut VARCHAR(20) DEFAULT 'en-attente',
    data_operateur JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 minutes',
    CHECK (statut IN ('en-attente', 'en-cours', 'expire'))
  );
`);


    // Table pour la configuration des inscriptions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS config_inscription (
        id SERIAL PRIMARY KEY,
        actif BOOLEAN DEFAULT true,
        annee_universitaire VARCHAR(20) NOT NULL UNIQUE,
        date_ouverture TIMESTAMP,
        date_fermeture TIMESTAMP,
        message_fermeture TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Table pour les restrictions d'inscription avec corrections
    await pool.query(`
      CREATE TABLE IF NOT EXISTS restriction_inscription (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        filiere_id INTEGER REFERENCES filieres(id) ON DELETE CASCADE,
        niveau VARCHAR(10),
        etudiant_id INTEGER REFERENCES etudiant(id) ON DELETE CASCADE,
        actif BOOLEAN DEFAULT true,
        raison TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CHECK (type IN ('filiere', 'niveau', 'filiere_niveau', 'etudiant')),
        -- Contraintes pour garantir l'intégrité selon le type
        CHECK (
          (type = 'filiere' AND filiere_id IS NOT NULL AND niveau IS NULL AND etudiant_id IS NULL) OR
          (type = 'niveau' AND filiere_id IS NULL AND niveau IS NOT NULL AND etudiant_id IS NULL) OR
          (type = 'filiere_niveau' AND filiere_id IS NOT NULL AND niveau IS NOT NULL AND etudiant_id IS NULL) OR
          (type = 'etudiant' AND filiere_id IS NULL AND niveau IS NULL AND etudiant_id IS NOT NULL)
        )
      );
    `);


    // Index pour performances
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_etudiant_matricule ON etudiant(matricule);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_etudiant_numero_dossier ON etudiant(numero_dossier);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_inscription_etudiant ON inscription(etudiant_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_inscription_annee ON inscription(annee_universitaire);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_inscription_statut ON inscription(statut_inscription);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_restriction_type ON restriction_inscription(type);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_restriction_actif ON restriction_inscription(actif);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_config_annee ON config_inscription(annee_universitaire);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_config_actif ON config_inscription(actif);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_paiement_temp_etudiant ON paiement_temporaire(etudiant_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_paiement_temp_transaction ON paiement_temporaire(transaction_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transaction_inscription ON transactions_paiement(inscription_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transaction_id ON transactions_paiement(transaction_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transaction_statut ON transactions_paiement(statut);`);
 
    // Configuration par défaut
    await pool.query(`
      INSERT INTO config_inscription (actif, annee_universitaire, date_ouverture, date_fermeture)
      SELECT true, '2024-2025', NOW(), NOW() + INTERVAL '3 months'
      WHERE NOT EXISTS (SELECT 1 FROM config_inscription WHERE annee_universitaire = '2024-2025')
    `);

    console.log('✅ Tables inscription et etudiant créées');

    // Créer les autres index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_telephone ON users(telephone);
      CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
      CREATE INDEX IF NOT EXISTS idx_applications_statut ON applications(statut);
      CREATE INDEX IF NOT EXISTS idx_filieres_faculte_id ON filieres(faculte_id);
      CREATE INDEX IF NOT EXISTS idx_diplomes_faculte_id ON diplomes(faculte_id);
      CREATE INDEX IF NOT EXISTS idx_diplomes_filiere_id ON diplomes(filiere_id);
      CREATE INDEX IF NOT EXISTS idx_filieres_active ON filieres(active);
      CREATE INDEX IF NOT EXISTS idx_filiere_type_bacs_filiere_id ON filiere_type_bacs(filiere_id);
      CREATE INDEX IF NOT EXISTS idx_filiere_type_bacs_type_bac_id ON filiere_type_bacs(type_bac_id);
      CREATE INDEX IF NOT EXISTS idx_facultes_active ON facultes(active);
      CREATE INDEX IF NOT EXISTS idx_type_bacs_active ON type_bacs(active);
    `);

    // Insertion des facultés
    await pool.query(`
      INSERT INTO facultes (nom, libelle, description) VALUES
      ('FADEG', 'Faculté de Droit d''Économie et de Gestion', 'Faculté de Droit, Économie et Gestion'),
      ('FSA', 'Faculté des Sciences Agronomiques', 'Faculté des Sciences Agronomiques'),
      ('FSE', 'Faculté des Sciences de l''Éducation', 'Faculté des Sciences de l''Éducation'),
      ('IUT', 'Institut Universitaire de Technologie', 'Institut Universitaire de Technologie')
      ON CONFLICT (nom) DO NOTHING;
    `);

    // Insertion des types de bac
    await pool.query(`
      INSERT INTO type_bacs (nom, libelle, description) VALUES
      ('BAC A', 'Baccalauréat A', 'Baccalauréat littéraire'),
      ('BAC C', 'Baccalauréat C', 'Baccalauréat scientifique - Mathématiques et Sciences physiques'),
      ('BAC D', 'Baccalauréat D', 'Baccalauréat scientifique - Sciences naturelles'),
      ('BAC G', 'Baccalauréat G', 'Baccalauréat tertiaire - Gestion')
      ON CONFLICT (nom) DO NOTHING;
    `);

    // Insertion des filières
    await pool.query(`
      INSERT INTO filieres (nom, libelle, faculte_id, capacite_max, description) VALUES
      -- Filières FADEG
      ('INFORMATIQUE', 'Informatique', (SELECT id FROM facultes WHERE nom = 'FADEG'), 150, 'Formation en informatique et développement'),
      ('MATHEMATIQUES', 'Mathématiques', (SELECT id FROM facultes WHERE nom = 'FADEG'), 100, 'Formation en mathématiques pures et appliquées'),
      ('PHYSIQUE', 'Physique', (SELECT id FROM facultes WHERE nom = 'FADEG'), 80, 'Formation en physique théorique et expérimentale'),
      ('CHIMIE', 'Chimie', (SELECT id FROM facultes WHERE nom = 'FADEG'), 70, 'Formation en chimie générale et appliquée'),
      ('BIOLOGIE', 'Biologie', (SELECT id FROM facultes WHERE nom = 'FADEG'), 90, 'Formation en sciences biologiques'),
      
      -- Filières FSE
      ('FRANCAIS', 'Français', (SELECT id FROM facultes WHERE nom = 'FSE'), 120, 'Études françaises et littérature'),
      ('ANGLAIS', 'Anglais', (SELECT id FROM facultes WHERE nom = 'FSE'), 100, 'Études anglaises'),
      ('HISTOIRE', 'Histoire', (SELECT id FROM facultes WHERE nom = 'FSE'), 80, 'Histoire et civilisations'),
      ('GEOGRAPHIE', 'Géographie', (SELECT id FROM facultes WHERE nom = 'FSE'), 60, 'Géographie humaine et physique'),
      
      -- Filières FSA
      ('MEDECINE', 'Médecine', (SELECT id FROM facultes WHERE nom = 'FSA'), 50, 'Formation médicale'),
      ('PHARMACIE', 'Pharmacie', (SELECT id FROM facultes WHERE nom = 'FSA'), 40, 'Formation pharmaceutique'),
      
      -- Filières IUT
      ('GESTION', 'Gestion', (SELECT id FROM facultes WHERE nom = 'IUT'), 200, 'Sciences de gestion'),
      ('ECONOMIE', 'Économie', (SELECT id FROM facultes WHERE nom = 'IUT'), 150, 'Sciences économiques'),
      ('COMPTABILITE', 'Comptabilité', (SELECT id FROM facultes WHERE nom = 'IUT'), 120, 'Comptabilité et finance')
      ON CONFLICT (nom, faculte_id) DO NOTHING;
    `);

  
    // Attribution des types de bac aux filières
    await pool.query(`
      INSERT INTO filiere_type_bacs (filiere_id, type_bac_id) VALUES
      -- Informatique : C, D
      ((SELECT id FROM filieres WHERE nom = 'INFORMATIQUE'), (SELECT id FROM type_bacs WHERE nom = 'BAC C')),
      ((SELECT id FROM filieres WHERE nom = 'INFORMATIQUE'), (SELECT id FROM type_bacs WHERE nom = 'BAC D')),
      
      -- Mathématiques : C
      ((SELECT id FROM filieres WHERE nom = 'MATHEMATIQUES'), (SELECT id FROM type_bacs WHERE nom = 'BAC C')),
      
      -- Physique : C, D
      ((SELECT id FROM filieres WHERE nom = 'PHYSIQUE'), (SELECT id FROM type_bacs WHERE nom = 'BAC C')),
      ((SELECT id FROM filieres WHERE nom = 'PHYSIQUE'), (SELECT id FROM type_bacs WHERE nom = 'BAC D')),
      
      -- Chimie : C, D
      ((SELECT id FROM filieres WHERE nom = 'CHIMIE'), (SELECT id FROM type_bacs WHERE nom = 'BAC C')),
      ((SELECT id FROM filieres WHERE nom = 'CHIMIE'), (SELECT id FROM type_bacs WHERE nom = 'BAC D')),
      
      -- Biologie : D
      ((SELECT id FROM filieres WHERE nom = 'BIOLOGIE'), (SELECT id FROM type_bacs WHERE nom = 'BAC D')),
      
      -- Filières littéraires : A
      ((SELECT id FROM filieres WHERE nom = 'FRANCAIS'), (SELECT id FROM type_bacs WHERE nom = 'BAC A')),
      ((SELECT id FROM filieres WHERE nom = 'ANGLAIS'), (SELECT id FROM type_bacs WHERE nom = 'BAC A')),
      ((SELECT id FROM filieres WHERE nom = 'HISTOIRE'), (SELECT id FROM type_bacs WHERE nom = 'BAC A')),
      ((SELECT id FROM filieres WHERE nom = 'GEOGRAPHIE'), (SELECT id FROM type_bacs WHERE nom = 'BAC A')),
      
      -- Médecine : C, D
      ((SELECT id FROM filieres WHERE nom = 'MEDECINE'), (SELECT id FROM type_bacs WHERE nom = 'BAC C')),
      ((SELECT id FROM filieres WHERE nom = 'MEDECINE'), (SELECT id FROM type_bacs WHERE nom = 'BAC D')),
      
      -- Pharmacie : C, D
      ((SELECT id FROM filieres WHERE nom = 'PHARMACIE'), (SELECT id FROM type_bacs WHERE nom = 'BAC C')),
      ((SELECT id FROM filieres WHERE nom = 'PHARMACIE'), (SELECT id FROM type_bacs WHERE nom = 'BAC D')),
      
      -- Filières économiques : A, G, C
      ((SELECT id FROM filieres WHERE nom = 'GESTION'), (SELECT id FROM type_bacs WHERE nom = 'BAC A')),
      ((SELECT id FROM filieres WHERE nom = 'GESTION'), (SELECT id FROM type_bacs WHERE nom = 'BAC G')),
      ((SELECT id FROM filieres WHERE nom = 'ECONOMIE'), (SELECT id FROM type_bacs WHERE nom = 'BAC A')),
      ((SELECT id FROM filieres WHERE nom = 'ECONOMIE'), (SELECT id FROM type_bacs WHERE nom = 'BAC C')),
      ((SELECT id FROM filieres WHERE nom = 'ECONOMIE'), (SELECT id FROM type_bacs WHERE nom = 'BAC G')),
      ((SELECT id FROM filieres WHERE nom = 'COMPTABILITE'), (SELECT id FROM type_bacs WHERE nom = 'BAC G')),
      ((SELECT id FROM filieres WHERE nom = 'COMPTABILITE'), (SELECT id FROM type_bacs WHERE nom = 'BAC C'))
      ON CONFLICT (filiere_id, type_bac_id) DO NOTHING;
    `);

    console.log('✅ Base de données initialisée avec succès');
    
    // Créer un utilisateur admin par défaut
    await createDefaultAdmin();

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation de la base de données:', error);
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
}
// Création de l'administrateur par défaut
async function createDefaultAdmin() {
  try {
    const adminEmail = 'admin@edufile.com';
    const adminPassword = 'admin123';
    
    const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    
    if (userCheck.rows.length === 0) {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      
      await pool.query(
        'INSERT INTO users (nom, email, telephone, mot_de_passe, role) VALUES ($1, $2, $3, $4, $5)',
        ['Administrateur Principal', adminEmail, '+227123456789', passwordHash, 'admin']
      );
      
      console.log('👤 Administrateur par défaut créé:');
      console.log('   Email: admin@edufile.com');
      console.log('   Mot de passe: admin123');
      console.log('   ⚠️  CHANGEZ CES IDENTIFIANTS EN PRODUCTION !');
    }
  } catch (error) {
    console.error('Erreur lors de la création de l\'admin:', error);
  }
}

// Démarrage du serveur
async function startServer() {
  try {
    // Initialiser la base de données
    await initializeDatabase();
    
    // Démarrer le serveur
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Serveur EduFile démarré sur le port ${PORT}`);
      console.log(`🔗 API disponible sur: http://localhost:${PORT}/api`);
      console.log(`📁 Frontend disponible sur: http://localhost:${PORT}`);
      console.log(`💾 Base de données: PostgreSQL`);
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
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('❌ Erreur lors du démarrage du serveur:', error);
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
}

// Démarrer le serveur
startServer();
// Dans server.js - Ajouter après startServer()
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