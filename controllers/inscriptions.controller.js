const { pool } = require('../config/database');
const ExcelJS = require('exceljs');

// =================== RECHERCHE ÉTUDIANTS ===================
// =================== STATISTIQUES INSCRIPTIONS ===================

// Obtenir les statistiques globales des inscriptions
exports.getStatsInscriptions = async (req, res) => {
    try {
        console.log('📊 Récupération statistiques inscriptions...');
        
        // 1. Statistiques générales
        const statsGenerales = await pool.query(`
            SELECT 
                COUNT(DISTINCT e.id) FILTER (WHERE e.peut_inscrire = true) as etudiants_autorises,
                COUNT(DISTINCT i.etudiant_id) as etudiants_inscrits,
                COUNT(DISTINCT i.id) as total_inscriptions,
                COALESCE(SUM(i.montant), 0) as montant_total,
                COUNT(DISTINCT i.id) FILTER (WHERE i.statut_inscription = 'validee') as inscriptions_validees,
                COUNT(DISTINCT i.id) FILTER (WHERE i.statut_inscription = 'en-attente') as inscriptions_en_attente,
                COUNT(DISTINCT i.id) FILTER (WHERE i.statut_paiement = 'paye') as paiements_effectues,
                COUNT(DISTINCT i.id) FILTER (WHERE i.statut_paiement = 'en-attente') as paiements_en_attente
            FROM etudiant e
            LEFT JOIN inscription i ON e.id = i.etudiant_id 
                AND i.annee_universitaire = '2024-2025'
                AND i.statut_inscription != 'annulee'
        `);
        
        // 2. Évolution par jour (30 derniers jours)
        const evolutionJours = await pool.query(`
            SELECT 
                DATE(date_inscription) as jour,
                COUNT(*) as nombre_inscriptions,
                COALESCE(SUM(montant), 0) as montant_jour
            FROM inscription
            WHERE date_inscription >= CURRENT_DATE - INTERVAL '30 days'
                AND statut_inscription != 'annulee'
            GROUP BY DATE(date_inscription)
            ORDER BY jour DESC
            LIMIT 30
        `);
        
        // 3. Répartition par filière
        const repartitionFiliere = await pool.query(`
            SELECT 
                f.libelle as filiere,
                COUNT(DISTINCT i.id) as nombre_inscriptions,
                COALESCE(SUM(i.montant), 0) as montant_total
            FROM inscription i
            JOIN etudiant e ON i.etudiant_id = e.id
            JOIN filieres f ON e.filiere_id = f.id
            WHERE i.annee_universitaire = '2024-2025'
                AND i.statut_inscription != 'annulee'
            GROUP BY f.libelle
            ORDER BY nombre_inscriptions DESC
            LIMIT 10
        `);
        
        // 4. Répartition par niveau
        const repartitionNiveau = await pool.query(`
            SELECT 
                e.niveau,
                COUNT(DISTINCT i.id) as nombre_inscriptions,
                COALESCE(SUM(i.montant), 0) as montant_total
            FROM inscription i
            JOIN etudiant e ON i.etudiant_id = e.id
            WHERE i.annee_universitaire = '2024-2025'
                AND i.statut_inscription != 'annulee'
            GROUP BY e.niveau
            ORDER BY 
                CASE e.niveau
                    WHEN 'L1' THEN 1
                    WHEN 'L2' THEN 2
                    WHEN 'L3' THEN 3
                    WHEN 'M1' THEN 4
                    WHEN 'M2' THEN 5
                    ELSE 6
                END
        `);
        
        // 5. Modes de paiement
        const repartitionPaiement = await pool.query(`
            SELECT 
                mode_paiement,
                COUNT(*) as nombre,
                COALESCE(SUM(montant), 0) as montant_total
            FROM inscription
            WHERE annee_universitaire = '2024-2025'
                AND statut_inscription != 'annulee'
                AND mode_paiement IS NOT NULL
            GROUP BY mode_paiement
            ORDER BY nombre DESC
        `);
        
        // 6. Statistiques par genre
        const repartitionGenre = await pool.query(`
            SELECT 
                e.genre,
                COUNT(DISTINCT i.id) as nombre_inscriptions,
                COALESCE(SUM(i.montant), 0) as montant_total
            FROM inscription i
            JOIN etudiant e ON i.etudiant_id = e.id
            WHERE i.annee_universitaire = '2024-2025'
                AND i.statut_inscription != 'annulee'
            GROUP BY e.genre
        `);
        
        // 7. Top 5 dernières inscriptions
        const dernieresInscriptions = await pool.query(`
            SELECT 
                i.id,
                i.date_inscription,
                i.montant,
                i.statut_inscription,
                e.nom,
                e.prenom,
                e.matricule,
                e.niveau,
                f.libelle as filiere
            FROM inscription i
            JOIN etudiant e ON i.etudiant_id = e.id
            LEFT JOIN filieres f ON e.filiere_id = f.id
            WHERE i.annee_universitaire = '2024-2025'
            ORDER BY i.date_inscription DESC
            LIMIT 5
        `);
        
        const stats = statsGenerales.rows[0];
        
        console.log('✅ Statistiques récupérées:', {
            autorises: stats.etudiants_autorises,
            inscrits: stats.etudiants_inscrits,
            montant_total: stats.montant_total
        });
        
        res.json({
            success: true,
            stats: {
                generales: {
                    etudiants_autorises: parseInt(stats.etudiants_autorises),
                    etudiants_inscrits: parseInt(stats.etudiants_inscrits),
                    total_inscriptions: parseInt(stats.total_inscriptions),
                    montant_total: parseFloat(stats.montant_total),
                    inscriptions_validees: parseInt(stats.inscriptions_validees),
                    inscriptions_en_attente: parseInt(stats.inscriptions_en_attente),
                    paiements_effectues: parseInt(stats.paiements_effectues),
                    paiements_en_attente: parseInt(stats.paiements_en_attente),
                    taux_inscription: stats.etudiants_autorises > 0 
                        ? ((stats.etudiants_inscrits / stats.etudiants_autorises) * 100).toFixed(2)
                        : 0,
                    montant_moyen: stats.etudiants_inscrits > 0
                        ? (stats.montant_total / stats.etudiants_inscrits).toFixed(2)
                        : 0
                },
                evolutionJours: evolutionJours.rows.map(row => ({
                    jour: row.jour,
                    nombre_inscriptions: parseInt(row.nombre_inscriptions),
                    montant_jour: parseFloat(row.montant_jour)
                })),
                repartitionFiliere: repartitionFiliere.rows.map(row => ({
                    filiere: row.filiere,
                    nombre_inscriptions: parseInt(row.nombre_inscriptions),
                    montant_total: parseFloat(row.montant_total)
                })),
                repartitionNiveau: repartitionNiveau.rows.map(row => ({
                    niveau: row.niveau,
                    nombre_inscriptions: parseInt(row.nombre_inscriptions),
                    montant_total: parseFloat(row.montant_total)
                })),
                repartitionPaiement: repartitionPaiement.rows.map(row => ({
                    mode_paiement: row.mode_paiement,
                    nombre: parseInt(row.nombre),
                    montant_total: parseFloat(row.montant_total)
                })),
                repartitionGenre: repartitionGenre.rows.map(row => ({
                    genre: row.genre,
                    nombre_inscriptions: parseInt(row.nombre_inscriptions),
                    montant_total: parseFloat(row.montant_total)
                })),
                dernieres: dernieresInscriptions.rows
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur stats inscriptions:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération des statistiques',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// FONCTION FRONTEND - À ajouter dans apiClient.js


// Rechercher un nouveau étudiant (par numéro de dossier)
exports.rechercherNouveauEtudiant = async (req, res) => {
    try {
        const { numeroDossier } = req.params;
        
        console.log('🔍 Recherche nouveau étudiant:', numeroDossier);
        
        // ✅ 1. VÉRIFIER LE STATUT GLOBAL DES INSCRIPTIONS
        const configResult = await pool.query(`
            SELECT actif FROM config_inscription 
            ORDER BY created_at DESC 
            LIMIT 1
        `);
        
        if (configResult.rows.length > 0 && configResult.rows[0].actif === false) {
            console.log('🚫 Inscriptions fermées');
            return res.json({ 
                success: false, 
                error: 'Les inscriptions sont actuellement fermées'
            });
        }
        
        // 2. Rechercher l'étudiant
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
              AND e.statut = 'actif'
        `, [numeroDossier]);
        
        if (result.rows.length === 0) {
            console.log('❌ Étudiant non trouvé');
            return res.json({ 
                success: false, 
                error: 'Aucun dossier trouvé avec ce numéro'
            });
        }
        
        const etudiant = result.rows[0];
        
        // ✅ 3. VÉRIFIER SI L'ÉTUDIANT PEUT S'INSCRIRE
        if (!etudiant.peut_inscrire) {
            console.log('🚫 Étudiant non autorisé à s\'inscrire');
            return res.json({ 
                success: false, 
                error: 'Vous n\'êtes pas autorisé à vous inscrire actuellement. Contactez l\'administration.'
            });
        }
        
        console.log('✅ Étudiant trouvé et autorisé');
        res.json({ success: true, etudiant: etudiant });
        
    } catch (error) {
        console.error('❌ Erreur recherche étudiant:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur' 
        });
    }
};

// ========== AMÉLIORER AUSSI rechercherAncienEtudiant ==========

exports.rechercherAncienEtudiant = async (req, res) => {
    try {
        const { matricule } = req.params;
        
        console.log('🔍 Recherche ancien étudiant:', matricule);
        
        // ✅ 1. VÉRIFIER LE STATUT GLOBAL DES INSCRIPTIONS
        const configResult = await pool.query(`
            SELECT actif FROM config_inscription 
            ORDER BY created_at DESC 
            LIMIT 1
        `);
        
        if (configResult.rows.length > 0 && configResult.rows[0].actif === false) {
            console.log('🚫 Inscriptions fermées');
            return res.json({ 
                success: false, 
                error: 'Les inscriptions sont actuellement fermées'
            });
        }
        
        // 2. Rechercher l'étudiant
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
              AND e.statut = 'actif'
        `, [matricule]);
        
        if (result.rows.length === 0) {
            console.log('❌ Étudiant non trouvé');
            return res.json({ 
                success: false, 
                error: 'Aucun étudiant trouvé avec ce matricule'
            });
        }
        
        const etudiant = result.rows[0];
        
        // ✅ 3. VÉRIFIER SI L'ÉTUDIANT PEUT S'INSCRIRE
        if (!etudiant.peut_inscrire) {
            console.log('🚫 Étudiant non autorisé à s\'inscrire');
            return res.json({ 
                success: false, 
                error: 'Vous n\'êtes pas autorisé à vous inscrire actuellement. Contactez l\'administration.'
            });
        }
        
        console.log('✅ Étudiant trouvé et autorisé');
        res.json({ success: true, etudiant: etudiant });
        
    } catch (error) {
        console.error('❌ Erreur recherche étudiant:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur' 
        });
    }
};
// =================== VÉRIFICATIONS ===================

// Vérifier autorisation d'inscription
exports.verifierAutorisation = async (req, res) => {
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
        
        // Vérifier restrictions spécifiques
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
};

// Obtenir le statut des inscriptions (public)
exports.getStatutInscriptions = async (req, res) => {
    try {
        console.log('🔍 Récupération du statut des inscriptions');
        
        const result = await pool.query(`
            SELECT * FROM config_inscription 
            ORDER BY created_at DESC 
            LIMIT 1
        `);
        
        // Configuration par défaut si aucune config n'existe
        let config = {
            actif: false,
            annee_universitaire: '2024-2025',
            message_fermeture: 'Les inscriptions ne sont pas encore ouvertes.',
            date_ouverture: null,
            date_fermeture: null
        };
        
        if (result.rows.length > 0) {
            config = result.rows[0];
            
            // ✅ VÉRIFIER LES DATES AUTOMATIQUEMENT
            const maintenant = new Date();
            
            // Si date d'ouverture définie et pas encore atteinte
            if (config.date_ouverture) {
                const dateOuverture = new Date(config.date_ouverture);
                if (maintenant < dateOuverture) {
                    config.actif = false;
                    config.message_fermeture = `Les inscriptions ouvriront le ${dateOuverture.toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}`;
                }
            }
            
            // Si date de fermeture définie et dépassée
            if (config.date_fermeture) {
                const dateFermeture = new Date(config.date_fermeture);
                if (maintenant > dateFermeture) {
                    config.actif = false;
                    if (!config.message_fermeture || config.message_fermeture.trim() === '') {
                        config.message_fermeture = `Les inscriptions ont été fermées le ${dateFermeture.toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}`;
                    }
                }
            }
        }
        
        console.log('✅ Statut inscriptions:', {
            actif: config.actif,
            annee: config.annee_universitaire,
            message: config.message_fermeture
        });
        
        res.json({
            success: true,
            config: config,
            ouvert: config.actif === true,
            message: config.actif 
                ? 'Les inscriptions sont ouvertes' 
                : (config.message_fermeture || 'Les inscriptions sont fermées')
        });
        
    } catch (error) {
        console.error('❌ Erreur récupération statut:', error);
        
        // En cas d'erreur, on renvoie un statut fermé par sécurité
        res.status(500).json({ 
            success: false,
            ouvert: false,
            config: {
                actif: false,
                annee_universitaire: '2024-2025',
                message_fermeture: 'Erreur technique. Veuillez réessayer plus tard.'
            },
            error: 'Erreur serveur',
            message: 'Une erreur est survenue lors de la vérification du statut'
        });
    }
};

// =================== INSCRIPTION ===================

// Valider une inscription
// ========== FONCTION COMPLÈTE POUR inscription.controller.js ==========

exports.validerInscription = async (req, res) => {
    try {
        const { 
            etudiant_id, 
            annee_universitaire,
            mode_paiement,
            telephone_paiement,
            montant 
        } = req.body;
        
        console.log('📝 Validation inscription pour étudiant:', etudiant_id);
        
        // ========== 1. VÉRIFICATIONS PRÉALABLES ==========
        
        // Vérifier que l'étudiant existe et a les données nécessaires
        const etudiantCheck = await pool.query(`
            SELECT e.*, f.nom as filiere, f.libelle as filiere_libelle
            FROM etudiant e
            LEFT JOIN filieres f ON e.filiere_id = f.id
            WHERE e.id = $1
        `, [etudiant_id]);
        
        if (etudiantCheck.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Étudiant non trouvé' 
            });
        }
        
        const etudiant = etudiantCheck.rows[0];
        
        // Vérifier que l'étudiant a une filière et un niveau
        if (!etudiant.filiere_id || !etudiant.niveau) {
            return res.status(400).json({ 
                success: false,
                error: 'L\'étudiant doit avoir une filière et un niveau définis avant de s\'inscrire' 
            });
        }
        
        // Vérifier si l'étudiant peut s'inscrire
        if (!etudiant.peut_inscrire) {
            return res.status(403).json({ 
                success: false,
                error: 'Cet étudiant n\'est pas autorisé à s\'inscrire' 
            });
        }
        
        // ========== 2. VÉRIFIER LES RESTRICTIONS ==========
        
        const restrictions = await pool.query(`
            SELECT * FROM restriction_inscription 
            WHERE actif = true 
            AND (
                (type = 'etudiant' AND etudiant_id = $1) OR
                (type = 'filiere' AND filiere_id = $2) OR
                (type = 'niveau' AND niveau = $3) OR
                (type = 'filiere_niveau' AND filiere_id = $2 AND niveau = $3)
            )
        `, [etudiant_id, etudiant.filiere_id, etudiant.niveau]);
        
        if (restrictions.rows.length > 0) {
            return res.status(403).json({ 
                success: false,
                error: 'Inscription non autorisée',
                raison: restrictions.rows[0].raison 
            });
        }
        
        // ========== 3. VÉRIFIER INSCRIPTION EXISTANTE ==========
        
        const inscriptionExistante = await pool.query(`
            SELECT id FROM inscription 
            WHERE etudiant_id = $1 
            AND annee_universitaire = $2
            AND statut_inscription != 'annulee'
        `, [etudiant_id, annee_universitaire]);
        
        if (inscriptionExistante.rows.length > 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Une inscription existe déjà pour cette année universitaire' 
            });
        }
        
        // ========== 4. CRÉER L'INSCRIPTION ==========
        
        const result = await pool.query(`
            INSERT INTO inscription (
                etudiant_id, 
                annee_universitaire,
                date_inscription,
                statut_inscription,
                mode_paiement, 
                telephone_paiement, 
                montant,
                statut_paiement
            ) VALUES ($1, $2, NOW(), 'validee', $3, $4, $5, 'en-attente')
            RETURNING *
        `, [
            etudiant_id, 
            annee_universitaire || '2024-2025',
            mode_paiement,
            telephone_paiement,
            montant || 10000
        ]);
        
        console.log('✅ Inscription créée avec ID:', result.rows[0].id);
        
        // ========== 5. RÉCUPÉRER LES DONNÉES COMPLÈTES POUR LE REÇU ==========
        
        const inscriptionComplete = await pool.query(`
            SELECT 
                i.id,
                i.etudiant_id,
                i.annee_universitaire,
                i.date_inscription,
                i.statut_inscription,
                i.mode_paiement,
                i.telephone_paiement,
                i.montant,
                i.statut_paiement,
                
                -- Données étudiant
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
                
                -- Données filière
                f.nom as filiere,
                f.libelle as filiere_libelle,
                
                -- Données faculté
                fac.nom as faculte,
                fac.libelle as faculte_libelle
                
            FROM inscription i
            JOIN etudiant e ON i.etudiant_id = e.id
            LEFT JOIN filieres f ON e.filiere_id = f.id
            LEFT JOIN facultes fac ON f.faculte_id = fac.id
            WHERE i.id = $1
        `, [result.rows[0].id]);
        
        if (inscriptionComplete.rows.length === 0) {
            throw new Error('Erreur lors de la récupération des données d\'inscription');
        }
        
        const inscriptionData = inscriptionComplete.rows[0];
        
        console.log('📄 Données complètes récupérées:', {
            id: inscriptionData.id,
            matricule: inscriptionData.matricule,
            nom: inscriptionData.nom,
            prenom: inscriptionData.prenom,
            filiere: inscriptionData.filiere_libelle,
            niveau: inscriptionData.niveau
        });
        
        // ========== 6. RETOURNER LES DONNÉES ==========
        
        res.json({ 
            success: true,
            inscription_id: inscriptionData.id,
            inscription: inscriptionData,
            message: 'Inscription validée avec succès'
        });
        
    } catch (error) {
        console.error('❌ Erreur validation inscription:', error);
        
        // Gestion des erreurs spécifiques
        if (error.code === '23505') { // Violation de contrainte unique
            return res.status(400).json({ 
                success: false,
                error: 'Une inscription existe déjà pour cet étudiant' 
            });
        }
        
        if (error.code === '23503') { // Violation de clé étrangère
            return res.status(400).json({ 
                success: false,
                error: 'Étudiant ou filière invalide' 
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Erreur lors de la validation de l\'inscription',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ========== FONCTION BONUS: RÉCUPÉRER UNE INSCRIPTION POUR LE REÇU ==========

exports.getInscriptionPourRecu = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT 
                i.id,
                i.etudiant_id,
                i.annee_universitaire,
                i.date_inscription,
                i.statut_inscription,
                i.mode_paiement,
                i.telephone_paiement,
                i.montant,
                i.statut_paiement,
                
                -- Données étudiant
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
                
                -- Données filière
                f.nom as filiere,
                f.libelle as filiere_libelle,
                
                -- Données faculté
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
            error: 'Erreur serveur' 
        });
    }
};

