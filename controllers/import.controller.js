const { pool } = require('../config/database');
const ExcelJS = require('exceljs');
const fs = require('fs');

// =================== TÉLÉCHARGEMENT MODÈLE EXCEL ===================

exports.telechargerModeleEtudiants = async (req, res) => {
    try {
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
            { text: '⚠️ IMPORTANT : Filière et niveau sont OBLIGATOIRES et DÉFINITIFS' },
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
};

// =================== IMPORTATION DES ÉTUDIANTS ===================

exports.importerEtudiants = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Fichier Excel requis' });
        }
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(req.file.path);
        const worksheet = workbook.getWorksheet('Étudiants');
        
        if (!worksheet) {
            // Nettoyer le fichier uploadé
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Feuille "Étudiants" non trouvée dans le fichier' });
        }
        
        const etudiants = [];
        const erreurs = [];
        
        // Parser les données Excel
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
                
                // Validation des champs obligatoires
                const champsObligatoires = [
                    'numero_dossier', 'nom', 'prenom', 'date_naissance', 
                    'lieu_naissance', 'nationalite', 'genre', 'adresse', 
                    'telephone', 'email'
                ];
                
                const champsManquants = champsObligatoires.filter(champ => !etudiant[champ]);
                
                if (champsManquants.length > 0) {
                    throw new Error(`Champs obligatoires manquants: ${champsManquants.join(', ')}`);
                }
                
                // Validation du genre
                if (!['masculin', 'feminin'].includes(etudiant.genre)) {
                    throw new Error('Genre invalide (doit être "masculin" ou "feminin")');
                }
                
                // Validation filière et niveau
                if (etudiant.filiere && etudiant.niveau) {
                    if (!['L1', 'L2', 'L3', 'M1', 'M2'].includes(etudiant.niveau)) {
                        throw new Error('Niveau invalide (doit être L1, L2, L3, M1 ou M2)');
                    }
                } else if ((etudiant.filiere && !etudiant.niveau) || (!etudiant.filiere && etudiant.niveau)) {
                    throw new Error('Filière et niveau doivent être fournis ensemble');
                }
                
                // Validation email basique
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(etudiant.email)) {
                    throw new Error('Format email invalide');
                }
                
                etudiants.push(etudiant);
                
            } catch (error) {
                erreurs.push({ 
                    ligne: rowNumber, 
                    erreur: error.message 
                });
            }
        });
        
        if (etudiants.length === 0) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ 
                error: 'Aucune donnée valide trouvée dans le fichier',
                erreurs 
            });
        }
        
        // Insérer les étudiants dans la base de données
        const client = await pool.connect();
        let imported = 0;
        let updated = 0;
        const erreursImport = [];
        
        try {
            await client.query('BEGIN');
            
            for (const etudiant of etudiants) {
                try {
                    let filiereId = null;
                    
                    // Vérifier et récupérer l'ID de la filière si fournie
                    if (etudiant.filiere) {
                        const filiereResult = await client.query(
                            'SELECT id FROM filieres WHERE UPPER(nom) = UPPER($1) AND active = true',
                            [etudiant.filiere]
                        );
                        
                        if (filiereResult.rows.length === 0) {
                            throw new Error(`Filière "${etudiant.filiere}" non trouvée ou inactive`);
                        }
                        
                        filiereId = filiereResult.rows[0].id;
                    }
                    
                    // Vérifier si l'étudiant existe déjà
                    const existing = await client.query(
                        'SELECT id FROM etudiant WHERE numero_dossier = $1',
                        [etudiant.numero_dossier]
                    );
                    
                    if (existing.rows.length > 0) {
                        // Mise à jour de l'étudiant existant
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
                        // Insertion d'un nouvel étudiant
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
                    erreursImport.push({ 
                        etudiant: `${etudiant.nom} ${etudiant.prenom} (${etudiant.numero_dossier})`, 
                        erreur: error.message 
                    });
                }
            }
            
            await client.query('COMMIT');
            
            console.log(`✅ Import terminé: ${imported} nouveaux, ${updated} mis à jour, ${erreursImport.length} erreurs`);
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
        // Nettoyer le fichier uploadé
        fs.unlinkSync(req.file.path);
        
        res.json({
            success: true,
            imported,
            updated,
            total: etudiants.length,
            erreurs: [...erreurs, ...erreursImport],
            message: `Import terminé: ${imported} créé(s), ${updated} mis à jour`
        });
        
    } catch (error) {
        console.error('❌ Erreur import étudiants:', error);
        
        // Nettoyer le fichier en cas d'erreur
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            error: 'Erreur lors de l\'import des étudiants',
            details: error.message 
        });
    }
};

// =================== IMPORTATION DES CANDIDATURES (FUTURE) ===================

exports.importerCandidatures = async (req, res) => {
    try {
        res.status(501).json({ 
            error: 'Fonctionnalité non encore implémentée',
            message: 'L\'importation des candidatures sera disponible prochainement'
        });
    } catch (error) {
        console.error('❌ Erreur import candidatures:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: error.message 
        });
    }
};

module.exports = exports;