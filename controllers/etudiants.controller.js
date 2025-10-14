const { pool } = require('../config/database');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

exports.getInscriptionDetails = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT 
                i.id,
                i.etudiant_id,
                i.annee_universitaire,
                i.date_inscription,
                i.statut_inscription,
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
                e.niveau,
                f.nom as filiere,
                f.libelle as filiere_libelle,
                fac.nom as faculte,
                fac.libelle as faculte_libelle
            FROM inscription i
            JOIN etudiant e ON i.etudiant_id = e.id
            LEFT JOIN filieres f ON e.filiere_id = f.id
            LEFT JOIN facultes fac ON f.faculte_id = fac.id
            WHERE i.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Inscription non trouvée' 
            });
        }
        
        res.json({
            success: true,
            inscription: result.rows[0]
        });
    } catch (error) {
        console.error('Erreur récupération inscription:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur',
            details: error.message 
        });
    }
};


// Récupérer la dernière inscription d'un étudiant
exports.getDerniereInscription = async (req, res) => {
    try {
        const { etudiantId } = req.params;
        
        console.log('📄 Récupération dernière inscription pour étudiant:', etudiantId);
        
        // Récupérer la dernière inscription validée avec TOUTES les informations
        const result = await pool.query(`
            SELECT 
                i.id,
                i.etudiant_id,
                i.annee_universitaire,
                i.date_inscription,
                i.statut_inscription,
                i.montant,
                i.mode_paiement,
                i.statut_paiement,
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
                e.niveau,
                f.nom as filiere,
                f.libelle as filiere_libelle,
                fac.nom as faculte,
                fac.libelle as faculte_libelle,
                i.created_at
            FROM inscription i
            JOIN etudiant e ON i.etudiant_id = e.id
            LEFT JOIN filieres f ON e.filiere_id = f.id
            LEFT JOIN facultes fac ON f.faculte_id = fac.id
            WHERE i.etudiant_id = $1 
            AND i.statut_inscription = 'validee'
            ORDER BY i.date_inscription DESC
            LIMIT 1
        `, [etudiantId]);
        
        if (result.rows.length === 0) {
            console.log('❌ Aucune inscription validée trouvée pour étudiant:', etudiantId);
            return res.status(404).json({ 
                success: false,
                error: 'Aucune inscription validée trouvée pour cet étudiant' 
            });
        }
        
        console.log('✅ Inscription trouvée:', result.rows[0]);
        
        res.json({
            success: true,
            inscription: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Erreur récupération dernière inscription:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur',
            details: error.message 
        });
    }
};

// Alternative: Récupérer le reçu par ID d'étudiant
exports.getRecuByEtudiantId = async (req, res) => {
    try {
        const { etudiantId } = req.params;
        
        // Récupérer la dernière inscription validée
        const result = await pool.query(`
            SELECT 
                i.id,
                i.etudiant_id,
                i.annee_universitaire,
                i.date_inscription,
                i.statut_inscription,
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
                e.niveau,
                f.nom as filiere,
                f.libelle as filiere_libelle,
                fac.nom as faculte,
                fac.libelle as faculte_libelle
            FROM inscription i
            JOIN etudiant e ON i.etudiant_id = e.id
            LEFT JOIN filieres f ON e.filiere_id = f.id
            LEFT JOIN facultes fac ON f.faculte_id = fac.id
            WHERE i.etudiant_id = $1 
            AND i.statut_inscription = 'validée'
            ORDER BY i.date_inscription DESC
            LIMIT 1
        `, [etudiantId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Aucune inscription validée trouvée pour cet étudiant' 
            });
        }
        
        res.json({
            success: true,
            inscription: result.rows[0]
        });
    } catch (error) {
        console.error('Erreur récupération reçu étudiant:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur',
            details: error.message 
        });
    }
};

// Récupérer tous les étudiants avec filtres
exports.getEtudiants = async (req, res) => {
    try {
        const { search, statut } = req.query;
        
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
                f.nom as filiere,
                f.libelle as filiere_libelle,
                fac.nom as faculte,
                fac.libelle as faculte_libelle,
                i_recent.statut_inscription,
                i_recent.annee_universitaire,
                (SELECT COUNT(*) FROM inscription WHERE etudiant_id = e.id) as nombre_inscriptions
            FROM etudiant e
            LEFT JOIN filieres f ON e.filiere_id = f.id
            LEFT JOIN facultes fac ON f.faculte_id = fac.id
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
        
        res.json({ 
            success: true,
            etudiants: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Erreur récupération étudiants:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur',
            details: error.message 
        });
    }
};

// Récupérer un étudiant spécifique
exports.getEtudiant = async (req, res) => {
    try {
        const { id } = req.params;
        
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
        `, [id]);
        
        if (etudiantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Étudiant non trouvé' });
        }
        
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
        `, [id]);
        
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
};

