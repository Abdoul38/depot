const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// =================== GESTION UTILISATEURS ===================

// Récupérer tous les utilisateurs
exports.getUsers = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nom, email, telephone, role, created_at FROM users ORDER BY created_at DESC'
        );

        res.json({ users: result.rows });
    } catch (error) {
        console.error('Erreur récupération utilisateurs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Ajouter un utilisateur
exports.ajouterUser = async (req, res) => {
    try {
        const { nom, email, telephone, role, motDePasse } = req.body;

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
            'INSERT INTO users (nom, email, telephone, mot_de_passe, role, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
            [nom, email, telephone, hashedPassword, role]
        );

        const user = result.rows[0];
        delete user.mot_de_passe;

        res.status(201).json({ 
            message: 'Utilisateur ajouté avec succès', 
            user 
        });
    } catch (error) {
        console.error('Erreur ajout utilisateur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// =================== STATISTIQUES ===================

// Statistiques globales
exports.getStats = async (req, res) => {
    try {
        const stats = {};

        // Total utilisateurs
        const userCount = await pool.query(
            'SELECT COUNT(*) FROM users WHERE role = $1', 
            ['user']
        );
        stats.totalUsers = parseInt(userCount.rows[0].count);

        // Total dossiers
        const appCount = await pool.query('SELECT COUNT(*) FROM applications');
        stats.totalApplications = parseInt(appCount.rows[0].count);

        // Dossiers approuvés
        const approvedCount = await pool.query(
            'SELECT COUNT(*) FROM applications WHERE statut = $1', 
            ['approuve']
        );
        stats.approvedApplications = parseInt(approvedCount.rows[0].count);

        // Dossiers en attente
        const pendingCount = await pool.query(
            'SELECT COUNT(*) FROM applications WHERE statut = $1', 
            ['en-attente']
        );
        stats.pendingApplications = parseInt(pendingCount.rows[0].count);

        res.json({ stats });
    } catch (error) {
        console.error('Erreur récupération statistiques:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Statistiques par facultés
exports.getStatsFacultes = async (req, res) => {
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
};

// =================== EXPORT ===================

// Export utilisateurs
exports.exportUsers = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT nom, email, telephone, role, created_at FROM users ORDER BY created_at DESC'
        );
        
        const csv = [
            'Nom,Email,Téléphone,Rôle,Date d\'inscription',
            ...result.rows.map(row => 
                `"${row.nom}","${row.email}","${row.telephone}","${row.role}","${new Date(row.created_at).toLocaleDateString('fr-FR')}"`
            )
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=utilisateurs.csv');
        res.send('\uFEFF' + csv); // BOM UTF-8
    } catch (error) {
        console.error('Erreur export utilisateurs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Export applications
exports.exportApplications = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.numero_dossier, a.nom, a.prenom, a.date_naissance, 
                   a.lieu_naissance, a.lieu_obtention, a.nationalite, a.adresse, 
                   a.email, a.premier_choix, a.deuxieme_choix, a.troisieme_choix,
                   a.type_bac, a.statut, a.created_at
            FROM applications a
            ORDER BY a.created_at DESC
        `);
        
        const csv = [
            'Numéro dossier,Nom,Prénom,Date Naiss,Lieu Naiss,Lieu Obtention,Nationalité,Adresse,Email,Premier choix,Deuxième choix,Troisième choix,Type Bac,Statut,Date dépôt',
            ...result.rows.map(row => 
                `"${row.numero_dossier}","${row.nom}","${row.prenom}","${new Date(row.date_naissance).toLocaleDateString('fr-FR')}","${row.lieu_naissance}","${row.lieu_obtention}","${row.nationalite}","${row.adresse}","${row.email}","${row.premier_choix}","${row.deuxieme_choix}","${row.troisieme_choix}","${row.type_bac}","${row.statut}","${new Date(row.created_at).toLocaleDateString('fr-FR')}"`
            )
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=dossiers.csv');
        res.send('\uFEFF' + csv);
    } catch (error) {
        console.error('Erreur export dossiers:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Export complet des candidatures
exports.exportCandidaturesComplete = async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Candidatures');

        const result = await pool.query(`
            SELECT 
                a.id, a.numero_dossier, a.numero_depot,
                a.nom, a.prenom, 
                TO_CHAR(a.date_naissance, 'DD/MM/YYYY') as date_naissance,
                a.lieu_naissance, a.nationalite,
                CASE WHEN a.genre = 'masculin' THEN 'Masculin' ELSE 'Féminin' END as genre,
                a.adresse, a.telephone, a.email,
                a.type_bac, a.lieu_obtention, a.annee_obtention, a.mention,
                a.premier_choix, a.deuxieme_choix, a.troisieme_choix,
                CASE 
                    WHEN a.statut = 'approuve' THEN 'Approuvé'
                    WHEN a.statut = 'rejete' THEN 'Rejeté'
                    ELSE 'En attente'
                END as statut,
                TO_CHAR(a.created_at, 'DD/MM/YYYY HH24:MI') as date_depot,
                f1.libelle as premier_choix_libelle,
                fac1.nom as faculte_premier_choix
            FROM applications a
            LEFT JOIN filieres f1 ON UPPER(TRIM(f1.nom)) = UPPER(TRIM(a.premier_choix))
            LEFT JOIN facultes fac1 ON f1.faculte_id = fac1.id
            ORDER BY a.created_at DESC
        `);

        worksheet.columns = [
            { header: 'ID', key: 'id', width: 8 },
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
            { header: 'Deuxième Choix', key: 'deuxieme_choix', width: 20 },
            { header: 'Troisième Choix', key: 'troisieme_choix', width: 20 },
            { header: 'Statut', key: 'statut', width: 15 },
            { header: 'Date Dépôt', key: 'date_depot', width: 18 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '667eea' }
        };

        result.rows.forEach(row => worksheet.addRow(row));

        const filename = `candidatures_complete_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Erreur export complet:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Export par section
exports.exportBySection = async (req, res) => {
    try {
        const { type } = req.params;
        const { filter } = req.query;

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Export');

        let query = '';
        let params = [];
        let filename = '';

        switch(type) {
            case 'par-faculte':
                if (filter) {
                    query = `
                        SELECT a.*, fac.nom as faculte, fac.libelle as faculte_libelle
                        FROM applications a
                        JOIN filieres f ON UPPER(TRIM(f.nom)) = UPPER(TRIM(a.premier_choix))
                        JOIN facultes fac ON f.faculte_id = fac.id
                        WHERE fac.nom = $1
                        ORDER BY a.created_at DESC
                    `;
                    params = [filter];
                    filename = `Export_Faculte_${filter}_${new Date().toISOString().split('T')[0]}.xlsx`;
                }
                break;

            case 'par-genre':
                if (filter) {
                    query = `
                        SELECT * FROM applications 
                        WHERE genre = $1
                        ORDER BY created_at DESC
                    `;
                    params = [filter];
                    filename = `Export_Genre_${filter}_${new Date().toISOString().split('T')[0]}.xlsx`;
                }
                break;

            case 'par-statut':
                query = `
                    SELECT * FROM applications 
                    WHERE statut = $1
                    ORDER BY created_at DESC
                `;
                params = [filter || 'en-attente'];
                filename = `Export_Statut_${filter || 'en-attente'}_${new Date().toISOString().split('T')[0]}.xlsx`;
                break;

            default:
                return res.status(400).json({ error: 'Type d\'export invalide' });
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Aucune donnée trouvée' });
        }

        worksheet.columns = [
            { header: 'N° Dossier', key: 'numero_dossier', width: 15 },
            { header: 'Nom', key: 'nom', width: 20 },
            { header: 'Prénom', key: 'prenom', width: 20 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'Téléphone', key: 'telephone', width: 15 },
            { header: 'Genre', key: 'genre', width: 12 },
            { header: 'Type Bac', key: 'type_bac', width: 12 },
            { header: 'Premier Choix', key: 'premier_choix', width: 20 },
            { header: 'Statut', key: 'statut', width: 15 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '28a745' }
        };

        result.rows.forEach(row => worksheet.addRow(row));

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Erreur export section:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};
exports.exportCandidaturesComplete = async (req, res) => {
    try {
        console.log('Export complet des candidatures...');
        
        const result = await pool.query(`
            SELECT 
                a.id, a.numero_dossier, a.numero_depot,
                a.nom, a.prenom,
                TO_CHAR(a.date_naissance, 'DD/MM/YYYY') as date_naissance,
                a.lieu_naissance, a.nationalite,
                CASE WHEN a.genre = 'masculin' THEN 'Masculin' ELSE 'Féminin' END as genre,
                a.adresse, a.telephone, a.email,
                a.type_bac, a.lieu_obtention, a.annee_obtention, a.mention,
                a.premier_choix, a.deuxieme_choix, a.troisieme_choix,
                CASE 
                    WHEN a.statut = 'approuve' THEN 'Approuvé'
                    WHEN a.statut = 'rejete' THEN 'Rejeté'
                    ELSE 'En attente'
                END as statut,
                TO_CHAR(a.created_at, 'DD/MM/YYYY HH24:MI') as date_depot,
                TO_CHAR(a.updated_at, 'DD/MM/YYYY HH24:MI') as date_modification,
                u.id as user_id, u.nom as nom_utilisateur,
                u.email as email_utilisateur, u.telephone as telephone_utilisateur,
                f1.libelle as premier_choix_libelle, f1.capacite_max as capacite_filiere,
                fac1.nom as faculte_premier_choix, fac1.libelle as faculte_libelle,
                CASE WHEN a.documents::text LIKE '%photoIdentite%' AND a.documents::text NOT LIKE '%"photoIdentite":"Non fourni"%' THEN 'Oui' ELSE 'Non' END as photo_identite,
                CASE WHEN a.documents::text LIKE '%pieceIdentite%' AND a.documents::text NOT LIKE '%"pieceIdentite":"Non fourni"%' THEN 'Oui' ELSE 'Non' END as piece_identite,
                CASE WHEN a.documents::text LIKE '%diplomeBac%' AND a.documents::text NOT LIKE '%"diplomeBac":"Non fourni"%' THEN 'Oui' ELSE 'Non' END as diplome_bac,
                CASE WHEN a.documents::text LIKE '%releve%' AND a.documents::text NOT LIKE '%"releve":"Non fourni"%' THEN 'Oui' ELSE 'Non' END as releve_notes,
                CASE WHEN a.documents::text LIKE '%certificatNationalite%' AND a.documents::text NOT LIKE '%"certificatNationalite":"Non fourni"%' AND a.documents::text NOT LIKE '%"certificatNationalite":"Optionnel"%' THEN 'Oui' ELSE 'Non' END as certificat_nationalite
            FROM applications a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN filieres f1 ON UPPER(TRIM(f1.nom)) = UPPER(TRIM(a.premier_choix))
            LEFT JOIN facultes fac1 ON f1.faculte_id = fac1.id
            ORDER BY a.created_at DESC
        `);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Aucune candidature trouvée' });
        }
        
        const headers = [
            'ID', 'Numero Dossier', 'Numero Depot', 'Nom', 'Prenom',
            'Date Naissance', 'Lieu Naissance', 'Nationalite', 'Genre',
            'Adresse', 'Telephone', 'Email', 'Type Bac', 'Lieu Obtention',
            'Annee Obtention', 'Mention', 'Premier Choix', 'Filiere Premier Choix',
            'Faculte Premier Choix', 'Faculte Libelle', 'Capacite Filiere',
            'Deuxieme Choix', 'Troisieme Choix', 'Statut', 'Date Depot',
            'Date Modification', 'User ID', 'Nom Utilisateur', 'Email Utilisateur',
            'Telephone Utilisateur', 'Photo Identite', 'Piece Identite',
            'Diplome Bac', 'Releve Notes', 'Certificat Nationalite'
        ].join(',');
        
        const rows = result.rows.map(row => {
            return [
                row.id, row.numero_dossier, row.numero_depot || 'N/A',
                `"${(row.nom || '').replace(/"/g, '""')}"`,
                `"${(row.prenom || '').replace(/"/g, '""')}"`,
                row.date_naissance,
                `"${(row.lieu_naissance || '').replace(/"/g, '""')}"`,
                row.nationalite, row.genre,
                `"${(row.adresse || '').replace(/"/g, '""')}"`,
                row.telephone, row.email, row.type_bac,
                `"${(row.lieu_obtention || '').replace(/"/g, '""')}"`,
                row.annee_obtention, row.mention,
                `"${(row.premier_choix || '').replace(/"/g, '""')}"`,
                `"${(row.premier_choix_libelle || row.premier_choix || '').replace(/"/g, '""')}"`,
                `"${(row.faculte_premier_choix || 'N/A').replace(/"/g, '""')}"`,
                `"${(row.faculte_libelle || 'N/A').replace(/"/g, '""')}"`,
                row.capacite_filiere || 'Illimitée',
                `"${(row.deuxieme_choix || '').replace(/"/g, '""')}"`,
                `"${(row.troisieme_choix || '').replace(/"/g, '""')}"`,
                row.statut, row.date_depot, row.date_modification,
                row.user_id,
                `"${(row.nom_utilisateur || '').replace(/"/g, '""')}"`,
                row.email_utilisateur, row.telephone_utilisateur,
                row.photo_identite, row.piece_identite,
                row.diplome_bac, row.releve_notes, row.certificat_nationalite
            ].join(',');
        });
        
        const csv = [headers, ...rows].join('\n');
        const filename = `candidatures_complete_${new Date().toISOString().split('T')[0]}.csv`;
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csv);
        
        console.log(`Export de ${result.rows.length} candidatures`);
    } catch (error) {
        console.error('Erreur export complet:', error);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
};

// =================== EXPORT EXCEL DES DOSSIERS APPROUVÉS ===================

exports.exportApprouvesExcel = async (req, res) => {
    try {
        console.log('Export Excel des dossiers approuvés...');
        
        const result = await pool.query(`
            SELECT 
                a.numero_dossier, a.numero_depot, a.nom, a.prenom,
                TO_CHAR(a.date_naissance, 'DD/MM/YYYY') as date_naissance,
                a.lieu_naissance, a.nationalite,
                CASE WHEN a.genre = 'masculin' THEN 'Masculin' ELSE 'Féminin' END as genre,
                a.adresse, a.telephone, a.email,
                a.type_bac, a.lieu_obtention, a.annee_obtention, a.mention,
                a.premier_choix, a.deuxieme_choix, a.troisieme_choix,
                TO_CHAR(a.created_at, 'DD/MM/YYYY HH24:MI') as date_depot,
                f1.libelle as premier_choix_libelle,
                fac1.nom as faculte_premier_choix, fac1.libelle as faculte_libelle,
                CASE WHEN a.documents::text LIKE '%photoIdentite%' THEN 'Oui' ELSE 'Non' END as photo_identite,
                CASE WHEN a.documents::text LIKE '%pieceIdentite%' THEN 'Oui' ELSE 'Non' END as piece_identite,
                CASE WHEN a.documents::text LIKE '%diplomeBac%' THEN 'Oui' ELSE 'Non' END as diplome_bac,
                CASE WHEN a.documents::text LIKE '%releve%' THEN 'Oui' ELSE 'Non' END as releve_notes,
                CASE WHEN a.documents::text LIKE '%certificatNationalite%' THEN 'Oui' ELSE 'Non' END as certificat_nationalite,
                u.nom as nom_compte_utilisateur, u.email as email_compte
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
        
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Université Djibo Hamani - EduFile';
        workbook.created = new Date();
        
        // FEUILLE 1: Dossiers Approuvés
        const worksheet = workbook.addWorksheet('Dossiers Approuvés', {
            properties: { tabColor: { argb: '28a745' } }
        });
        
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
        
        // Style en-tête
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
            
            if (index % 2 === 0) {
                excelRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F8F9FA' }
                };
            }
            
            // Colorer les documents manquants
            ['photo_identite', 'piece_identite', 'diplome_bac', 'releve_notes'].forEach((doc, colIndex) => {
                const cell = excelRow.getCell(23 + colIndex);
                if (cell.value === 'Non') {
                    cell.font = { color: { argb: 'DC3545' }, bold: true };
                } else {
                    cell.font = { color: { argb: '28a745' }, bold: true };
                }
            });
        });
        
        // Bordures
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
        
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
        
        // FEUILLE 2: Statistiques par Faculté
        const statsSheet = workbook.addWorksheet('Statistiques par Faculté', {
            properties: { tabColor: { argb: '667eea' } }
        });
        
        const statsResult = await pool.query(`
            SELECT 
                fac.nom as faculte, fac.libelle as faculte_libelle,
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
        
        statsResult.rows.forEach(row => statsSheet.addRow(row));
        
        // FEUILLE 3: Par Filière
        const filiereSheet = workbook.addWorksheet('Par Filière', {
            properties: { tabColor: { argb: 'ffc107' } }
        });
        
        const filiereResult = await pool.query(`
            SELECT 
                a.premier_choix as filiere, f.libelle as filiere_libelle,
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
        
        filiereResult.rows.forEach(row => filiereSheet.addRow(row));
        
        const filename = `Dossiers_Approuves_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
        
        console.log(`Export Excel de ${result.rows.length} dossiers approuvés`);
    } catch (error) {
        console.error('Erreur export Excel:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de l\'export Excel',
            details: error.message 
        });
    }
};

// =================== EXPORT PAR SECTION ===================

exports.exportParSection = async (req, res) => {
    try {
        const { type } = req.params;
        const { filter } = req.query;
        
        console.log(`Export section ${type}${filter ? ` - Filtre: ${filter}` : ''}`);
        
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
                            a.id, a.numero_dossier, a.numero_depot,
                            a.nom, a.prenom, 
                            TO_CHAR(a.date_naissance, 'DD/MM/YYYY') as date_naissance,
                            a.lieu_naissance, a.nationalite,
                            CASE WHEN a.genre = 'masculin' THEN 'Masculin' ELSE 'Féminin' END as genre,
                            a.adresse, a.telephone, a.email,
                            a.type_bac, a.lieu_obtention, a.annee_obtention, a.mention,
                            a.premier_choix, a.deuxieme_choix, a.troisieme_choix,
                            CASE 
                                WHEN a.statut = 'approuve' THEN 'Approuvé'
                                WHEN a.statut = 'rejete' THEN 'Rejeté'
                                ELSE 'En attente'
                            END as statut,
                            fac.nom as faculte, fac.libelle as faculte_libelle,
                            f.libelle as filiere_libelle,
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
                            a.id, a.numero_dossier, a.numero_depot,
                            a.nom, a.prenom, 
                            TO_CHAR(a.date_naissance, 'DD/MM/YYYY') as date_naissance,
                            a.lieu_naissance, a.nationalite,
                            CASE WHEN a.genre = 'masculin' THEN 'Masculin' ELSE 'Féminin' END as genre,
                            a.adresse, a.telephone, a.email,
                            a.type_bac, a.lieu_obtention, a.annee_obtention, a.mention,
                            a.premier_choix, a.deuxieme_choix, a.troisieme_choix,
                            CASE 
                                WHEN a.statut = 'approuve' THEN 'Approuvé'
                                WHEN a.statut = 'rejete' THEN 'Rejeté'
                                ELSE 'En attente'
                            END as statut,
                            fac.nom as faculte, fac.libelle as faculte_libelle,
                            f.libelle as filiere_libelle,
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
                        a.type_bac, a.premier_choix, a.deuxieme_choix, a.troisieme_choix,
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
                    { header: 'GENRE', key: 'genre', width: 12 },
                    { header: 'NUMERO DOSSIER', key: 'numero_dossier', width: 15 },
                    { header: 'NOM', key: 'nom', width: 20 },
                    { header: 'PRENOM', key: 'prenom', width: 20 },
                    { header: 'EMAIL', key: 'email', width: 25 },
                    { header: 'TELEPHONE', key: 'telephone', width: 15 },
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
                        a.type_bac, a.premier_choix, a.deuxieme_choix, a.troisieme_choix,
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
                    { header: 'NUMERO DOSSIER', key: 'numero_dossier', width: 15 },
                    { header: 'NUMERO DEPOT', key: 'numero_depot', width: 15 },
                    { header: 'NOM', key: 'nom', width: 20 },
                    { header: 'PRENOM', key: 'prenom', width: 20 },
                    { header: 'EMAIL', key: 'email', width: 25 },
                    { header: 'TELEPHONE', key: 'telephone', width: 15 },
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
        
        const result = await pool.query(query, params);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Aucune donnée trouvée pour ces critères',
                type,
                filter 
            });
        }
        
        // Créer workbook Excel
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheetName);
        
        worksheet.columns = columns;
        
        // Style en-tête
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '667eea' }
        };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(1).height = 25;
        
        // Ajouter données
        result.rows.forEach((row, index) => {
            const excelRow = worksheet.addRow(row);
            
            if (index % 2 === 0) {
                excelRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F8F9FA' }
                };
            }
        });
        
        // Bordures
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
        
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
        
        console.log(`Export ${type} - ${result.rows.length} lignes`);
        
    } catch (error) {
        console.error('Erreur export section:', error);
        res.status(500).json({ 
            error: 'Erreur lors de l\'export',
            details: error.message 
        });
    }
};

// =================== EXPORT UTILISATEURS (CSV) ===================

exports.exportUsers = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT nom, email, telephone, role, 
                   TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as date_inscription
            FROM users 
            ORDER BY created_at DESC
        `);
        
        const headers = 'Nom,Email,Téléphone,Rôle,Date d\'inscription';
        const rows = result.rows.map(row => 
            `"${row.nom}","${row.email}","${row.telephone}","${row.role}","${row.date_inscription}"`
        );
        
        const csv = [headers, ...rows].join('\n');
        const filename = `utilisateurs_${new Date().toISOString().split('T')[0]}.csv`;
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csv);
        
    } catch (error) {
        console.error('Erreur export users:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// =================== EXPORT CANDIDATURES BASIQUE (CSV) ===================

exports.exportApplications = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                a.numero_dossier, a.nom, a.prenom,
                TO_CHAR(a.date_naissance, 'DD/MM/YYYY') as date_naissance,
                a.lieu_naissance, a.lieu_obtention, a.nationalite, a.adresse,
                a.email, a.premier_choix, a.deuxieme_choix, a.troisieme_choix,
                a.type_bac, 
                CASE 
                    WHEN a.statut = 'approuve' THEN 'Approuvé'
                    WHEN a.statut = 'rejete' THEN 'Rejeté'
                    ELSE 'En attente'
                END as statut,
                TO_CHAR(a.created_at, 'DD/MM/YYYY') as date_depot
            FROM applications a
            ORDER BY a.created_at DESC
        `);
        
        const headers = 'Numéro dossier,Nom,Prénom,Date Naiss,Lieu Naiss,Lieu Obtention,Adresse,Nationalité,Email,Premier choix,Deuxième choix,Troisième choix,Type Bac,Statut,Date de dépôt';
        const rows = result.rows.map(row => 
            `"${row.numero_dossier}","${row.nom}","${row.prenom}","${row.date_naissance}","${row.lieu_naissance}","${row.lieu_obtention}","${row.adresse}","${row.nationalite}","${row.email}","${row.premier_choix}","${row.deuxieme_choix}","${row.troisieme_choix}","${row.type_bac}","${row.statut}","${row.date_depot}"`
        );
        
        const csv = [headers, ...rows].join('\n');
        const filename = `candidatures_${new Date().toISOString().split('T')[0]}.csv`;
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csv);
        
    } catch (error) {
        console.error('Erreur export applications:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// =================== EXPORT STATISTIQUES ===================

exports.exportStatistiques = async (req, res) => {
    try {
        const { type } = req.params;
        let query = '';
        let filename = '';
        let headers = '';
        
        switch(type) {
            case 'genre':
                query = `
                    SELECT 
                        CASE WHEN genre = 'masculin' THEN 'Masculin' ELSE 'Féminin' END as genre,
                        COUNT(*) as total,
                        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves,
                        COUNT(CASE WHEN statut = 'rejete' THEN 1 END) as rejetes,
                        COUNT(CASE WHEN statut = 'en-attente' THEN 1 END) as en_attente
                    FROM applications 
                    GROUP BY genre
                `;
                filename = 'statistiques_genre.csv';
                headers = 'Genre,Total,Approuvés,Rejetés,En attente';
                break;
                
            case 'filieres':
                query = `
                    SELECT 
                        a.premier_choix as filiere,
                        f.libelle as libelle_filiere,
                        COUNT(*) as total,
                        COUNT(CASE WHEN a.statut = 'approuve' THEN 1 END) as approuves,
                        COUNT(CASE WHEN a.statut = 'rejete' THEN 1 END) as rejetes,
                        COUNT(CASE WHEN a.statut = 'en-attente' THEN 1 END) as en_attente
                    FROM applications a
                    LEFT JOIN filieres f ON UPPER(TRIM(f.nom)) = UPPER(TRIM(a.premier_choix))
                    GROUP BY a.premier_choix, f.libelle
                    ORDER BY total DESC
                `;
                filename = 'statistiques_filieres.csv';
                headers = 'Filière,Libellé,Total,Approuvés,Rejetés,En attente';
                break;
                
            case 'type_bac':
                query = `
                    SELECT 
                        type_bac,
                        COUNT(*) as total,
                        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves,
                        COUNT(CASE WHEN statut = 'rejete' THEN 1 END) as rejetes,
                        COUNT(CASE WHEN statut = 'en-attente' THEN 1 END) as en_attente
                    FROM applications 
                    GROUP BY type_bac
                    ORDER BY total DESC
                `;
                filename = 'statistiques_type_bac.csv';
                headers = 'Type Bac,Total,Approuvés,Rejetés,En attente';
                break;
                
            default:
                return res.status(400).json({ error: 'Type de statistique invalide' });
        }
        
        const result = await pool.query(query);
        
        const rows = result.rows.map(row => 
            Object.values(row).map(val => `"${val || ''}"`).join(',')
        );
        
        const csv = [headers, ...rows].join('\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csv);
        
    } catch (error) {
        console.error('Erreur export statistiques:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// =================== EXPORT INSCRIPTIONS ===================

exports.exportInscriptions = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                e.matricule, e.numero_dossier, e.nom, e.prenom, e.email, e.telephone,
                f.nom as filiere, fac.nom as faculte,
                e.niveau, i.annee_universitaire, i.mode_paiement, i.montant,
                CASE 
                    WHEN i.statut_inscription = 'valide' THEN 'Validé'
                    WHEN i.statut_inscription = 'en-attente' THEN 'En attente'
                    ELSE i.statut_inscription
                END as statut_inscription,
                CASE 
                    WHEN i.statut_paiement = 'paye' THEN 'Payé'
                    WHEN i.statut_paiement = 'en-attente' THEN 'En attente'
                    ELSE i.statut_paiement
                END as statut_paiement,
                TO_CHAR(i.date_inscription, 'DD/MM/YYYY HH24:MI') as date_inscription
            FROM inscription i
            JOIN etudiant e ON i.etudiant_id = e.id
            LEFT JOIN filieres f ON e.filiere_id = f.id
            LEFT JOIN facultes fac ON f.faculte_id = fac.id
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
        
        // Style en-tête
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '667eea' }
        };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(1).height = 25;
        
        result.rows.forEach((row, index) => {
            const excelRow = worksheet.addRow(row);
            
            if (index % 2 === 0) {
                excelRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F8F9FA' }
                };
            }
        });
        
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
        
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
        
        const filename = `Inscriptions_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
        
    } catch (error) {
        console.error('Erreur export inscriptions:', error);
        res.status(500).json({ error: 'Erreur lors de l\'export' });
    }
};
module.exports = exports;