// ========== FONCTION BONUS: RÉCUPÉRER LE DERNIER REÇU D'UN ÉTUDIANT ==========

exports.getDernierRecuEtudiant = async (req, res) => {
    try {
        const { etudiant_id } = req.params;
        
        const result = await pool.query(`
            SELECT 
                i.id,
                i.etudiant_id,
                i.annee_universitaire,
                i.date_inscription,
                i.statut_inscription,
                i.mode_paiement,
                i.telephone_paiement,
                i.montant,
                i.statut_paiement,
                
                -- Données étudiant
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
                
                -- Données filière
                f.nom as filiere,
                f.libelle as filiere_libelle,
                
                -- Données faculté
                fac.nom as faculte,
                fac.libelle as faculte_libelle
                
            FROM inscription i
            JOIN etudiant e ON i.etudiant_id = e.id
            LEFT JOIN filieres f ON e.filiere_id = f.id
            LEFT JOIN facultes fac ON f.faculte_id = fac.id
            WHERE i.etudiant_id = $1
            AND i.statut_inscription = 'validee'
            ORDER BY i.date_inscription DESC
            LIMIT 1
        `, [etudiant_id]);
        
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
        console.error('Erreur récupération dernier reçu:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur' 
        });
    }
};



// =================== GESTION ADMIN ===================

