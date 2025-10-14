const { pool } = require('../config/database');

// =================== GESTION FILIÈRES ===================

// Récupérer toutes les filières (admin)
exports.getFilieres = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT f.*, 
                   fac.nom as faculte_nom, 
                   fac.libelle as faculte_libelle,
                   COUNT(DISTINCT app.id) as nombre_candidatures,
                   COUNT(DISTINCT CASE WHEN app.statut = 'approuve' THEN app.id END) as candidatures_approuvees,
                   ARRAY_AGG(DISTINCT tb.nom ORDER BY tb.nom) FILTER (WHERE tb.nom IS NOT NULL) as types_bac_autorises,
                   ARRAY_AGG(DISTINCT JSONB_BUILD_OBJECT(
                       'id', tb.id, 
                       'nom', tb.nom, 
                       'libelle', tb.libelle
                   )) FILTER (WHERE tb.id IS NOT NULL) as types_bac_details
            FROM filieres f
            JOIN facultes fac ON f.faculte_id = fac.id
            LEFT JOIN filiere_type_bacs ftb ON f.id = ftb.filiere_id
            LEFT JOIN type_bacs tb ON ftb.type_bac_id = tb.id AND tb.active = true
            LEFT JOIN applications app ON (
                UPPER(TRIM(f.nom)) = UPPER(TRIM(app.premier_choix)) OR 
                UPPER(TRIM(f.nom)) = UPPER(TRIM(app.deuxieme_choix)) OR 
                UPPER(TRIM(f.nom)) = UPPER(TRIM(app.troisieme_choix))
            )
            WHERE f.active = true AND fac.active = true
            GROUP BY f.id, fac.nom, fac.libelle
            ORDER BY fac.nom, f.nom
        `);
        
        res.json({ 
            success: true,
            filieres: result.rows 
        });
    } catch (error) {
        console.error('Erreur récupération filières:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur',
            details: error.message 
        });
    }
};

// Récupérer une filière spécifique
exports.getFiliere = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT f.*, 
                   fac.nom as faculte_nom, 
                   fac.libelle as faculte_libelle,
                   COUNT(DISTINCT app.id) as nombre_candidatures,
                   COUNT(DISTINCT CASE WHEN app.statut = 'approuve' THEN app.id END) as candidatures_approuvees,
                   ARRAY_AGG(DISTINCT tb.nom) FILTER (WHERE tb.nom IS NOT NULL) as types_bac_autorises,
                   ARRAY_AGG(DISTINCT tb.libelle) FILTER (WHERE tb.libelle IS NOT NULL) as types_bac_libelles
            FROM filieres f
            JOIN facultes fac ON f.faculte_id = fac.id
            LEFT JOIN filiere_type_bacs ftb ON f.id = ftb.filiere_id
            LEFT JOIN type_bacs tb ON ftb.type_bac_id = tb.id AND tb.active = true
            LEFT JOIN applications app ON (
                UPPER(TRIM(f.nom)) = UPPER(TRIM(app.premier_choix)) OR 
                UPPER(TRIM(f.nom)) = UPPER(TRIM(app.deuxieme_choix)) OR 
                UPPER(TRIM(f.nom)) = UPPER(TRIM(app.troisieme_choix))
            )
            WHERE f.id = $1 AND f.active = true
            GROUP BY f.id, fac.nom, fac.libelle
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Filière non trouvée' });
        }
        
        res.json({ 
            success: true,
            filiere: result.rows[0] 
        });
    } catch (error) {
        console.error('Erreur récupération filière:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Créer une filière
exports.creerFiliere = async (req, res) => {
    try {
        const { nom, libelle, description, faculte_id, capacite_max, types_bac_ids } = req.body;
        
        if (!nom || !libelle || !faculte_id) {
            return res.status(400).json({ 
                error: 'Le nom, le libellé et la faculté sont requis' 
            });
        }
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Créer la filière
            const filiereResult = await client.query(
                `INSERT INTO filieres (nom, libelle, description, faculte_id, capacite_max) 
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [nom.toUpperCase().trim(), libelle.trim(), description?.trim() || null, 
                 faculte_id, capacite_max || null]
            );
            
            const filiere = filiereResult.rows[0];
            
            // Ajouter les types de bac autorisés
            if (types_bac_ids && Array.isArray(types_bac_ids) && types_bac_ids.length > 0) {
                for (const typeBacId of types_bac_ids) {
                    await client.query(
                        'INSERT INTO filiere_type_bacs (filiere_id, type_bac_id) VALUES ($1, $2)',
                        [filiere.id, typeBacId]
                    );
                }
            }
            
            await client.query('COMMIT');
            
            res.status(201).json({ 
                success: true,
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
            res.status(400).json({ 
                error: 'Une filière avec ce nom existe déjà dans cette faculté' 
            });
        } else {
            console.error('Erreur création filière:', error);
            res.status(500).json({ 
                error: 'Erreur serveur',
                details: error.message 
            });
        }
    }
};

