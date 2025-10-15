
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

// Configuration PostgreSQL pour Neon
// Configuration PostgreSQL pour LOCAL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'edufile',
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
    console.log(`API Request: ${req.method} ${req.path}`);
    
    // Forcer le Content-Type JSON pour TOUTES les réponses API
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
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers JPEG, PNG et PDF sont autorisés'));
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

  console.log('🔐 Vérification token:', token ? 'Présent' : 'Absent');

  if (!token) {
    console.log('❌ Token manquant');
    return res.status(401).json({ error: 'Token d\'accès requis' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'votre_secret_jwt');
    console.log('🔓 Token décodé:', decoded);
    
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    
    if (result.rows.length === 0) {
      console.log('❌ Utilisateur non trouvé pour token');
      return res.status(403).json({ error: 'Token invalide' });
    }
    
    req.user = result.rows[0];
    console.log('✅ Utilisateur authentifié:', req.user.email);
    next();
  } catch (error) {
    console.error('❌ Erreur vérification token:', error);
    return res.status(403).json({ error: 'Token invalide' });
  }
};

// Middleware pour vérifier les droits admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Droits administrateur requis' });
  }
  next();
};
app.use('/api/admin/stats', (req, res, next) => {
    console.log(`📊 [STATS] ${req.method} ${req.path}`);
    console.log('🔐 Auth header:', req.headers.authorization ? 'PRÉSENT' : 'ABSENT');
    console.log('📋 User:', req.user ? `${req.user.email} (${req.user.role})` : 'NON AUTHENTIFIÉ');
    
    // Forcer le Content-Type JSON
    res.setHeader('Content-Type', 'application/json');
    next();
});
// Routes d'authentification

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

// Récupérer les dossiers de l'utilisateur


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

// 5. ROUTE DE CRÉATION DE DONNÉES DE TEST
app.post('/api/admin/stats/create-test-data', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🧪 Création données de test...');
    
    // Vérifier si des données existent
    const existingCount = await pool.query('SELECT COUNT(*) FROM applications');
    if (parseInt(existingCount.rows[0].count) > 0) {
      return res.json({
        success: false,
        message: 'Des données existent déjà. Supprimez-les d\'abord si nécessaire.',
        existing_count: parseInt(existingCount.rows[0].count)
      });
    }
    
    // Créer un utilisateur de test si nécessaire
    let testUserId = 1;
    const userCheck = await pool.query('SELECT id FROM users LIMIT 1');
    if (userCheck.rows.length > 0) {
      testUserId = userCheck.rows[0].id;
    }
    
    // Données de test variées
    const testData = [
      {
        nom: 'IBRAHIM', prenom: 'Aissatou', genre: 'feminin',
        type_bac: 'BAC A', premier_choix: 'FRANCAIS', statut: 'approuve'
      },
      {
        nom: 'MOUSSA', prenom: 'Abdoul', genre: 'masculin', 
        type_bac: 'BAC C', premier_choix: 'INFORMATIQUE', statut: 'en-attente'
      },
      {
        nom: 'HALIMA', prenom: 'Zeinabou', genre: 'feminin',
        type_bac: 'BAC D', premier_choix: 'MEDECINE', statut: 'approuve'
      },
      {
        nom: 'AHMED', prenom: 'Ousmane', genre: 'masculin',
        type_bac: 'BAC G', premier_choix: 'GESTION', statut: 'rejete'
      },
      {
        nom: 'FATIMA', prenom: 'Mariama', genre: 'feminin',
        type_bac: 'BAC C', premier_choix: 'MATHEMATIQUES', statut: 'approuve'
      },
      {
        nom: 'HASSAN', prenom: 'Boureima', genre: 'masculin',
        type_bac: 'BAC D', premier_choix: 'CHIMIE', statut: 'en-attente'
      },
      {
        nom: 'AMINA', prenom: 'Khadija', genre: 'feminin',
        type_bac: 'BAC A', premier_choix: 'HISTOIRE', statut: 'approuve'
      },
      {
        nom: 'IBRAHIM', prenom: 'Mahamadou', genre: 'masculin',
        type_bac: 'BAC C', premier_choix: 'PHYSIQUE', statut: 'en-attente'
      }
    ];
    
    let createdCount = 0;
    
    for (const data of testData) {
      try {
        const numeroUnique = await generateUniqueSixDigitNumber('applications', 'numero_dossier');
        
        await pool.query(`
          INSERT INTO applications (
            user_id, numero_dossier, nom, prenom, date_naissance, lieu_naissance,
            nationalite, genre, adresse, telephone, email, type_bac, lieu_obtention,
            annee_obtention, mention, premier_choix, deuxieme_choix, troisieme_choix,
            documents, statut, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
        `, [
          testUserId,
          numeroUnique,
          data.nom,
          data.prenom,
          '2000-01-01', // date_naissance par défaut
          'Tahoua', // lieu_naissance par défaut
          'nigerienne', // nationalite par défaut
          data.genre,
          'Adresse test Tahoua', // adresse par défaut
          '+227123456789', // telephone par défaut
          `${data.prenom.toLowerCase()}.${data.nom.toLowerCase()}@test.com`, // email généré
          data.type_bac,
          'Tahoua', // lieu_obtention par défaut
          '2024-2025', // annee_obtention par défaut
          'Passable', // mention par défaut
          data.premier_choix,
          'ANGLAIS', // deuxieme_choix par défaut
          'HISTOIRE', // troisieme_choix par défaut
          '{}', // documents vide
          data.statut
        ]);
        
        createdCount++;
        
      } catch (insertError) {
        console.error(`Erreur insertion ${data.nom}:`, insertError);
      }
    }
    
    console.log(`✅ ${createdCount} dossiers de test créés`);
    
    res.json({
      success: true,
      message: `${createdCount} dossiers de test créés avec succès`,
      created_count: createdCount,
      total_attempted: testData.length
    });
    
  } catch (error) {
    console.error('❌ Erreur création données test:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création des données de test',
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
app.get('/api/inscription/recherche/nouveau/:numeroDossier', async (req, res) => {
    try {
        const { numeroDossier } = req.params;
        
        console.log('🔍 Recherche nouveau étudiant:', numeroDossier);
        
        // Vérifier si l'étudiant existe déjà dans la table etudiants
        let etudiantResult = await pool.query(
            'SELECT * FROM etudiants WHERE numero_dossier = $1',
            [numeroDossier]
        );
        
        if (etudiantResult.rows.length > 0) {
            const etudiant = etudiantResult.rows[0];
            
            if (!etudiant.autorise_inscription) {
                return res.status(403).json({
                    success: false,
                    error: 'Vous n\'êtes pas autorisé à vous inscrire'
                });
            }
            
            return res.json({
                success: true,
                etudiant: etudiant,
                type: 'existant'
            });
        }
        
        // Sinon, chercher dans les candidatures approuvées
        const candidatureResult = await pool.query(
            `SELECT * FROM applications 
             WHERE numero_dossier = $1 AND statut = 'approuve'`,
            [numeroDossier]
        );
        
        if (candidatureResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Aucun dossier approuvé trouvé avec ce numéro'
            });
        }
        
        const candidature = candidatureResult.rows[0];
        
        // Créer un nouvel étudiant à partir de la candidature
        const nouvelEtudiant = await pool.query(
            `INSERT INTO etudiants (
                numero_dossier, nom, prenom, date_naissance, lieu_naissance,
                nationalite, genre, adresse, telephone, email,
                type_bac, lieu_obtention, annee_obtention, mention, type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *`,
            [
                candidature.numero_dossier,
                candidature.nom,
                candidature.prenom,
                candidature.date_naissance,
                candidature.lieu_naissance,
                candidature.nationalite,
                candidature.genre,
                candidature.adresse,
                candidature.telephone,
                candidature.email,
                candidature.type_bac,
                candidature.lieu_obtention,
                candidature.annee_obtention,
                candidature.mention,
                'nouveau'
            ]
        );
        
        console.log('✅ Nouvel étudiant créé:', nouvelEtudiant.rows[0].id);
        
        res.json({
            success: true,
            etudiant: nouvelEtudiant.rows[0],
            type: 'nouveau'
        });
        
    } catch (error) {
        console.error('❌ Erreur recherche nouveau étudiant:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la recherche',
            details: error.message
        });
    }
});