// Créer un étudiant manuellement
exports.creerEtudiant = async (req, res) => {
    try {
        const {
            numero_dossier, matricule, nom, prenom, date_naissance, lieu_naissance,
            nationalite, genre, adresse, telephone, email, type_bac, lieu_obtention,
            annee_obtention, mention, filiere_id, niveau, statut, peut_inscrire
        } = req.body;
        
        if (!numero_dossier || !nom || !prenom || !date_naissance || !lieu_naissance ||
            !nationalite || !genre || !adresse || !telephone || !email) {
            return res.status(400).json({ error: 'Champs obligatoires manquants' });
        }
        
        const checkDossier = await pool.query(
            'SELECT id FROM etudiant WHERE numero_dossier = $1',
            [numero_dossier]
        );
        
        if (checkDossier.rows.length > 0) {
            return res.status(400).json({ error: 'Ce numéro de dossier existe déjà' });
        }
        
        if (matricule) {
            const checkMatricule = await pool.query(
                'SELECT id FROM etudiant WHERE matricule = $1',
                [matricule]
            );
            
            if (checkMatricule.rows.length > 0) {
                return res.status(400).json({ error: 'Ce matricule existe déjà' });
            }
        }
        
        const result = await pool.query(`
            INSERT INTO etudiant (
                numero_dossier, matricule, nom, prenom, date_naissance, lieu_naissance,
                nationalite, genre, adresse, telephone, email, type_bac, lieu_obtention,
                annee_obtention, mention, filiere_id, niveau, statut, peut_inscrire
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            RETURNING *
        `, [
            numero_dossier, matricule, nom, prenom, date_naissance, lieu_naissance,
            nationalite, genre, adresse, telephone, email, type_bac, lieu_obtention,
            annee_obtention, mention, filiere_id, niveau, statut || 'actif', peut_inscrire !== false
        ]);
        
        res.json({ success: true, etudiant: result.rows[0] });
    } catch (error) {
        console.error('Erreur création étudiant:', error);
        
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Numéro de dossier ou matricule déjà existant' });
        }
        
        res.status(500).json({ error: 'Erreur lors de la création de l\'étudiant' });
    }
};

// Mettre à jour un étudiant
exports.updateEtudiant = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            matricule, nom, prenom, date_naissance, lieu_naissance,
            nationalite, genre, adresse, telephone, email,
            type_bac, lieu_obtention, annee_obtention, mention,
            filiere_id, niveau, statut, peut_inscrire
        } = req.body;
        
        const result = await pool.query(`
            UPDATE etudiant SET
                matricule = $1, nom = $2, prenom = $3, date_naissance = $4,
                lieu_naissance = $5, nationalite = $6, genre = $7, adresse = $8,
                telephone = $9, email = $10, type_bac = $11, lieu_obtention = $12,
                annee_obtention = $13, mention = $14, filiere_id = $15, niveau = $16,
                statut = $17, peut_inscrire = $18, updated_at = NOW()
            WHERE id = $19
            RETURNING *
        `, [
            matricule, nom, prenom, date_naissance, lieu_naissance,
            nationalite, genre, adresse, telephone, email,
            type_bac, lieu_obtention, annee_obtention, mention,
            filiere_id, niveau, statut, peut_inscrire, id
        ]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Étudiant non trouvé' });
        }
        
        res.json({ success: true, etudiant: result.rows[0] });
    } catch (error) {
        console.error('Erreur modification étudiant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Toggle autorisation inscription
exports.toggleInscription = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            UPDATE etudiant 
            SET peut_inscrire = NOT peut_inscrire, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Étudiant non trouvé' });
        }
        
        res.json({ success: true, etudiant: result.rows[0] });
    } catch (error) {
        console.error('Erreur toggle inscription:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Supprimer un étudiant
exports.supprimerEtudiant = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query('DELETE FROM etudiant WHERE id = $1', [id]);
        
        res.json({ success: true, message: 'Étudiant supprimé' });
    } catch (error) {
        console.error('Erreur suppression étudiant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Générer un matricule
exports.genererMatricule = async (req, res) => {
    try {
        const { id } = req.params;
        const annee = new Date().getFullYear();
        
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
        `, [matricule, id]);
        
        res.json({ success: true, etudiant: result.rows[0] });
    } catch (error) {
        console.error('Erreur génération matricule:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Télécharger le modèle Excel
exports.telechargerModele = async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Étudiants');
        
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
        
        // Style en-tête
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
        
        // Exemples
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
        
        // Feuille filières
        const filiereSheet = workbook.addWorksheet('Liste Filières');
        const filieres = await pool.query(`
            SELECT f.nom, f.libelle, fac.nom as faculte, fac.libelle as faculte_libelle
            FROM filieres f
            JOIN facultes fac ON f.faculte_id = fac.id
            WHERE f.active = true AND fac.active = true
            ORDER BY fac.nom, f.nom
        `);
        
        filiereSheet.columns = [
            { header: 'Nom Filière', key: 'nom', width: 25 },
            { header: 'Libellé', key: 'libelle', width: 40 },
            { header: 'Faculté', key: 'faculte', width: 15 },
            { header: 'Faculté Libellé', key: 'faculte_libelle', width: 35 }
        ];
        
        filiereSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        filiereSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '28a745' }
        };
        
        filieres.rows.forEach(filiere => filiereSheet.addRow(filiere));
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Modele_Import_Etudiants.xlsx"');
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Erreur génération modèle:', error);
        res.status(500).json({ 
            error: 'Erreur génération modèle',
            details: error.message 
        });
    }
};

// Importer des étudiants
exports.importerEtudiants = async (req, res) => {
    try {
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
            if (rowNumber === 1) return;
            
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
                
                const champsObligatoires = [
                    'numero_dossier', 'nom', 'prenom', 'date_naissance', 
                    'lieu_naissance', 'nationalite', 'genre', 'adresse', 
                    'telephone', 'email'
                ];
                
                const champsManquants = champsObligatoires.filter(champ => !etudiant[champ]);
                
                if (champsManquants.length > 0) {
                    throw new Error(`Champs manquants: ${champsManquants.join(', ')}`);
                }
                
                if (!['masculin', 'feminin'].includes(etudiant.genre)) {
                    throw new Error('Genre invalide');
                }
                
                if (etudiant.filiere && etudiant.niveau) {
                    if (!['L1', 'L2', 'L3', 'M1', 'M2'].includes(etudiant.niveau)) {
                        throw new Error('Niveau invalide');
                    }
                }
                
                etudiants.push(etudiant);
            } catch (error) {
                erreurs.push({ ligne: rowNumber, erreur: error.message });
            }
        });
        
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
};



module.exports = exports;