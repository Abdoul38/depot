const { pool } = require('../config/database');
const paymentService = require('../services/paymentService');

// Initier un paiement
exports.initierPaiement = async (req, res) => {
    try {
        const {
            etudiant_id,
            annee_universitaire,
            operateur,
            telephone,
            montant
        } = req.body;

        if (!etudiant_id || !annee_universitaire || !operateur || !telephone || !montant) {
            return res.status(400).json({
                success: false,
                error: 'Paramètres manquants'
            });
        }

        // Vérifier l'étudiant
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

        // Vérifier paiement en cours
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
                error: 'Un paiement est déjà en cours',
                transaction: paiementEnCours.rows[0]
            });
        }

        // Initier le paiement
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

        // Enregistrer le paiement temporaire
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

        res.json({
            success: true,
            paiement: paiementTempResult.rows[0],
            transaction_id: paymentResult.transactionId,
            message: `Paiement initié avec ${operateur}`,
            instructions: `Validez le paiement de ${montant} FCFA sur votre téléphone`
        });

    } catch (error) {
        console.error('Erreur initiation paiement:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur',
            details: error.message
        });
    }
};

// Vérifier le statut d'un paiement
exports.verifierStatut = async (req, res) => {
    try {
        const { transaction_id } = req.params;

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

        // Vérifier expiration
        if (paiementTemp.expires_at < new Date() && paiementTemp.statut !== 'reussi') {
            await pool.query(`
                UPDATE paiement_temporaire
                SET statut = 'expire'
                WHERE transaction_id = $1
            `, [transaction_id]);

            return res.json({
                success: false,
                statut: 'expire',
                message: 'Le délai de paiement a expiré'
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
                error: 'Impossible de vérifier le statut'
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

        // Si paiement réussi : créer l'inscription
        if (nouveauStatut === 'reussi') {
            const client = await pool.connect();
            
            try {
                await client.query('BEGIN');
                
                // Créer l'inscription
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

                // Créer la transaction définitive
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

                // Supprimer le paiement temporaire
                await client.query(`
                    DELETE FROM paiement_temporaire WHERE transaction_id = $1
                `, [transaction_id]);

                await client.query('COMMIT');

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

        // Si échec
        if (nouveauStatut === 'echoue') {
            await pool.query(`
                UPDATE paiement_temporaire
                SET statut = 'echoue'
                WHERE transaction_id = $1
            `, [transaction_id]);

            return res.json({
                success: false,
                statut: 'echoue',
                message: 'Le paiement a échoué'
            });
        }

        // En cours
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
        console.error('Erreur vérification statut:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur',
            details: error.message
        });
    }
};

// Callback des opérateurs
exports.handleCallback = async (req, res) => {
    try {
        console.log('Callback reçu:', req.body);

        const { transaction_id, status, operator, data } = req.body;

        if (!transaction_id) {
            return res.status(400).json({ error: 'Transaction ID manquant' });
        }

        const transactionResult = await pool.query(`
            SELECT * FROM transactions_paiement
            WHERE transaction_id = $1
        `, [transaction_id]);

        if (transactionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Transaction non trouvée' });
        }

        const transaction = transactionResult.rows[0];

        let nouveauStatut = 'en-cours';
        
        if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(status)) {
            nouveauStatut = 'reussi';
        } else if (['FAILED', 'REJECTED', 'ERROR'].includes(status)) {
            nouveauStatut = 'echoue';
        } else if (['CANCELLED'].includes(status)) {
            nouveauStatut = 'annule';
        }

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

        res.json({
            success: true,
            message: 'Callback traité',
            transaction_id
        });

    } catch (error) {
        console.error('Erreur callback:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
};

// Historique des paiements d'une inscription
exports.getHistorique = async (req, res) => {
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
        console.error('Erreur historique:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
};

// Annuler un paiement (admin)
exports.annulerPaiement = async (req, res) => {
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
        console.error('Erreur annulation:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
};

// Statistiques des paiements
exports.getStatistiques = async (req, res) => {
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
        console.error('Erreur stats:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
};

// Obtenir les infos de paiement pour un opérateur
exports.getInfosPaiement = async (req, res) => {
    try {
        const { operateur } = req.params;
        
        const infos = paymentService.getInfosPaiement(operateur);
        
        res.json({
            success: true,
            infos: infos,
            instructions: `Envoyez ${req.query.montant || '50000'} FCFA au numéro ${infos.numero} via ${infos.name}`
        });
        
    } catch (error) {
        console.error('Erreur infos paiement:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
};

module.exports = exports;