// 2. Rechercher un ancien étudiant par matricule
app.get('/api/inscription/recherche/ancien/:matricule', async (req, res) => {
    try {
        const { matricule } = req.params;
        
        console.log('🔍 Recherche ancien étudiant:', matricule);
        
        const result = await pool.query(
            'SELECT * FROM etudiants WHERE matricule = $1',
            [matricule]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Aucun étudiant trouvé avec ce matricule'
            });
        }
        
        const etudiant = result.rows[0];
        
        if (!etudiant.autorise_inscription) {
            return res.status(403).json({
                success: false,
                error: 'Vous n\'êtes pas autorisé à vous inscrire'
            });
        }
        
        res.json({
            success: true,
            etudiant: etudiant
        });
        
    } catch (error) {
        console.error('❌ Erreur recherche ancien étudiant:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la recherche',
            details: error.message
        });
    }
});

// 3. Récupérer les filières actives pour inscription
app.get('/api/inscription/filieres-actives', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT f.*, fac.nom as faculte_nom, fac.libelle as faculte_libelle
            FROM filieres f
            JOIN facultes fac ON f.faculte_id = fac.id
            WHERE f.active = true AND fac.active = true
            ORDER BY fac.nom, f.nom
        `);
        
        res.json({
            success: true,
            filieres: result.rows
        });
        
    } catch (error) {
        console.error('❌ Erreur récupération filières:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération des filières'
        });
    }
});

// 4. Vérifier le statut des inscriptions
app.get('/api/inscription/statut', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM config_inscriptions 
            WHERE annee_universitaire = '2024-2025'
            ORDER BY id DESC LIMIT 1
        `);
        
        if (result.rows.length === 0) {
            return res.json({
                success: true,
                ouvert: false,
                message: 'Les inscriptions ne sont pas encore configurées'
            });
        }
        
        const config = result.rows[0];
        const maintenant = new Date();
        
        let ouvert = config.ouvert;
        
        // Vérifier les dates si définies
        if (config.date_ouverture && new Date(config.date_ouverture) > maintenant) {
            ouvert = false;
        }
        
        if (config.date_fermeture && new Date(config.date_fermeture) < maintenant) {
            ouvert = false;
        }
        
        res.json({
            success: true,
            ouvert: ouvert,
            config: config
        });
        
    } catch (error) {
        console.error('❌ Erreur vérification statut:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la vérification du statut'
        });
    }
});

