const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Configuration du pool PostgreSQL pour Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Configuration du pool pour Neon
  max: 20, // maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test de connexion avec gestion d'erreur améliorée
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Erreur connexion PostgreSQL:', err.message);
    console.log('🔧 Configuration utilisée:');
    console.log('   Host:', process.env.DB_HOST);
    console.log('   Database:', process.env.DB_NAME);
    console.log('   User:', process.env.DB_USER);
  } else {
    console.log('✅ Connexion PostgreSQL Neon réussie');
    console.log('   Heure serveur:', res.rows[0].now);
  }
});

// Gestion des erreurs de connexion
pool.on('error', (err, client) => {
  console.error('❌ Erreur inattendue sur le pool PostgreSQL:', err);
});

// Fonction d'initialisation de la base de données
async function initializeDatabase() {
  try {
    console.log('🔧 Initialisation de la base de données Neon...');

    // [Le reste de votre code d'initialisation reste identique]
    // ... vos CREATE TABLE et INSERT ...

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation de la base de données:', error);
    
    // Ne pas quitter le processus en production
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔄 Continuation malgré l\'erreur...');
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
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      
      await pool.query(
        'INSERT INTO users (nom, email, telephone, mot_de_passe, role) VALUES ($1, $2, $3, $4, $5)',
        ['Administrateur Principal', adminEmail, '+227123456789', passwordHash, 'admin']
      );
      
      console.log('👤 Administrateur par défaut créé:');
      console.log('   Email: admin@edufile.com');
      console.log('   Mot de passe: admin123');
      console.log('   ⚠️  CHANGEZ CES IDENTIFIANTS EN PRODUCTION !');
    } else {
      console.log('✅ Administrateur par défaut existe déjà');
    }
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'admin:', error.message);
  }
}

// Exports
module.exports = { pool, initializeDatabase };
