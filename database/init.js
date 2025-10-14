// TODO: Migrer initializeDatabase() depuis server.js
const pool = require('../config/database');

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
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_applications_numero_dossier ON applications(numero_dossier);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_applications_search ON applications USING gin(to_tsvector('french', nom || ' ' || prenom || ' ' || numero_dossier));`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_etudiants_search ON etudiants USING gin(to_tsvector('french', nom || ' ' || prenom || ' ' || matricule));`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_etudiants_statut ON etudiants(statut);`);
     
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
module.exports = initializeDatabase;