// 5. Valider une inscription
app.post('/api/inscription/valider', async (req, res) => {
    try {
        const {
            etudiant_id,
            filiere_id,
            niveau,
            mode_paiement,
            telephone_paiement,
            montant
        } = req.body;
        
        console.log('📝 Validation inscription pour étudiant:', etudiant_id);
        
        // Vérifier que les inscriptions sont ouvertes
        const configResult = await pool.query(`
            SELECT * FROM config_inscriptions 
            WHERE annee_universitaire = '2024-2025' AND ouvert = true
            LIMIT 1
        `);
        
        if (configResult.rows.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'Les inscriptions sont actuellement fermées'
            });
        }
        
        // Vérifier que l'étudiant existe et est autorisé
        const etudiantResult = await pool.query(
            'SELECT * FROM etudiants WHERE id = $1 AND autorise_inscription = true',
            [etudiant_id]
        );
        
        if (etudiantResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Étudiant non trouvé ou non autorisé'
            });
        }
        
        const etudiant = etudiantResult.rows[0];
        
        // Générer une référence de paiement unique
        const referencePaiement = `INS${Date.now()}${Math.floor(Math.random() * 1000)}`;
        
        // Générer un matricule pour les nouveaux étudiants
        let matricule = etudiant.matricule;
        if (!matricule) {
            const annee = new Date().getFullYear();
            const count = await pool.query(
                'SELECT COUNT(*) FROM etudiants WHERE matricule IS NOT NULL'
            );
            const numero = parseInt(count.rows[0].count) + 1;
            matricule = `${annee}UDH${numero.toString().padStart(4, '0')}`;
            
            // Mettre à jour le matricule
            await pool.query(
                'UPDATE etudiants SET matricule = $1 WHERE id = $2',
                [matricule, etudiant_id]
            );
        }
        
        // Créer l'inscription
        const inscriptionResult = await pool.query(
            `INSERT INTO inscriptions (
                etudiant_id, filiere_id, niveau, annee_universitaire,
                mode_paiement, telephone_paiement, montant,
                reference_paiement, statut_paiement, statut
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [
                etudiant_id,
                filiere_id,
                niveau,
                '2024-2025',
                mode_paiement,
                telephone_paiement,
                montant,
                referencePaiement,
                'en-attente',
                'en-cours'
            ]
        );
        
        console.log('✅ Inscription créée:', inscriptionResult.rows[0].id);
        
        res.json({
            success: true,
            message: 'Inscription enregistrée avec succès',
            inscription: inscriptionResult.rows[0],
            matricule: matricule,
            reference_paiement: referencePaiement
        });
        
    } catch (error) {
        console.error('❌ Erreur validation inscription:', error);
        
        if (error.code === '23505') { // Contrainte unique
            return res.status(400).json({
                success: false,
                error: 'Vous êtes déjà inscrit pour cette filière et ce niveau'
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la validation de l\'inscription',
            details: error.message
        });
    }
});

// =================== ROUTES ADMIN POUR LES INSCRIPTIONS ===================

// 6. Ouvrir/Fermer les inscriptions
app.post('/api/admin/inscription/toggle', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            ouvert,
            filiere_id,
            niveau,
            date_ouverture,
            date_fermeture
        } = req.body;
        
        console.log('🔧 Configuration inscriptions:', { ouvert, filiere_id, niveau });
        
        // Vérifier si une config existe déjà
        const existingConfig = await pool.query(`
            SELECT * FROM config_inscriptions 
            WHERE annee_universitaire = '2024-2025'
            ORDER BY id DESC LIMIT 1
        `);
        
        let result;
        
        if (existingConfig.rows.length > 0) {
            // Mettre à jour
            result = await pool.query(
                `UPDATE config_inscriptions 
                 SET ouvert = $1, filiere_id = $2, niveau = $3,
                     date_ouverture = $4, date_fermeture = $5, updated_at = NOW()
                 WHERE id = $6
                 RETURNING *`,
                [ouvert, filiere_id, niveau, date_ouverture, date_fermeture, existingConfig.rows[0].id]
            );
        } else {
            // Créer
            result = await pool.query(
                `INSERT INTO config_inscriptions (
                    annee_universitaire, ouvert, filiere_id, niveau,
                    date_ouverture, date_fermeture
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`,
                ['2024-2025', ouvert, filiere_id, niveau, date_ouverture, date_fermeture]
            );
        }
        
        res.json({
            success: true,
            message: `Inscriptions ${ouvert ? 'ouvertes' : 'fermées'}`,
            config: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Erreur toggle inscriptions:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la configuration',
            details: error.message
        });
    }
});

// 7. Importer les étudiants autorisés (CSV/Excel)
app.post('/api/admin/inscription/import-autorises', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Aucun fichier fourni'
            });
        }
        
        console.log('📁 Import fichier:', req.file.originalname);
        
        const filePath = req.file.path;
        const ext = path.extname(req.file.originalname).toLowerCase();
        
        let data = [];
        
        if (ext === '.csv') {
            // Lire CSV
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const lines = fileContent.split('\n').filter(line => line.trim());
            const headers = lines[0].split(',').map(h => h.trim());
            
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index];
                });
                data.push(row);
            }
        } else if (ext === '.xlsx') {
            // Lire Excel
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            
            const worksheet = workbook.getWorksheet(1);
            const headers = [];
            
            worksheet.getRow(1).eachCell((cell) => {
                headers.push(cell.value);
            });
            
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    const rowData = {};
                    row.eachCell((cell, colNumber) => {
                        rowData[headers[colNumber - 1]] = cell.value;
                    });
                    data.push(rowData);
                }
            });
        } else {
            return res.status(400).json({
                success: false,
                error: 'Format de fichier non supporté. Utilisez CSV ou XLSX'
            });
        }
        
        console.log(`📊 ${data.length} lignes à importer`);
        
        let imported = 0;
        let errors = [];
        
        for (const row of data) {
            try {
                // Chercher par matricule ou numero_dossier
                const identifier = row.matricule || row.numero_dossier;
                
                if (!identifier) {
                    errors.push(`Ligne sans identifiant: ${JSON.stringify(row)}`);
                    continue;
                }
                
                const result = await pool.query(
                    `UPDATE etudiants 
                     SET autorise_inscription = true
                     WHERE matricule = $1 OR numero_dossier = $1`,
                    [identifier]
                );
                
                if (result.rowCount > 0) {
                    imported++;
                } else {
                    errors.push(`Étudiant non trouvé: ${identifier}`);
                }
            } catch (error) {
                errors.push(`Erreur pour ${row.matricule || row.numero_dossier}: ${error.message}`);
            }
        }
        
        // Supprimer le fichier temporaire
        fs.unlinkSync(filePath);
        
        res.json({
            success: true,
            message: `${imported} étudiant(s) autorisé(s)`,
            imported: imported,
            errors: errors.length > 0 ? errors : undefined
        });
        
    } catch (error) {
        console.error('❌ Erreur import:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'import',
            details: error.message
        });
    }
});

// 8. Exporter les inscriptions
app.get('/api/admin/inscription/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { statut, filiere_id, niveau } = req.query;
        
        console.log('📊 Export inscriptions:', { statut, filiere_id, niveau });
        
        let query = `
            SELECT 
                i.id,
                i.reference_paiement,
                e.matricule,
                e.numero_dossier,
                e.nom,
                e.prenom,
                e.date_naissance,
                e.email,
                e.telephone,
                e.genre,
                i.niveau,
                f.nom as filiere,
                f.libelle as filiere_libelle,
                fac.nom as faculte,
                i.montant,
                i.mode_paiement,
                i.telephone_paiement,
                i.statut_paiement,
                i.statut as statut_inscription,
                TO_CHAR(i.created_at, 'DD/MM/YYYY HH24:MI') as date_inscription
            FROM inscriptions i
            JOIN etudiants e ON i.etudiant_id = e.id
            JOIN filieres f ON i.filiere_id = f.id
            JOIN facultes fac ON f.faculte_id = fac.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (statut) {
            params.push(statut);
            query += ` AND i.statut = $${params.length}`;
        }
        
        if (filiere_id) {
            params.push(filiere_id);
            query += ` AND i.filiere_id = $${params.length}`;
        }
        
        if (niveau) {
            params.push(niveau);
            query += ` AND i.niveau = $${params.length}`;
        }
        
        query += ' ORDER BY i.created_at DESC';
        
        const result = await pool.query(query, params);
        
        // Créer Excel
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Inscriptions');
        
        worksheet.columns = [
            { header: 'RÉFÉRENCE', key: 'reference_paiement', width: 20 },
            { header: 'MATRICULE', key: 'matricule', width: 15 },
            { header: 'N° DOSSIER', key: 'numero_dossier', width: 15 },
            { header: 'NOM', key: 'nom', width: 20 },
            { header: 'PRÉNOM', key: 'prenom', width: 20 },
            { header: 'DATE NAISSANCE', key: 'date_naissance', width: 15 },
            { header: 'EMAIL', key: 'email', width: 25 },
            { header: 'TÉLÉPHONE', key: 'telephone', width: 15 },
            { header: 'GENRE', key: 'genre', width: 12 },
            { header: 'NIVEAU', key: 'niveau', width: 10 },
            { header: 'FILIÈRE', key: 'filiere', width: 20 },
            { header: 'FILIÈRE LIBELLÉ', key: 'filiere_libelle', width: 30 },
            { header: 'FACULTÉ', key: 'faculte', width: 15 },
            { header: 'MONTANT', key: 'montant', width: 12 },
            { header: 'MODE PAIEMENT', key: 'mode_paiement', width: 15 },
            { header: 'TÉL. PAIEMENT', key: 'telephone_paiement', width: 15 },
            { header: 'STATUT PAIEMENT', key: 'statut_paiement', width: 15 },
            { header: 'STATUT INSCRIPTION', key: 'statut_inscription', width: 18 },
            { header: 'DATE INSCRIPTION', key: 'date_inscription', width: 18 }
        ];
        
        // Style en-tête
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '667eea' }
        };
        
        // Ajouter les données
        result.rows.forEach(row => {
            worksheet.addRow(row);
        });
        
        const filename = `Inscriptions_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
        
        console.log(`✅ Export de ${result.rows.length} inscriptions`);
        
    } catch (error) {
        console.error('❌ Erreur export inscriptions:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'export',
            details: error.message
        });
    }
});

// =================== GESTION DES AUTORISATIONS D'INSCRIPTION ===================

// Récupérer tous les étudiants autorisés avec filtres
app.get('/api/admin/etudiants/autorises', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { type, filiere_id, niveau, search } = req.query;
        
        let query = `
            SELECT 
                e.id,
                e.matricule,
                e.numero_dossier,
                e.nom,
                e.prenom,
                e.email,
                e.telephone,
                e.type,
                e.niveau,
                e.autorise_inscription,
                f.nom as filiere_nom,
                f.libelle as filiere_libelle,
                fac.nom as faculte_nom,
                ae.autorise as autorise_annee,
                ae.raison_blocage,
                TO_CHAR(e.created_at, 'DD/MM/YYYY') as date_inscription
            FROM etudiants e
            LEFT JOIN filieres f ON e.filiere_id = f.id
            LEFT JOIN facultes fac ON f.faculte_id = fac.id
            LEFT JOIN autorisations_etudiants ae ON e.id = ae.etudiant_id 
                AND ae.annee_universitaire = '2024-2025'
            WHERE 1=1
        `;
        
        const params = [];
        
        if (type) {
            params.push(type);
            query += ` AND e.type = $${params.length}`;
        }
        
        if (filiere_id) {
            params.push(filiere_id);
            query += ` AND e.filiere_id = $${params.length}`;
        }
        
        if (niveau) {
            params.push(niveau);
            query += ` AND e.niveau = $${params.length}`;
        }
        
        if (search) {
            params.push(`%${search}%`);
            query += ` AND (
                e.nom ILIKE $${params.length} OR 
                e.prenom ILIKE $${params.length} OR 
                e.matricule ILIKE $${params.length} OR 
                e.numero_dossier ILIKE $${params.length}
            )`;
        }
        
        query += ' ORDER BY e.nom, e.prenom';
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            etudiants: result.rows,
            total: result.rows.length
        });
        
    } catch (error) {
        console.error('❌ Erreur récupération étudiants:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération des étudiants'
        });
    }
});

// Modifier l'autorisation globale d'un étudiant
app.post('/api/admin/etudiants/:id/toggle-autorisation', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { autorise } = req.body;
        
        await pool.query(
            'UPDATE etudiants SET autorise_inscription = $1, updated_at = NOW() WHERE id = $2',
            [autorise, id]
        );
        
        res.json({
            success: true,
            message: `Étudiant ${autorise ? 'autorisé' : 'bloqué'} avec succès`
        });
        
    } catch (error) {
        console.error('❌ Erreur toggle autorisation:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la modification'
        });
    }
});

// Bloquer/Débloquer un étudiant pour l'année en cours
app.post('/api/admin/etudiants/:id/toggle-autorisation-annee', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { autorise, raison_blocage } = req.body;
        
        const result = await pool.query(
            `INSERT INTO autorisations_etudiants (
                etudiant_id, annee_universitaire, autorise, raison_blocage, bloque_par, date_blocage
            ) VALUES ($1, '2024-2025', $2, $3, $4, NOW())
            ON CONFLICT (etudiant_id, annee_universitaire) 
            DO UPDATE SET 
                autorise = $2, 
                raison_blocage = $3, 
                bloque_par = $4, 
                date_blocage = NOW()
            RETURNING *`,
            [id, autorise, raison_blocage || null, req.user.id]
        );
        
        res.json({
            success: true,
            message: `Étudiant ${autorise ? 'autorisé' : 'bloqué'} pour l'année 2024-2025`,
            autorisation: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Erreur toggle autorisation année:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la modification'
        });
    }
});

// Configurer les autorisations par type/filière/niveau
app.post('/api/admin/inscription/config-autorisations', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            type_autorisation, // 'tous', 'nouveaux', 'anciens', 'filiere', 'niveau'
            filieres_autorisees,
            niveaux_autorises
        } = req.body;
        
        console.log('🔧 Configuration autorisations:', { type_autorisation, filieres_autorisees, niveaux_autorises });
        
        // Mettre à jour la config
        const result = await pool.query(
            `INSERT INTO config_inscriptions (
                annee_universitaire, ouvert, type_autorisation, 
                filieres_autorisees, niveaux_autorises
            ) VALUES ('2024-2025', true, $1, $2, $3)
            ON CONFLICT (annee_universitaire) 
            DO UPDATE SET 
                type_autorisation = $1,
                filieres_autorisees = $2,
                niveaux_autorises = $3,
                updated_at = NOW()
            RETURNING *`,
            [
                type_autorisation,
                filieres_autorisees || null,
                niveaux_autorises || null
            ]
        );
        
        res.json({
            success: true,
            message: 'Configuration des autorisations mise à jour',
            config: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Erreur config autorisations:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la configuration'
        });
    }
});