// Obtenir toutes les inscriptions
exports.getInscriptions = async (req, res) => {
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
};

// Créer une inscription (admin)
exports.creerInscription = async (req, res) => {
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
};

// =================== CONFIGURATION ===================

// Obtenir la configuration
exports.getConfig = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM config_inscription 
            ORDER BY created_at DESC LIMIT 1
        `);
        
        if (result.rows.length === 0) {
            return res.json({ config: null });
        }
        
        res.json({ config: result.rows[0] });
    } catch (error) {
        console.error('Erreur récupération config:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Mettre à jour la configuration
exports.updateConfig = async (req, res) => {
    try {
        const { actif, annee_universitaire, date_ouverture, date_fermeture, message_fermeture } = req.body;
        
        const result = await pool.query(`
            INSERT INTO config_inscription (actif, annee_universitaire, date_ouverture, date_fermeture, message_fermeture)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (annee_universitaire) DO UPDATE SET
                actif = EXCLUDED.actif,
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
};

// Toggle global des inscriptions
exports.toggleInscriptionsGlobal = async (req, res) => {
    try {
        const { actif, raison } = req.body;
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Mettre à jour la configuration
            await client.query(`
                UPDATE config_inscription 
                SET actif = $1, 
                    message_fermeture = $2,
                    updated_at = NOW()
                WHERE annee_universitaire = '2024-2025'
            `, [actif, raison || '']);
            
            // Mettre à jour tous les étudiants
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
                message: actif ? 'Inscriptions débloquées' : 'Inscriptions bloquées',
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
};

// Obtenir le statut global
exports.getStatutGlobal = async (req, res) => {
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
        console.error('Erreur statut global:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur',
            details: error.message 
        });
    }
};

// =================== RESTRICTIONS ===================

// Obtenir toutes les restrictions
exports.getRestrictions = async (req, res) => {
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
};

// Créer une restriction
exports.creerRestriction = async (req, res) => {
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
};

// Toggle une restriction
exports.toggleRestriction = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            UPDATE restriction_inscription 
            SET actif = NOT actif, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id]);
        
        res.json({ success: true, restriction: result.rows[0] });
    } catch (error) {
        console.error('Erreur toggle restriction:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Supprimer une restriction
exports.supprimerRestriction = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query('DELETE FROM restriction_inscription WHERE id = $1', [id]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur suppression restriction:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// =================== EXPORT ===================

// Exporter les inscriptions
exports.exporterInscriptions = async (req, res) => {
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
};

module.exports = exports;