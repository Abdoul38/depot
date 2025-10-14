const { pool } = require('../config/database');

// =================== FACULTÉS ===================

// Récupérer toutes les facultés
exports.getFacultes = async (req, res) => {
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
};

// Créer une faculté
exports.creerFaculte = async (req, res) => {
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
        if (error.code === '23505') {
            res.status(400).json({ error: 'Une faculté avec ce nom existe déjà' });
        } else {
            console.error('Erreur création faculté:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
};

// Modifier une faculté
exports.modifierFaculte = async (req, res) => {
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
};

// Supprimer une faculté (soft delete)
exports.supprimerFaculte = async (req, res) => {
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
};

// =================== TYPES DE BAC ===================

// Récupérer tous les types de bac
exports.getTypeBacs = async (req, res) => {
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
};

// Créer un type de bac
exports.creerTypeBac = async (req, res) => {
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
};

// Modifier un type de bac
exports.modifierTypeBac = async (req, res) => {
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
};

// =================== FILIÈRES ===================

// Récupérer toutes les filières
exports.getFilieres = async (req, res) => {
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
};

// Créer une filière
exports.creerFiliere = async (req, res) => {
    try {
        const { nom, libelle, description, faculte_id, capacite_max, types_bac_ids } = req.body;
        
        if (!nom || !libelle || !faculte_id) {
            return res.status(400).json({ error: 'Le nom, le libellé et la faculté sont requis' });
        }
        
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
};

// =================== DIPLÔMES ===================

// Récupérer tous les diplômes
exports.getDiplomes = async (req, res) => {
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
        console.error('Erreur récupération diplômes:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: error.message 
        });
    }
};

// Créer un diplôme
exports.creerDiplome = async (req, res) => {
    try {
        const { libelle, faculte_id, filiere_id } = req.body;
        
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
        console.error('Erreur création diplôme:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: error.message 
        });
    }
};

// Modifier un diplôme
exports.modifierDiplome = async (req, res) => {
    try {
        const { id } = req.params;
        const { libelle, faculte_id, filiere_id, active } = req.body;
        
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
        console.error('Erreur modification diplôme:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: error.message 
        });
    }
};

// Supprimer un diplôme
exports.supprimerDiplome = async (req, res) => {
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
        console.error('Erreur suppression diplôme:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// =================== ROUTES PUBLIQUES ===================

// Facultés publiques (pour formulaires)
exports.getFacultesPublic = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nom, libelle FROM facultes WHERE active = true ORDER BY nom'
        );
        res.json({ facultes: result.rows });
    } catch (error) {
        console.error('Erreur récupération facultés publiques:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Types de bac publics
exports.getTypeBacsPublic = async (req, res) => {
    try {
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
        
        res.json({ 
            typeBacs: result.rows,
            message: `${result.rows.length} type(s) de bac disponible(s)`
        });
    } catch (error) {
        console.error('Erreur récupération types de bac publics:', error);
        res.status(500).json({ 
            error: 'Erreur serveur'
        });
    }
};

// Filières publiques avec filtrage
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
                       f.nom = app.premier_choix OR 
                       f.nom = app.deuxieme_choix OR 
                       f.nom = app.troisieme_choix
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
        res.status(500).json({ 
            error: 'Erreur serveur'
        });
    }
};

exports.getFilieresByFilters = async (req, res) => {
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
                       f.nom = app.premier_choix OR 
                       f.nom = app.deuxieme_choix OR 
                       f.nom = app.troisieme_choix
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
        res.status(500).json({ 
            error: 'Erreur serveur'
        });
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