// Autorisation massive par filière
app.post('/api/admin/inscription/autoriser-filiere', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { filiere_id, niveaux, autorise } = req.body;
        
        let query = `
            UPDATE etudiants 
            SET autorise_inscription = $1, updated_at = NOW()
            WHERE filiere_id = $2
        `;
        
        const params = [autorise, filiere_id];
        
        if (niveaux && niveaux.length > 0) {
            query += ` AND niveau = ANY($3)`;
            params.push(niveaux);
        }
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            message: `${result.rowCount} étudiant(s) ${autorise ? 'autorisé(s)' : 'bloqué(s)'}`,
            count: result.rowCount
        });
        
    } catch (error) {
        console.error('❌ Erreur autorisation filière:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'autorisation'
        });
    }
});

// Autorisation massive par niveau
app.post('/api/admin/inscription/autoriser-niveau', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { niveau, autorise } = req.body;
        
        const result = await pool.query(
            `UPDATE etudiants 
             SET autorise_inscription = $1, updated_at = NOW()
             WHERE niveau = $2`,
            [autorise, niveau]
        );
        
        res.json({
            success: true,
            message: `${result.rowCount} étudiant(s) de niveau ${niveau} ${autorise ? 'autorisé(s)' : 'bloqué(s)'}`,
            count: result.rowCount
        });
        
    } catch (error) {
        console.error('❌ Erreur autorisation niveau:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'autorisation'
        });
    }
});

// Autorisation massive par type (nouveau/ancien)
app.post('/api/admin/inscription/autoriser-type', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { type, autorise } = req.body;
        
        const result = await pool.query(
            `UPDATE etudiants 
             SET autorise_inscription = $1, updated_at = NOW()
             WHERE type = $2`,
            [autorise, type]
        );
        
        res.json({
            success: true,
            message: `${result.rowCount} étudiant(s) ${type}s ${autorise ? 'autorisé(s)' : 'bloqué(s)'}`,
            count: result.rowCount
        });
        
    } catch (error) {
        console.error('❌ Erreur autorisation type:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'autorisation'
        });
    }
});

// Vérifier si un étudiant est autorisé à s'inscrire
app.get('/api/inscription/verifier-autorisation/:etudiant_id', async (req, res) => {
    try {
        const { etudiant_id } = req.params;
        
        // Récupérer l'étudiant
        const etudiantResult = await pool.query(
            'SELECT * FROM etudiants WHERE id = $1',
            [etudiant_id]
        );
        
        if (etudiantResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Étudiant non trouvé'
            });
        }
        
        const etudiant = etudiantResult.rows[0];
        
        // Vérifier autorisation globale
        if (!etudiant.autorise_inscription) {
            return res.json({
                success: false,
                autorise: false,
                raison: 'Votre compte est bloqué pour les inscriptions'
            });
        }
        
        // Vérifier autorisation pour l'année
        const autorisationAnneeResult = await pool.query(
            `SELECT * FROM autorisations_etudiants 
             WHERE etudiant_id = $1 AND annee_universitaire = '2024-2025'`,
            [etudiant_id]
        );
        
        if (autorisationAnneeResult.rows.length > 0) {
            const autoAnnee = autorisationAnneeResult.rows[0];
            if (!autoAnnee.autorise) {
                return res.json({
                    success: false,
                    autorise: false,
                    raison: autoAnnee.raison_blocage || 'Vous n\'êtes pas autorisé à vous inscrire cette année'
                });
            }
        }
        
        // Vérifier la configuration globale
        const configResult = await pool.query(
            `SELECT * FROM config_inscriptions 
             WHERE annee_universitaire = '2024-2025' AND ouvert = true
             LIMIT 1`
        );
        
        if (configResult.rows.length === 0) {
            return res.json({
                success: false,
                autorise: false,
                raison: 'Les inscriptions sont fermées'
            });
        }
        
        const config = configResult.rows[0];
        
        // Vérifier selon le type d'autorisation
        switch (config.type_autorisation) {
            case 'nouveaux':
                if (etudiant.type !== 'nouveau') {
                    return res.json({
                        success: false,
                        autorise: false,
                        raison: 'Seuls les nouveaux étudiants peuvent s\'inscrire actuellement'
                    });
                }
                break;
                
            case 'anciens':
                if (etudiant.type !== 'ancien') {
                    return res.json({
                        success: false,
                        autorise: false,
                        raison: 'Seuls les anciens étudiants peuvent s\'inscrire actuellement'
                    });
                }
                break;
                
            case 'filiere':
                if (config.filieres_autorisees && !config.filieres_autorisees.includes(etudiant.filiere_id)) {
                    return res.json({
                        success: false,
                        autorise: false,
                        raison: 'Votre filière n\'est pas autorisée à s\'inscrire actuellement'
                    });
                }
                break;
                
            case 'niveau':
                if (config.niveaux_autorises && !config.niveaux_autorises.includes(etudiant.niveau)) {
                    return res.json({
                        success: false,
                        autorise: false,
                        raison: 'Votre niveau n\'est pas autorisé à s\'inscrire actuellement'
                    });
                }
                break;
        }
        
        res.json({
            success: true,
            autorise: true,
            etudiant: etudiant
        });
        
    } catch (error) {
        console.error('❌ Erreur vérification autorisation:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la vérification'
        });
    }
});
// =================== EXPORT DES INSCRIPTIONS ===================

