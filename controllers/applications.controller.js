const { pool } = require('../config/database');
const path = require('path');
const fs = require('fs');

// Fonction pour générer un numéro unique
// Vérifier si un dossier peut être modifié
// Mettre à jour la fonction canEditApplication pour autoriser toutes les modifications

exports.canEditApplication = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'SELECT * FROM applications WHERE id = $1',
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

        // ✅ MODIFICATION : Autoriser la modification quel que soit le statut
        const canEdit = true; // Toujours autorisé maintenant
        
        // Message d'information selon le statut
        let infoMessage = null;
        if (application.statut === 'approuve') {
            infoMessage = 'Attention : Ce dossier est déjà approuvé. Les modifications nécessiteront une nouvelle validation.';
        } else if (application.statut === 'rejete') {
            infoMessage = 'Ce dossier a été rejeté. Vous pouvez le modifier pour le soumettre à nouveau.';
        }

        res.json({ 
            canEdit,
            application,
            infoMessage // Au lieu de reason (erreur)
        });
    } catch (error) {
        console.error('Erreur vérification édition:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Mettre à jour getApplicationForEdit de la même manière
exports.getApplicationForEdit = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'SELECT * FROM applications WHERE id = $1',
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

        // ✅ MODIFICATION : Plus de restriction de statut
        // Tous les utilisateurs peuvent modifier leurs dossiers
        
        let infoMessage = null;
        if (application.statut === 'approuve') {
            infoMessage = 'Attention : Ce dossier est déjà approuvé. Les modifications nécessiteront une nouvelle validation.';
        } else if (application.statut === 'rejete') {
            infoMessage = 'Ce dossier a été rejeté. Vous pouvez le modifier pour le soumettre à nouveau.';
        }

        res.json({ 
            application,
            infoMessage
        });
    } catch (error) {
        console.error('Erreur récupération dossier pour édition:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Mettre à jour updateApplication
exports.updateApplication = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Récupérer le dossier existant
        const existingResult = await pool.query(
            'SELECT * FROM applications WHERE id = $1',
            [id]
        );

        if (existingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Dossier non trouvé' });
        }

        const existingApplication = existingResult.rows[0];
        
        // Vérifier les droits d'accès
        if (req.user.role !== 'admin' && existingApplication.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }

        // ✅ MODIFICATION : Plus de restriction de statut
        // Autoriser la modification quel que soit le statut

        const {
            nom, prenom, dateNaissance, lieuNaissance, nationalite, genre,
            adresse, telephone, email, typeBac, lieuObtention, anneeObtention,
            mention, premierChoix, deuxiemeChoix, troisiemeChoix
        } = req.body;

        // Préparer les nouveaux documents
        let documents = typeof existingApplication.documents === 'string' 
            ? JSON.parse(existingApplication.documents) 
            : existingApplication.documents || {};

        if (req.files) {
            Object.keys(req.files).forEach(key => {
                // Supprimer l'ancien fichier si présent
                const oldFile = documents[key];
                if (oldFile && oldFile !== 'Non fourni' && oldFile !== 'Optionnel') {
                    const oldPath = path.join(__dirname, '../uploads', oldFile);
                    if (fs.existsSync(oldPath)) {
                        fs.unlinkSync(oldPath);
                    }
                }
                // Ajouter le nouveau fichier
                documents[key] = req.files[key][0].filename;
            });
        }

        // ✅ AJOUT : Remettre le statut à "en-attente" si le dossier était approuvé ou rejeté
        let nouveauStatut = existingApplication.statut;
        let numeroDepot = existingApplication.numero_depot;
        
        if (existingApplication.statut === 'approuve' || existingApplication.statut === 'rejete') {
            nouveauStatut = 'en-attente';
            numeroDepot = null; // Réinitialiser le numéro de dépôt
        }

        // Mettre à jour le dossier
        const result = await pool.query(
            `UPDATE applications SET
                nom = $1, prenom = $2, date_naissance = $3, lieu_naissance = $4,
                nationalite = $5, genre = $6, adresse = $7, telephone = $8, email = $9,
                type_bac = $10, lieu_obtention = $11, annee_obtention = $12, mention = $13,
                premier_choix = $14, deuxieme_choix = $15, troisieme_choix = $16,
                documents = $17, statut = $18, numero_depot = $19, updated_at = NOW()
            WHERE id = $20
            RETURNING *`,
            [
                nom, prenom, dateNaissance, lieuNaissance, nationalite, genre,
                adresse, telephone, email, typeBac, lieuObtention, anneeObtention,
                mention, premierChoix, deuxiemeChoix, troisiemeChoix,
                JSON.stringify(documents), nouveauStatut, numeroDepot, id
            ]
        );

        let message = 'Dossier mis à jour avec succès';
        if (nouveauStatut === 'en-attente' && existingApplication.statut !== 'en-attente') {
            message = 'Dossier mis à jour avec succès. Le dossier a été remis en attente de validation.';
        }

        res.json({
            message,
            application: result.rows[0],
            statutChanged: nouveauStatut !== existingApplication.statut
        });
    } catch (error) {
        console.error('Erreur mise à jour dossier:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
async function generateUniqueSixDigitNumber(table, column) {
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
        const number = Math.floor(100000 + Math.random() * 900000);
        const fullNumber = 'UDH' + number;
        
        const result = await pool.query(
            `SELECT COUNT(*) FROM ${table} WHERE ${column} = $1`,
            [fullNumber]
        );
        
        if (parseInt(result.rows[0].count) === 0) {
            return fullNumber;
        }
        attempts++;
    }
    
    throw new Error('Impossible de générer un numéro unique');
}

// Soumettre un dossier
exports.submitApplication = async (req, res) => {
    try {
        console.log('Début soumission dossier');
        console.log('User ID:', req.user?.id);
        
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
            return res.status(400).json({ 
                error: `Champs obligatoires manquants: ${missingFields.join(', ')}` 
            });
        }

        // Générer un numéro de dossier unique
        const numeroDossier = await generateUniqueSixDigitNumber('applications', 'numero_dossier');

        // Préparer les documents
        const documents = {};
        if (req.files) {
            Object.keys(req.files).forEach(key => {
                documents[key] = req.files[key][0].filename;
            });
        }

        // Insérer le dossier
        const result = await pool.query(
            `INSERT INTO applications (
                user_id, numero_dossier, nom, prenom, date_naissance, lieu_naissance,
                nationalite, genre, adresse, telephone, email, type_bac, lieu_obtention,
                annee_obtention, mention, premier_choix, deuxieme_choix, troisieme_choix,
                documents, statut, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW()) 
            RETURNING *`,
            [
                req.user.id, numeroDossier, nom, prenom, dateNaissance, lieuNaissance,
                nationalite, genre, adresse, telephone, email, typeBac, lieuObtention,
                anneeObtention, mention, premierChoix, deuxiemeChoix, troisiemeChoix,
                JSON.stringify(documents), 'en-attente'
            ]
        );

        console.log('Dossier inséré avec succès:', result.rows[0].id);

        res.status(201).json({
            message: 'Dossier soumis avec succès',
            application: result.rows[0]
        });
    } catch (error) {
        console.error('Erreur soumission dossier:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Récupérer mes dossiers (utilisateur)
exports.getMyApplications = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM applications WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        
        res.json({ applications: result.rows });
    } catch (error) {
        console.error('Erreur récupération dossiers:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Récupérer tous les dossiers (admin)
exports.getAllApplications = async (req, res) => {
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
        res.json({ applications: result.rows });
    } catch (error) {
        console.error('Erreur récupération dossiers admin:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Récupérer un dossier spécifique
exports.getApplication = async (req, res) => {
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

        res.json({ application });
    } catch (error) {
        console.error('Erreur récupération dossier:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Récupérer les détails complets d'un dossier
exports.getApplicationDetails = async (req, res) => {
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

        // Ajouter les infos sur les documents
        try {
            const documents = typeof application.documents === 'string' 
                ? JSON.parse(application.documents) 
                : application.documents || {};
            
            const documentsStatus = {};
            Object.entries(documents).forEach(([key, filename]) => {
                if (filename && filename !== 'Non fourni' && filename !== 'Optionnel') {
                    const filePath = path.join(__dirname, '../uploads', filename);
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
        console.error('Erreur détails dossier:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Télécharger un document
exports.downloadDocument = async (req, res) => {
    try {
        const { id, documentType } = req.params;
        
        const result = await pool.query(
            'SELECT * FROM applications WHERE id = $1',
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

        // Récupérer les documents
        const documents = typeof application.documents === 'string' 
            ? JSON.parse(application.documents) 
            : application.documents || {};

        const filename = documents[documentType];
        if (!filename || filename === 'Non fourni' || filename === 'Optionnel') {
            return res.status(404).json({ error: 'Document non trouvé' });
        }

        const filePath = path.join(__dirname, '../uploads', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Fichier physique non trouvé' });
        }

        // Définir le type MIME
        const ext = path.extname(filename).toLowerCase();
        let mimeType = 'application/octet-stream';
        
        switch(ext) {
            case '.pdf': mimeType = 'application/pdf'; break;
            case '.jpg':
            case '.jpeg': mimeType = 'image/jpeg'; break;
            case '.png': mimeType = 'image/png'; break;
        }

        const documentNames = {
            'photoIdentite': 'Photo_identite',
            'pieceIdentite': 'Piece_identite',
            'diplomeBac': 'Diplome_bac', 
            'releve': 'Releve_notes',
            'certificatNationalite': 'Certificat_nationalite'
        };

        const cleanNom = (application.nom || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
        const cleanPrenom = (application.prenom || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 15);
        const downloadName = `${documentNames[documentType] || documentType}_${cleanNom}_${cleanPrenom}${ext}`;

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.sendFile(filePath);
    } catch (error) {
        console.error('Erreur téléchargement document:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Mettre à jour le statut d'un dossier (admin)
exports.updateApplicationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { statut } = req.body;

        if (!['en-attente', 'approuve', 'rejete'].includes(statut)) {
            return res.status(400).json({ error: 'Statut invalide' });
        }

        let numeroDepot = null;
        if (statut === 'approuve') {
            numeroDepot = await generateUniqueSixDigitNumber('applications', 'numero_depot');
        }

        await pool.query(
            'UPDATE applications SET statut = $1, numero_depot = $2, updated_at = NOW() WHERE id = $3',
            [statut, numeroDepot, id]
        );

        const result = await pool.query('SELECT * FROM applications WHERE id = $1', [id]);
        
        res.json({ 
            message: 'Statut mis à jour avec succès', 
            application: result.rows[0] 
        });
    } catch (error) {
        console.error('Erreur mise à jour statut:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Rechercher des dossiers (admin)
exports.searchApplications = async (req, res) => {
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
};

module.exports = exports;