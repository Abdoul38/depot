const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');


router.get('/type-bacs', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                tb.id, 
                tb.nom, 
                tb.libelle, 
                tb.description,
                COUNT(DISTINCT ftb.filiere_id) as nombre_filieres
            FROM type_bacs tb
            LEFT JOIN filiere_type_bacs ftb ON tb.id = ftb.type_bac_id
            LEFT JOIN filieres f ON ftb.filiere_id = f.id AND f.active = true
            WHERE tb.active = true
            GROUP BY tb.id, tb.nom, tb.libelle, tb.description
            ORDER BY tb.nom
        `);
        
        res.json({ 
            success: true,
            typeBacs: result.rows,
            total: result.rows.length,
            message: `${result.rows.length} type(s) de bac disponible(s)`
        });
    } catch (error) {
        console.error('❌ Erreur récupération types de bac:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur lors de la récupération des types de bac',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =================== FILIÈRES PAR TYPE DE BAC ===================

/**
 * GET /api/public/filieres-by-bac/:typeBac
 * Récupère toutes les filières disponibles pour un type de bac donné
 * @param {string} typeBac - Nom du type de bac (ex: "BAC C", "BAC D")
 */
router.get('/filieres-by-bac/:typeBac', async (req, res) => {
    try {
        const { typeBac } = req.params;
        
        console.log(`🔍 Recherche filières pour type de bac: ${typeBac}`);
        
        const result = await pool.query(`
            SELECT DISTINCT 
                f.id, 
                f.nom, 
                f.libelle, 
                f.description, 
                f.capacite_max,
                fac.id as faculte_id,
                fac.nom as faculte_nom, 
                fac.libelle as faculte_libelle,
                COUNT(DISTINCT app.id) as nombre_candidatures,
                -- Vérifier si la capacité est atteinte
                CASE 
                    WHEN f.capacite_max IS NULL THEN true
                    WHEN COUNT(DISTINCT app.id) < f.capacite_max THEN true
                    ELSE false
                END as places_disponibles
            FROM filieres f
            JOIN facultes fac ON f.faculte_id = fac.id
            JOIN filiere_type_bacs ftb ON f.id = ftb.filiere_id
            JOIN type_bacs tb ON ftb.type_bac_id = tb.id
            LEFT JOIN applications app ON (
                f.nom = app.premier_choix OR 
                f.nom = app.deuxieme_choix OR 
                f.nom = app.troisieme_choix
            ) AND app.statut = 'approuve'
            WHERE f.active = true 
                AND fac.active = true 
                AND tb.active = true
                AND UPPER(TRIM(tb.nom)) = UPPER(TRIM($1))
            GROUP BY 
                f.id, f.nom, f.libelle, f.description, f.capacite_max, 
                fac.id, fac.nom, fac.libelle
            ORDER BY fac.nom, f.nom
        `, [typeBac]);
        
        console.log(`✅ ${result.rows.length} filières trouvées pour ${typeBac}`);
        
        // Enrichir les données avec des informations supplémentaires
        const filieres = result.rows.map(filiere => ({
            ...filiere,
            capacite_restante: filiere.capacite_max 
                ? Math.max(0, filiere.capacite_max - filiere.nombre_candidatures)
                : null,
            taux_remplissage: filiere.capacite_max
                ? Math.round((filiere.nombre_candidatures / filiere.capacite_max) * 100)
                : null
        }));
        
        res.json({ 
            success: true,
            filieres: filieres,
            total: filieres.length,
            typeBac: typeBac,
            message: `${filieres.length} filière(s) trouvée(s) pour le ${typeBac}`
        });
        
    } catch (error) {
        console.error('❌ Erreur récupération filières par bac:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur lors de la récupération des filières',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;