// Exporter tous les étudiants inscrits
app.get('/api/admin/inscription/export-inscrits', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { annee_universitaire, statut, filiere_id, niveau } = req.query;
        
        console.log('📊 Export étudiants inscrits');
        
        let query = `
            SELECT 
                i.id as inscription_id,
                i.reference_paiement,
                e.matricule,
                e.numero_dossier,
                e.nom,
                e.prenom,
                e.date_naissance,
                e.lieu_naissance,
                e.email,
                e.telephone,
                e.genre,
                e.nationalite,
                e.type as type_etudiant,
                i.niveau,
                f.nom as filiere_code,
                f.libelle as filiere_libelle,
                fac.nom as faculte_code,
                fac.libelle as faculte_libelle,
                i.annee_universitaire,
                i.montant,
                i.mode_paiement,
                i.telephone_paiement,
                i.statut_paiement,
                i.statut as statut_inscription,
                TO_CHAR(i.created_at, 'DD/MM/YYYY HH24:MI') as date_inscription,
                TO_CHAR(i.date_validation, 'DD/MM/YYYY HH24:MI') as date_validation,
                u.nom as valide_par
            FROM inscriptions i
            JOIN etudiants e ON i.etudiant_id = e.id
            JOIN filieres f ON i.filiere_id = f.id
            JOIN facultes fac ON f.faculte_id = fac.id
            LEFT JOIN users u ON i.valide_par = u.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (annee_universitaire) {
            params.push(annee_universitaire);
            query += ` AND i.annee_universitaire = $${params.length}`;
        } else {
            query += ` AND i.annee_universitaire = '2024-2025'`;
        }
        
        if (statut) {
            params.push(statut);
            query += ` AND i.statut = $${params.length}`;
        }
        
        if (filiere_id) {
            params.push(filiere_id);
            query += ` AND i.filiere_id = $${params.length}`;
        }
        
        if (niveau) {
            params.push(niveau);
            query += ` AND i.niveau = $${params.length}`;
        }
        
        query += ' ORDER BY fac.nom, f.nom, e.nom, e.prenom';
        
        const result = await pool.query(query, params);
        
        console.log(`✅ ${result.rows.length} inscriptions trouvées`);
        
        // Créer le fichier Excel
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        
        // Onglet 1: Liste complète
        const worksheet = workbook.addWorksheet('Inscriptions');
        
        worksheet.columns = [
            { header: 'ID INSCRIPTION', key: 'inscription_id', width: 12 },
            { header: 'RÉFÉRENCE', key: 'reference_paiement', width: 20 },
            { header: 'MATRICULE', key: 'matricule', width: 15 },
            { header: 'N° DOSSIER', key: 'numero_dossier', width: 15 },
            { header: 'NOM', key: 'nom', width: 20 },
            { header: 'PRÉNOM', key: 'prenom', width: 20 },
            { header: 'DATE NAISSANCE', key: 'date_naissance', width: 15 },
            { header: 'LIEU NAISSANCE', key: 'lieu_naissance', width: 20 },
            { header: 'EMAIL', key: 'email', width: 30 },
            { header: 'TÉLÉPHONE', key: 'telephone', width: 15 },
            { header: 'GENRE', key: 'genre', width: 12 },
            { header: 'NATIONALITÉ', key: 'nationalite', width: 15 },
            { header: 'TYPE', key: 'type_etudiant', width: 12 },
            { header: 'NIVEAU', key: 'niveau', width: 10 },
            { header: 'CODE FILIÈRE', key: 'filiere_code', width: 15 },
            { header: 'FILIÈRE', key: 'filiere_libelle', width: 35 },
            { header: 'CODE FACULTÉ', key: 'faculte_code', width: 12 },
            { header: 'FACULTÉ', key: 'faculte_libelle', width: 40 },
            { header: 'ANNÉE UNIV.', key: 'annee_universitaire', width: 12 },
            { header: 'MONTANT', key: 'montant', width: 12 },
            { header: 'MODE PAIEMENT', key: 'mode_paiement', width: 15 },
            { header: 'TÉL. PAIEMENT', key: 'telephone_paiement', width: 15 },
            { header: 'STATUT PAIEMENT', key: 'statut_paiement', width: 18 },
            { header: 'STATUT INSCRIPTION', key: 'statut_inscription', width: 18 },
            { header: 'DATE INSCRIPTION', key: 'date_inscription', width: 18 },
            { header: 'DATE VALIDATION', key: 'date_validation', width: 18 },
            { header: 'VALIDÉ PAR', key: 'valide_par', width: 25 }
        ];
        
        // Style en-tête
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '667eea' }
        };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        
        // Ajouter les données
        result.rows.forEach(row => {
            worksheet.addRow(row);
        });
        
        // Onglet 2: Statistiques par filière
        const statsSheet = workbook.addWorksheet('Statistiques par Filière');
        
        const statsQuery = await pool.query(`
            SELECT 
                fac.libelle as faculte,
                f.libelle as filiere,
                i.niveau,
                COUNT(*) as total_inscrits,
                SUM(CASE WHEN i.statut = 'validée' THEN 1 ELSE 0 END) as valides,
                SUM(CASE WHEN e.genre = 'masculin' THEN 1 ELSE 0 END) as hommes,
                SUM(CASE WHEN e.genre = 'feminin' THEN 1 ELSE 0 END) as femmes
            FROM inscriptions i
            JOIN etudiants e ON i.etudiant_id = e.id
            JOIN filieres f ON i.filiere_id = f.id
            JOIN facultes fac ON f.faculte_id = fac.id
            WHERE i.annee_universitaire = '2024-2025'
            GROUP BY fac.libelle, f.libelle, i.niveau
            ORDER BY fac.libelle, f.libelle, i.niveau
        `);
        
        statsSheet.columns = [
            { header: 'FACULTÉ', key: 'faculte', width: 40 },
            { header: 'FILIÈRE', key: 'filiere', width: 35 },
            { header: 'NIVEAU', key: 'niveau', width: 10 },
            { header: 'TOTAL INSCRITS', key: 'total_inscrits', width: 15 },
            { header: 'VALIDÉS', key: 'valides', width: 12 },
            { header: 'HOMMES', key: 'hommes', width: 12 },
            { header: 'FEMMES', key: 'femmes', width: 12 }
        ];
        
        statsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        statsSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '28a745' }
        };
        
        statsQuery.rows.forEach(row => {
            statsSheet.addRow(row);
        });
        
        // Générer le fichier
        const filename = `Inscriptions_${annee_universitaire || '2024-2025'}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
        
        console.log(`✅ Export généré: ${filename}`);
        
    } catch (error) {
        console.error('❌ Erreur export inscriptions:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'export',
            details: error.message
        });
    }
});

// =================== MODÈLE D'IMPORT ===================

// Télécharger le modèle d'import pour les étudiants autorisés
app.get('/api/admin/inscription/modele-import', authenticateToken, requireAdmin, async (req, res) => {
    try {
        console.log('📥 Génération modèle d\'import');
        
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        
        // Onglet 1: Instructions
        const instructionsSheet = workbook.addWorksheet('Instructions');
        
        instructionsSheet.mergeCells('A1:D1');
        instructionsSheet.getCell('A1').value = 'MODÈLE D\'IMPORT - ÉTUDIANTS AUTORISÉS';
        instructionsSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: '667eea' } };
        instructionsSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        
        instructionsSheet.getRow(3).values = ['INSTRUCTIONS D\'UTILISATION'];
        instructionsSheet.getRow(3).font = { bold: true, size: 14 };
        
        const instructions = [
            '',
            '1. Remplissez l\'onglet "Etudiants" avec les données des étudiants à autoriser',
            '',
            '2. COLONNES OBLIGATOIRES:',
            '   - Soit MATRICULE (pour anciens étudiants)',
            '   - Soit NUMERO_DOSSIER (pour nouveaux étudiants)',
            '',
            '3. COLONNES OPTIONNELLES:',
            '   - NIVEAU: L1, L2, L3, M1, M2',
            '   - FILIERE_CODE: Code de la filière (ex: INFORMATIQUE)',
            '   - AUTORISE: OUI ou NON (par défaut: OUI)',
            '',
            '4. FORMAT:',
            '   - Une ligne par étudiant',
            '   - Ne pas modifier les en-têtes',
            '   - Pas de lignes vides entre les données',
            '',
            '5. EXEMPLES:',
            '   Ligne 1: 2023UDH0001 | | L2 | INFORMATIQUE | OUI',
            '   Ligne 2: | UDH123456 | L1 | MATHEMATIQUES | OUI',
            '',
            '6. Après remplissage, enregistrez et importez le fichier dans l\'interface admin'
        ];
        
        instructions.forEach((instruction, index) => {
            instructionsSheet.getCell(`A${index + 4}`).value = instruction;
        });
        
        instructionsSheet.getColumn('A').width = 80;
        
        // Onglet 2: Modèle à remplir
        const modelSheet = workbook.addWorksheet('Etudiants');
        
        modelSheet.columns = [
            { header: 'MATRICULE', key: 'matricule', width: 20 },
            { header: 'NUMERO_DOSSIER', key: 'numero_dossier', width: 20 },
            { header: 'NIVEAU', key: 'niveau', width: 12 },
            { header: 'FILIERE_CODE', key: 'filiere_code', width: 20 },
            { header: 'AUTORISE', key: 'autorise', width: 12 }
        ];
        
        // Style en-tête
        modelSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        modelSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '667eea' }
        };
        modelSheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
        
        // Exemples
        modelSheet.addRow({
            matricule: '2023UDH0001',
            numero_dossier: '',
            niveau: 'L2',
            filiere_code: 'INFORMATIQUE',
            autorise: 'OUI'
        });
        
        modelSheet.addRow({
            matricule: '',
            numero_dossier: 'UDH123456',
            niveau: 'L1',
            filiere_code: 'MATHEMATIQUES',
            autorise: 'OUI'
        });
        
        // Style des exemples (gris clair)
        [2, 3].forEach(rowNum => {
            modelSheet.getRow(rowNum).eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F8F9FA' }
                };
                cell.font = { italic: true, color: { argb: '666666' } };
            });
        });
        
        // Onglet 3: Liste des filières
        const filieresSheet = workbook.addWorksheet('Liste Filières');
        
        const filieresResult = await pool.query(`
            SELECT f.nom as code, f.libelle, fac.nom as faculte
            FROM filieres f
            JOIN facultes fac ON f.faculte_id = fac.id
            WHERE f.active = true
            ORDER BY fac.nom, f.nom
        `);
        
        filieresSheet.columns = [
            { header: 'CODE FILIÈRE', key: 'code', width: 20 },
            { header: 'LIBELLÉ', key: 'libelle', width: 40 },
            { header: 'FACULTÉ', key: 'faculte', width: 15 }
        ];
        
        filieresSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        filieresSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '28a745' }
        };
        
        filieresResult.rows.forEach(row => {
            filieresSheet.addRow(row);
        });
        
        // Générer le fichier
        const filename = 'Modele_Import_Etudiants_Autorises.xlsx';
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
        
        console.log('✅ Modèle généré');
        
    } catch (error) {
        console.error('❌ Erreur génération modèle:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la génération du modèle'
        });
    }
});