// Modifier une filière
exports.modifierFiliere = async (req, res) => {
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
                await client.query(
                    'DELETE FROM filiere_type_bacs WHERE filiere_id = $1', 
                    [id]
                );
                
                // Ajouter les nouvelles associations
                if (Array.isArray(types_bac_ids) && types_bac_ids.length > 0) {
                    for (const typeBacId of types_bac_ids) {
                        await client.query(
                            'INSERT INTO filiere_type_bacs (filiere_id, type_bac_id) VALUES ($1, $2)',
                            [id, typeBacId]
                        );
                    }
                }
            }
            
            await client.query('COMMIT');
            
            res.json({ 
                success: true,
                message: 'Filière mise à jour avec succès', 
                filiere: result.rows[0] 
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Erreur modification filière:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: error.message 
        });
    }
};

// Supprimer une filière (soft delete)
exports.supprimerFiliere = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'UPDATE filieres SET active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Filière non trouvée' });
        }
        
        res.json({ 
            success: true,
            message: 'Filière supprimée avec succès' 
        });
    } catch (error) {
        console.error('Erreur suppression filière:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Mettre à jour les types de bac d'une filière
exports.updateTypesBac = async (req, res) => {
    try {
        const { id } = req.params;
        const { types_bac_ids } = req.body;
        
        if (!Array.isArray(types_bac_ids)) {
            return res.status(400).json({ 
                error: 'types_bac_ids doit être un tableau' 
            });
        }
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Supprimer les anciennes associations
            await client.query(
                'DELETE FROM filiere_type_bacs WHERE filiere_id = $1', 
                [id]
            );
            
            // Ajouter les nouvelles associations
            for (const typeBacId of types_bac_ids) {
                await client.query(
                    'INSERT INTO filiere_type_bacs (filiere_id, type_bac_id) VALUES ($1, $2)',
                    [id, typeBacId]
                );
            }
            
            await client.query('COMMIT');
            
            res.json({ 
                success: true,
                message: 'Types de bac mis à jour avec succès' 
            });
            
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
};

// Vérifier la disponibilité d'une filière
exports.checkDisponibilite = async (req, res) => {
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
                UPPER(TRIM(f.nom)) = UPPER(TRIM(app.premier_choix)) OR 
                UPPER(TRIM(f.nom)) = UPPER(TRIM(app.deuxieme_choix)) OR 
                UPPER(TRIM(f.nom)) = UPPER(TRIM(app.troisieme_choix))
            )
            WHERE UPPER(TRIM(f.nom)) = UPPER(TRIM($1)) AND f.active = true
            GROUP BY f.id, f.capacite_max
        `, [nom]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Filière non trouvée' });
        }
        
        const availability = result.rows[0];
        availability.message = availability.places_disponibles_bool ? 
            'Places disponibles' : 
            'Capacité maximale atteinte';
            
        res.json({ 
            success: true,
            availability 
        });
    } catch (error) {
        console.error('Erreur vérification disponibilité:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// =================== ROUTES PUBLIQUES ===================

// Filières actives (public)
exports.getFilieresActives = async (req, res) => {
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
};

// Filières avec filtres (public)
exports.getFilieresPublic = async (req, res) => {
    try {
        const { faculte_id, type_bac } = req.query;
        
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
                       UPPER(TRIM(f.nom)) = UPPER(TRIM(app.premier_choix)) OR 
                       UPPER(TRIM(f.nom)) = UPPER(TRIM(app.deuxieme_choix)) OR 
                       UPPER(TRIM(f.nom)) = UPPER(TRIM(app.troisieme_choix))
                   )
                   WHERE ` + conditions.join(' AND ') + `
                   GROUP BY f.id, f.nom, f.libelle, f.capacite_max, f.description,
                            fac.nom, fac.libelle
                   ORDER BY fac.nom, f.nom`;
        
        const result = await pool.query(query, params);
        
        res.json({ 
            filieres: result.rows,
            filters: { faculte_id, type_bac },
            count: result.rows.length
        });
    } catch (error) {
        console.error('Erreur récupération filières publiques:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Filières par type de bac
exports.getFilieresByBac = async (req, res) => {
    try {
        const { typeBac } = req.params;
        
        const result = await pool.query(`
            SELECT DISTINCT f.id, f.nom, f.libelle, f.description, f.capacite_max,
                   fac.nom as faculte_nom, fac.libelle as faculte_libelle,
                   COUNT(app.id) as nombre_candidatures
            FROM filieres f
            JOIN facultes fac ON f.faculte_id = fac.id
            JOIN filiere_type_bacs ftb ON f.id = ftb.filiere_id
            JOIN type_bacs tb ON ftb.type_bac_id = tb.id
            LEFT JOIN applications app ON (
                UPPER(TRIM(f.nom)) = UPPER(TRIM(app.premier_choix)) OR 
                UPPER(TRIM(f.nom)) = UPPER(TRIM(app.deuxieme_choix)) OR 
                UPPER(TRIM(f.nom)) = UPPER(TRIM(app.troisieme_choix))
            )
            WHERE f.active = true 
                AND fac.active = true 
                AND tb.active = true
                AND tb.nom = $1
            GROUP BY f.id, f.nom, f.libelle, f.description, f.capacite_max, 
                     fac.nom, fac.libelle
            ORDER BY fac.nom, f.nom
        `, [typeBac]);
        
        res.json({ 
            filieres: result.rows,
            message: `${result.rows.length} filière(s) trouvée(s) pour le ${typeBac}`
        });
    } catch (error) {
        console.error('Erreur récupération filières par bac:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: error.message
        });
    }
};

module.exports = exports;