// =================== IMPORT DES ÉTUDIANTS AUTORISÉS ===================

app.post('/api/admin/inscription/import-autorises-excel', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Aucun fichier fourni'
            });
        }
        
        console.log('📥 Import fichier:', req.file.originalname);
        
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(req.file.path);
        
        const worksheet = workbook.getWorksheet('Etudiants');
        
        if (!worksheet) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'Onglet "Etudiants" non trouvé dans le fichier'
            });
        }
        
        const data = [];
        const headers = [];
        
        // Lire les en-têtes
        worksheet.getRow(1).eachCell((cell, colNumber) => {
            headers[colNumber] = cell.value;
        });
        
        // Lire les données
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) { // Ignorer l'en-tête
                const rowData = {};
                row.eachCell((cell, colNumber) => {
                    const header = headers[colNumber];
                    rowData[header] = cell.value;
                });
                
                // Ignorer les lignes vides
                if (rowData.MATRICULE || rowData.NUMERO_DOSSIER) {
                    data.push(rowData);
                }
            }
        });
        
        console.log(`📊 ${data.length} lignes à traiter`);
        
        let imported = 0;
        let updated = 0;
        let errors = [];
        
        for (const row of data) {
            try {
                const matricule = row.MATRICULE ? String(row.MATRICULE).trim() : null;
                const numeroDossier = row.NUMERO_DOSSIER ? String(row.NUMERO_DOSSIER).trim() : null;
                const niveau = row.NIVEAU ? String(row.NIVEAU).trim().toUpperCase() : null;
                const filiereCode = row.FILIERE_CODE ? String(row.FILIERE_CODE).trim().toUpperCase() : null;
                const autorise = !row.AUTORISE || String(row.AUTORISE).trim().toUpperCase() === 'OUI';
                
                if (!matricule && !numeroDossier) {
                    errors.push(`Ligne sans matricule ni numéro de dossier`);
                    continue;
                }
                
                // Trouver l'étudiant
                let query = 'SELECT id, matricule, numero_dossier FROM etudiants WHERE ';
                const params = [];
                
                if (matricule) {
                    params.push(matricule);
                    query += `matricule = $1`;
                } else {
                    params.push(numeroDossier);
                    query += `numero_dossier = $1`;
                }
                
                const result = await pool.query(query, params);
                
                if (result.rows.length === 0) {
                    errors.push(`Étudiant non trouvé: ${matricule || numeroDossier}`);
                    continue;
                }
                
                const etudiant = result.rows[0];
                
                // Mettre à jour l'étudiant
                const updateFields = ['autorise_inscription = $2'];
                const updateParams = [etudiant.id, autorise];
                let paramIndex = 3;
                
                if (niveau) {
                    updateFields.push(`niveau = $${paramIndex}`);
                    updateParams.push(niveau);
                    paramIndex++;
                }
                
                if (filiereCode) {
                    // Trouver l'ID de la filière
                    const filiereResult = await pool.query(
                        'SELECT id FROM filieres WHERE nom = $1',
                        [filiereCode]
                    );
                    
                    if (filiereResult.rows.length > 0) {
                        updateFields.push(`filiere_id = $${paramIndex}`);
                        updateParams.push(filiereResult.rows[0].id);
                        paramIndex++;
                    } else {
                        errors.push(`Filière inconnue: ${filiereCode} pour ${matricule || numeroDossier}`);
                    }
                }
                
                const updateQuery = `
                    UPDATE etudiants 
                    SET ${updateFields.join(', ')}, updated_at = NOW()
                    WHERE id = $1
                `;
                
                await pool.query(updateQuery, updateParams);
                
                if (autorise) {
                    imported++;
                } else {
                    updated++;
                }
                
            } catch (error) {
                errors.push(`Erreur pour ${row.MATRICULE || row.NUMERO_DOSSIER}: ${error.message}`);
            }
        }
        
        // Supprimer le fichier temporaire
        fs.unlinkSync(req.file.path);
        
        res.json({
            success: true,
            message: `Import terminé: ${imported} autorisé(s), ${updated} bloqué(s)`,
            imported: imported,
            updated: updated,
            errors: errors.length > 0 ? errors : undefined,
            total_processed: data.length
        });
        
        console.log(`✅ Import terminé: ${imported} autorisés, ${updated} bloqués, ${errors.length} erreurs`);
        
    } catch (error) {
        console.error('❌ Erreur import:', error);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'import',
            details: error.message
        });
    }
});

// =================== IMPORT D'ÉTUDIANTS DANS LA TABLE ETUDIANTS ===================

// Télécharger le modèle d'import pour les étudiants
app.get('/api/admin/etudiants/modele-import', authenticateToken, requireAdmin, async (req, res) => {
    try {
        console.log('Génération modèle import étudiants');
        
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        
        // Onglet 1: Instructions
        const instructionsSheet = workbook.addWorksheet('Instructions');
        
        instructionsSheet.mergeCells('A1:F1');
        instructionsSheet.getCell('A1').value = 'MODÈLE D\'IMPORT - ÉTUDIANTS';
        instructionsSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: '667eea' } };
        instructionsSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        instructionsSheet.getRow(1).height = 30;
        
        instructionsSheet.getRow(3).values = ['INSTRUCTIONS D\'UTILISATION'];
        instructionsSheet.getRow(3).font = { bold: true, size: 14, color: { argb: '667eea' } };
        
        const instructions = [
            '',
            '1. REMPLISSEZ L\'ONGLET "Etudiants" AVEC LES DONNÉES',
            '',
            '2. COLONNES OBLIGATOIRES (marquées *):',
            '   - NOM* : Nom de famille',
            '   - PRENOM* : Prénom(s)',
            '   - DATE_NAISSANCE* : Format JJ/MM/AAAA (ex: 15/03/2000)',
            '   - LIEU_NAISSANCE* : Ville de naissance',
            '   - EMAIL* : Adresse email unique',
            '   - TELEPHONE* : Numéro de téléphone unique',
            '   - GENRE* : masculin ou feminin',
            '   - NATIONALITE* : Ex: nigerienne',
            '   - ADRESSE* : Adresse complète',
            '',
            '3. COLONNES OPTIONNELLES:',
            '   - MATRICULE : Matricule existant (si ancien étudiant)',
            '   - NUMERO_DOSSIER : Numéro de dossier de candidature',
            '   - TYPE : nouveau ou ancien (défaut: nouveau)',
            '   - NIVEAU : L1, L2, L3, M1, M2',
            '   - FILIERE_CODE : Code de la filière (voir onglet "Liste Filières")',
            '   - TYPE_BAC : BAC A, BAC C, BAC D, BAC G',
            '   - LIEU_OBTENTION : Ville d\'obtention du bac',
            '   - ANNEE_OBTENTION : Ex: 2024-2025',
            '   - MENTION : Passable, Bien, Tres Bien',
            '   - AUTORISE : OUI ou NON (défaut: OUI)',
            '',
            '4. RÈGLES IMPORTANTES:',
            '   - Email et téléphone doivent être uniques',
            '   - Les dates au format JJ/MM/AAAA',
            '   - Respecter exactement les valeurs pour GENRE, TYPE, NIVEAU',
            '   - Vérifier les codes de filière dans l\'onglet "Liste Filières"',
            '',
            '5. APRÈS REMPLISSAGE:',
            '   - Enregistrez le fichier',
            '   - Importez-le dans l\'interface d\'administration',
            '   - Consultez le rapport d\'import pour voir les erreurs éventuelles'
        ];
        
        instructions.forEach((instruction, index) => {
            instructionsSheet.getCell(`A${index + 4}`).value = instruction;
            if (instruction.startsWith('   ')) {
                instructionsSheet.getCell(`A${index + 4}`).font = { size: 11 };
            }
        });
        
        instructionsSheet.getColumn('A').width = 90;
        
        // Onglet 2: Modèle à remplir
        const modelSheet = workbook.addWorksheet('Etudiants');
        
        modelSheet.columns = [
            { header: 'MATRICULE', key: 'matricule', width: 15 },
            { header: 'NUMERO_DOSSIER', key: 'numero_dossier', width: 15 },
            { header: 'NOM*', key: 'nom', width: 20 },
            { header: 'PRENOM*', key: 'prenom', width: 20 },
            { header: 'DATE_NAISSANCE*', key: 'date_naissance', width: 15 },
            { header: 'LIEU_NAISSANCE*', key: 'lieu_naissance', width: 20 },
            { header: 'EMAIL*', key: 'email', width: 30 },
            { header: 'TELEPHONE*', key: 'telephone', width: 15 },
            { header: 'GENRE*', key: 'genre', width: 12 },
            { header: 'NATIONALITE*', key: 'nationalite', width: 15 },
            { header: 'ADRESSE*', key: 'adresse', width: 40 },
            { header: 'TYPE', key: 'type', width: 12 },
            { header: 'NIVEAU', key: 'niveau', width: 10 },
            { header: 'FILIERE_CODE', key: 'filiere_code', width: 20 },
            { header: 'TYPE_BAC', key: 'type_bac', width: 12 },
            { header: 'LIEU_OBTENTION', key: 'lieu_obtention', width: 20 },
            { header: 'ANNEE_OBTENTION', key: 'annee_obtention', width: 15 },
            { header: 'MENTION', key: 'mention', width: 15 },
            { header: 'AUTORISE', key: 'autorise', width: 12 }
        ];
        
        // Style en-tête
        modelSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        modelSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '667eea' }
        };
        modelSheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
        modelSheet.getRow(1).height = 25;
        
        // Exemples
        const exemples = [
            {
                matricule: '',
                numero_dossier: 'UDH123456',
                nom: 'MOUSSA',
                prenom: 'Aïcha',
                date_naissance: '15/03/2000',
                lieu_naissance: 'Niamey',
                email: 'aicha.moussa@example.com',
                telephone: '+22790123456',
                genre: 'feminin',
                nationalite: 'nigerienne',
                adresse: 'Quartier Plateau, Niamey',
                type: 'nouveau',
                niveau: 'L1',
                filiere_code: 'INFORMATIQUE',
                type_bac: 'BAC C',
                lieu_obtention: 'Niamey',
                annee_obtention: '2024-2025',
                mention: 'Bien',
                autorise: 'OUI'
            },
            {
                matricule: '2023UDH0001',
                numero_dossier: '',
                nom: 'IBRAHIM',
                prenom: 'Mamane',
                date_naissance: '20/08/1999',
                lieu_naissance: 'Tahoua',
                email: 'mamane.ibrahim@example.com',
                telephone: '+22791234567',
                genre: 'masculin',
                nationalite: 'nigerienne',
                adresse: 'Commune I, Tahoua',
                type: 'ancien',
                niveau: 'L2',
                filiere_code: 'MATHEMATIQUES',
                type_bac: 'BAC C',
                lieu_obtention: 'Tahoua',
                annee_obtention: '2023-2024',
                mention: 'Tres Bien',
                autorise: 'OUI'
            }
        ];
        
        exemples.forEach(exemple => {
            modelSheet.addRow(exemple);
        });
        
        // Style des exemples
        [2, 3].forEach(rowNum => {
            modelSheet.getRow(rowNum).eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF3CD' }
                };
                cell.font = { italic: true, color: { argb: '856404' } };
            });
        });
        
        // Onglet 3: Liste des filières
        const filieresSheet = workbook.addWorksheet('Liste Filieres');
        
        const filieresResult = await pool.query(`
            SELECT f.nom as code, f.libelle, fac.nom as faculte
            FROM filieres f
            JOIN facultes fac ON f.faculte_id = fac.id
            WHERE f.active = true
            ORDER BY fac.nom, f.nom
        `);
        
        filieresSheet.columns = [
            { header: 'CODE FILIÈRE', key: 'code', width: 20 },
            { header: 'LIBELLÉ', key: 'libelle', width: 40 },
            { header: 'FACULTÉ', key: 'faculte', width: 15 }
        ];
        
        filieresSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        filieresSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '28a745' }
        };
        
        filieresResult.rows.forEach(row => {
            filieresSheet.addRow(row);
        });
        
        // Onglet 4: Valeurs autorisées
        const valeursSheet = workbook.addWorksheet('Valeurs Autorisees');
        
        valeursSheet.columns = [
            { header: 'CHAMP', key: 'champ', width: 20 },
            { header: 'VALEURS POSSIBLES', key: 'valeurs', width: 60 }
        ];
        
        valeursSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        valeursSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'ffc107' }
        };
        
        const valeurs = [
            { champ: 'GENRE', valeurs: 'masculin, feminin' },
            { champ: 'TYPE', valeurs: 'nouveau, ancien' },
            { champ: 'NIVEAU', valeurs: 'L1, L2, L3, M1, M2' },
            { champ: 'TYPE_BAC', valeurs: 'BAC A, BAC C, BAC D, BAC G' },
            { champ: 'MENTION', valeurs: 'Passable, Bien, Tres Bien, Excellent' },
            { champ: 'AUTORISE', valeurs: 'OUI, NON' },
            { champ: 'NATIONALITE', valeurs: 'nigerienne, francaise, autre' },
            { champ: 'LIEU_OBTENTION', valeurs: 'Dosso, Niamey, Tahoua, Agadez, Maradi, Tillabéri, Zinder, Diffa' }
        ];
        
        valeurs.forEach(row => {
            valeursSheet.addRow(row);
        });
        
        // Générer le fichier
        const filename = 'Modele_Import_Etudiants.xlsx';
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
        
        console.log('Modèle généré avec succès');
        
    } catch (error) {
        console.error('Erreur génération modèle:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la génération du modèle',
            details: error.message
        });
    }
});

// Importer des étudiants depuis Excel
app.post('/api/admin/etudiants/import-excel', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Aucun fichier fourni'
            });
        }
        
        console.log('Import fichier étudiants:', req.file.originalname);
        
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(req.file.path);
        
        const worksheet = workbook.getWorksheet('Etudiants');
        
        if (!worksheet) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'Onglet "Etudiants" non trouvé dans le fichier'
            });
        }
        
        const data = [];
        const headers = {};
        
        // Lire les en-têtes
        worksheet.getRow(1).eachCell((cell, colNumber) => {
            headers[colNumber] = cell.value;
        });
        
        console.log('En-têtes trouvés:', Object.values(headers));
        
        // Lire les données
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const rowData = {};
                row.eachCell((cell, colNumber) => {
                    const header = headers[colNumber];
                    rowData[header] = cell.value;
                });
                
                // Ignorer les lignes vides
                if (rowData['NOM*'] || rowData.NOM) {
                    data.push(rowData);
                }
            }
        });
        
        console.log(`${data.length} lignes à traiter`);
        
        let imported = 0;
        let errors = [];
        let duplicates = 0;
        
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowNum = i + 2; // +2 car commence à 1 et en-tête
            
            try {
                // Extraire les données
                const nom = (row['NOM*'] || row.NOM || '').toString().trim().toUpperCase();
                const prenom = (row['PRENOM*'] || row.PRENOM || '').toString().trim();
                const dateNaissance = row['DATE_NAISSANCE*'] || row.DATE_NAISSANCE;
                const lieuNaissance = (row['LIEU_NAISSANCE*'] || row.LIEU_NAISSANCE || '').toString().trim();
                const email = (row['EMAIL*'] || row.EMAIL || '').toString().trim().toLowerCase();
                const telephone = (row['TELEPHONE*'] || row.TELEPHONE || '').toString().trim();
                const genre = (row['GENRE*'] || row.GENRE || '').toString().trim().toLowerCase();
                const nationalite = (row['NATIONALITE*'] || row.NATIONALITE || '').toString().trim().toLowerCase();
                const adresse = (row['ADRESSE*'] || row.ADRESSE || '').toString().trim();
                
                // Champs optionnels
                const matricule = row.MATRICULE ? row.MATRICULE.toString().trim() : null;
                const numeroDossier = row.NUMERO_DOSSIER ? row.NUMERO_DOSSIER.toString().trim() : null;
                const type = row.TYPE ? row.TYPE.toString().trim().toLowerCase() : 'nouveau';
                const niveau = row.NIVEAU ? row.NIVEAU.toString().trim().toUpperCase() : null;
                const filiereCode = row.FILIERE_CODE ? row.FILIERE_CODE.toString().trim().toUpperCase() : null;
                const typeBac = row.TYPE_BAC ? row.TYPE_BAC.toString().trim().toUpperCase() : null;
                const lieuObtention = row.LIEU_OBTENTION ? row.LIEU_OBTENTION.toString().trim() : null;
                const anneeObtention = row.ANNEE_OBTENTION ? row.ANNEE_OBTENTION.toString().trim() : null;
                const mention = row.MENTION ? row.MENTION.toString().trim() : null;
                const autorise = !row.AUTORISE || row.AUTORISE.toString().trim().toUpperCase() === 'OUI';
                
                // Validations
                if (!nom || !prenom || !dateNaissance || !lieuNaissance || !email || !telephone || !genre || !nationalite || !adresse) {
                    errors.push(`Ligne ${rowNum}: Champs obligatoires manquants`);
                    continue;
                }
                
                // Valider le genre
                if (!['masculin', 'feminin'].includes(genre)) {
                    errors.push(`Ligne ${rowNum}: Genre invalide "${genre}" (doit être masculin ou feminin)`);
                    continue;
                }
                
                // Valider le type
                if (!['nouveau', 'ancien'].includes(type)) {
                    errors.push(`Ligne ${rowNum}: Type invalide "${type}" (doit être nouveau ou ancien)`);
                    continue;
                }
                
                // Formater la date
                let dateNaissanceFormatted;
                if (dateNaissance instanceof Date) {
                    dateNaissanceFormatted = dateNaissance.toISOString().split('T')[0];
                } else {
                    const dateStr = dateNaissance.toString();
                    const parts = dateStr.split('/');
                    if (parts.length === 3) {
                        dateNaissanceFormatted = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    } else {
                        errors.push(`Ligne ${rowNum}: Date de naissance invalide "${dateNaissance}" (format attendu: JJ/MM/AAAA)`);
                        continue;
                    }
                }
                
                // Vérifier les doublons
                const checkDuplicate = await pool.query(
                    'SELECT id FROM etudiants WHERE email = $1 OR telephone = $2',
                    [email, telephone]
                );
                
                if (checkDuplicate.rows.length > 0) {
                    duplicates++;
                    errors.push(`Ligne ${rowNum}: Email ou téléphone déjà existant (${nom} ${prenom})`);
                    continue;
                }
                
                // Récupérer l'ID de la filière si spécifiée
                let filiereId = null;
                if (filiereCode) {
                    const filiereResult = await pool.query(
                        'SELECT id FROM filieres WHERE nom = $1',
                        [filiereCode]
                    );
                    
                    if (filiereResult.rows.length > 0) {
                        filiereId = filiereResult.rows[0].id;
                    } else {
                        errors.push(`Ligne ${rowNum}: Filière "${filiereCode}" non trouvée (étudiant importé sans filière)`);
                    }
                }
                
                // Insérer l'étudiant
                const result = await pool.query(
                    `INSERT INTO etudiants (
                        matricule, numero_dossier, nom, prenom, date_naissance, lieu_naissance,
                        email, telephone, genre, nationalite, adresse, type, niveau, filiere_id,
                        type_bac, lieu_obtention, annee_obtention, mention, autorise_inscription
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                    RETURNING id`,
                    [
                        matricule, numeroDossier, nom, prenom, dateNaissanceFormatted, lieuNaissance,
                        email, telephone, genre, nationalite, adresse, type, niveau, filiereId,
                        typeBac, lieuObtention, anneeObtention, mention, autorise
                    ]
                );
                
                imported++;
                console.log(`Étudiant importé: ${nom} ${prenom} (ID: ${result.rows[0].id})`);
                
            } catch (error) {
                errors.push(`Ligne ${rowNum}: ${error.message}`);
                console.error(`Erreur ligne ${rowNum}:`, error);
            }
        }
        
        // Supprimer le fichier temporaire
        fs.unlinkSync(req.file.path);
        
        const response = {
            success: true,
            message: `Import terminé: ${imported} étudiant(s) importé(s)`,
            imported: imported,
            duplicates: duplicates,
            errors: errors.length > 0 ? errors.slice(0, 50) : undefined,
            total_errors: errors.length,
            total_processed: data.length
        };
        
        console.log(`Import terminé: ${imported} importés, ${duplicates} doublons, ${errors.length} erreurs`);
        
        res.json(response);
        
    } catch (error) {
        console.error('Erreur import étudiants:', error);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'import',
            details: error.message
        });
    }
});


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

    // Créer la table filieres
    await pool.query(`
  CREATE TABLE IF NOT EXISTS diplomes (
    id SERIAL PRIMARY KEY,
    libelle VARCHAR(255) NOT NULL,
    faculte_id INTEGER NOT NULL REFERENCES facultes(id) ON DELETE RESTRICT,
    filiere_id INTEGER NOT NULL REFERENCES filieres(id) ON DELETE RESTRICT,
    active BOOLEAN DEFAULT true,  -- ✅ AJOUTÉ
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
        nationalite VARCHAR(50) NOT NULL,  -- VARCHAR au lieu d'ENUM
        genre VARCHAR(20) NOT NULL,       -- VARCHAR au lieu d'ENUM
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
    // =================== ROUTES POUR L'INSCRIPTION EN LIGNE ===================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS config_inscriptions (
            id SERIAL PRIMARY KEY,
            annee_universitaire VARCHAR(20) NOT NULL,
            ouvert BOOLEAN DEFAULT false,
            filiere_id INTEGER REFERENCES filieres(id),
            niveau VARCHAR(10),
            date_ouverture TIMESTAMP,
            date_fermeture TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    // Table des étudiants
    await pool.query(`
        CREATE TABLE IF NOT EXISTS etudiants (
            id SERIAL PRIMARY KEY,
            matricule VARCHAR(50) UNIQUE,
            numero_dossier VARCHAR(50) UNIQUE,
            
            -- Informations personnelles
            nom VARCHAR(255) NOT NULL,
            prenom VARCHAR(255) NOT NULL,
            date_naissance DATE NOT NULL,
            lieu_naissance VARCHAR(255) NOT NULL,
            nationalite VARCHAR(50) NOT NULL,
            genre VARCHAR(20) NOT NULL,
            adresse TEXT NOT NULL,
            telephone VARCHAR(20) NOT NULL,
            email VARCHAR(255) NOT NULL,
            
            -- Informations bac
            type_bac VARCHAR(50),
            lieu_obtention VARCHAR(255),
            annee_obtention VARCHAR(10),
            mention VARCHAR(50),
            
            -- Statut
            type VARCHAR(20) DEFAULT 'nouveau', -- nouveau ou ancien
            actif BOOLEAN DEFAULT true,
            autoriser_inscription BOOLEAN DEFAULT true,
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    // Table des inscriptions
    await pool.query(`
        CREATE TABLE IF NOT EXISTS inscriptions (
            id SERIAL PRIMARY KEY,
            etudiant_id INTEGER NOT NULL REFERENCES etudiants(id) ON DELETE CASCADE,
            filiere_id INTEGER NOT NULL REFERENCES filieres(id) ON DELETE RESTRICT,
            niveau VARCHAR(10) NOT NULL,
            annee_universitaire VARCHAR(20) NOT NULL,
            
            -- Paiement
            mode_paiement VARCHAR(50) NOT NULL,
            telephone_paiement VARCHAR(20),
            montant INTEGER NOT NULL,
            statut_paiement VARCHAR(20) DEFAULT 'en-attente', -- en-attente, validé, échoué
            reference_paiement VARCHAR(100),
            
            -- Statut inscription
            statut VARCHAR(20) DEFAULT 'en-cours', -- en-cours, validée, annulée
            valide_par INTEGER REFERENCES users(id),
            date_validation TIMESTAMP,
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            UNIQUE(etudiant_id, annee_universitaire, filiere_id, niveau)
        );
    `);
    
    // Index
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_etudiants_matricule ON etudiants(matricule);
        CREATE INDEX IF NOT EXISTS idx_etudiants_numero_dossier ON etudiants(numero_dossier);
        CREATE INDEX IF NOT EXISTS idx_inscriptions_etudiant ON inscriptions(etudiant_id);
        CREATE INDEX IF NOT EXISTS idx_inscriptions_filiere ON inscriptions(filiere_id);
        CREATE INDEX IF NOT EXISTS idx_inscriptions_statut ON inscriptions(statut);
    `);

    // Créer les index
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

    // Insertion des facultés (CORRIGÉ - apostrophes échappées)
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

module.exports = app;