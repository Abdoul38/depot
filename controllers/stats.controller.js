const { pool } = require('../config/database');

// =================== CONTRÔLEURS STATISTIQUES ===================

// Dashboard principal
exports.getDashboard = async (req, res) => {
    console.log('=== DÉBUT ROUTE DASHBOARD ===');
    
    try {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        console.log('User:', req.user?.email, 'Role:', req.user?.role);
        
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Accès administrateur requis'
            });
        }
        
        // Test connexion DB
        await pool.query('SELECT 1');
        
        // Compter les applications
        const countResult = await pool.query('SELECT COUNT(*) as total FROM applications');
        const totalApps = parseInt(countResult.rows[0].total);
        
        if (totalApps === 0) {
            return res.json({
                success: true,
                message: 'Aucune candidature trouvée',
                general: {
                    total_candidatures: 0,
                    approuves: 0,
                    rejetes: 0,
                    en_attente: 0,
                    hommes: 0,
                    femmes: 0
                },
                topFilieres: [],
                repartitionBac: [],
                evolution: []
            });
        }
        
        // Statistiques générales
        const generalResult = await pool.query(`
            SELECT 
                COUNT(*) as total_candidatures,
                COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves,
                COUNT(CASE WHEN statut = 'rejete' THEN 1 END) as rejetes,
                COUNT(CASE WHEN statut = 'en-attente' THEN 1 END) as en_attente,
                COUNT(CASE WHEN genre = 'masculin' THEN 1 END) as hommes,
                COUNT(CASE WHEN genre = 'feminin' THEN 1 END) as femmes
            FROM applications
        `);
        
        const generalData = {
            total_candidatures: parseInt(generalResult.rows[0].total_candidatures) || 0,
            approuves: parseInt(generalResult.rows[0].approuves) || 0,
            rejetes: parseInt(generalResult.rows[0].rejetes) || 0,
            en_attente: parseInt(generalResult.rows[0].en_attente) || 0,
            hommes: parseInt(generalResult.rows[0].hommes) || 0,
            femmes: parseInt(generalResult.rows[0].femmes) || 0
        };
        
        // Top filières
        const filieresResult = await pool.query(`
            SELECT premier_choix as filiere, COUNT(*) as nombre
            FROM applications 
            WHERE premier_choix IS NOT NULL AND TRIM(premier_choix) != '' 
            GROUP BY premier_choix 
            ORDER BY nombre DESC 
            LIMIT 5
        `);
        
        const topFilieres = filieresResult.rows.map(f => ({
            filiere: f.filiere,
            nombre: parseInt(f.nombre)
        }));
        
        // Répartition bac
        const bacResult = await pool.query(`
            SELECT type_bac, COUNT(*) as nombre
            FROM applications 
            WHERE type_bac IS NOT NULL AND TRIM(type_bac) != ''
            GROUP BY type_bac 
            ORDER BY nombre DESC
            LIMIT 10
        `);
        
        const repartitionBac = bacResult.rows.map(b => ({
            type_bac: b.type_bac,
            nombre: parseInt(b.nombre)
        }));
        
        // Évolution temporelle
        const evolutionResult = await pool.query(`
            SELECT 
                TO_CHAR(created_at, 'Mon YYYY') as mois,
                COUNT(*) as candidatures,
                DATE_TRUNC('month', created_at) as mois_date
            FROM applications 
            WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY TO_CHAR(created_at, 'Mon YYYY'), DATE_TRUNC('month', created_at)
            ORDER BY mois_date
        `);
        
        const evolution = evolutionResult.rows.map(e => ({
            mois: e.mois,
            candidatures: parseInt(e.candidatures)
        }));
        
        const finalResponse = {
            success: true,
            timestamp: new Date().toISOString(),
            general: generalData,
            topFilieres: topFilieres,
            repartitionBac: repartitionBac,
            evolution: evolution
        };
        
        res.json(finalResponse);
        console.log('=== RÉPONSE ENVOYÉE AVEC SUCCÈS ===');
        
    } catch (error) {
        console.error('=== ERREUR GLOBALE DASHBOARD ===', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur',
            details: error.message
        });
    }
};

exports.getStatsTemporelles = async (req, res) => {
    try {
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as mois,
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as mois_libelle,
        COUNT(*) as nombre_candidatures,
        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves,
        COUNT(CASE WHEN genre = 'masculin' THEN 1 END) as hommes,
        COUNT(CASE WHEN genre = 'feminin' THEN 1 END) as femmes
      FROM applications 
      WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at) 
      ORDER BY mois
    `);
    
    res.json({ 
      stats: result.rows,
      period: '12 derniers mois'
    });
  } catch (error) {
    console.error('Erreur statistiques temporelles:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
exports.getStatsMentionsFilieres=async (req,res )=> {
    try {
    const result = await pool.query(`
      SELECT 
        premier_choix as filiere,
        mention,
        COUNT(*) as nombre,
        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves
      FROM applications 
      GROUP BY premier_choix, mention 
      HAVING COUNT(*) > 0
      ORDER BY filiere, nombre DESC
    `);
    
    res.json({ 
      stats: result.rows
    });
  } catch (error) {
    console.error('Erreur statistiques mentions × filières:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
exports.getStatsGenreBac=async (req,res )=> {

try {
    const result = await pool.query(`
      SELECT 
        genre,
        type_bac,
        COUNT(*) as nombre,
        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves
      FROM applications 
      GROUP BY genre, type_bac 
      ORDER BY genre, nombre DESC
    `);
    
    res.json({ 
      stats: result.rows
    });
  } catch (error) {
    console.error('Erreur statistiques genre × bac:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
exports.getStatsByLieuObtention=async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        lieu_obtention,
        COUNT(*) as nombre,
        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves,
        COUNT(CASE WHEN statut = 'rejete' THEN 1 END) as rejetes,
        COUNT(CASE WHEN statut = 'en-attente' THEN 1 END) as en_attente,
        COUNT(DISTINCT type_bac) as diversite_bacs
      FROM applications 
      GROUP BY lieu_obtention 
      ORDER BY nombre DESC
    `);
    
    res.json({ 
      stats: result.rows,
      total: result.rows.reduce((sum, row) => sum + parseInt(row.nombre), 0)
    });
  } catch (error) {
    console.error('Erreur statistiques par lieu d\'obtention:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Statistiques par genre
exports.getStatsByGenre = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                genre,
                COUNT(*) as nombre,
                COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves,
                COUNT(CASE WHEN statut = 'rejete' THEN 1 END) as rejetes,
                COUNT(CASE WHEN statut = 'en-attente' THEN 1 END) as en_attente
            FROM applications 
            WHERE genre IS NOT NULL AND TRIM(genre) != ''
            GROUP BY genre 
            ORDER BY nombre DESC
        `);
        
        res.json({
            success: true,
            stats: result.rows.map(row => ({
                genre: row.genre,
                nombre: parseInt(row.nombre),
                approuves: parseInt(row.approuves),
                rejetes: parseInt(row.rejetes),
                en_attente: parseInt(row.en_attente)
            }))
        });
    } catch (error) {
        console.error('Erreur stats genre:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur serveur',
            details: error.message
        });
    }
};

// Statistiques par filières
exports.getStatsByFilieres = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                premier_choix as filiere,
                COUNT(*) as nombre,
                COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves
            FROM applications 
            WHERE premier_choix IS NOT NULL AND TRIM(premier_choix) != ''
            GROUP BY premier_choix 
            ORDER BY nombre DESC 
            LIMIT 15
        `);
        
        res.json({
            success: true,
            stats: result.rows.map(row => ({
                filiere: row.filiere,
                nombre: parseInt(row.nombre),
                approuves: parseInt(row.approuves)
            }))
        });
    } catch (error) {
        console.error('Erreur stats filières:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur serveur',
            details: error.message
        });
    }
};

// Statistiques par type de bac
exports.getStatsByTypeBac = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                type_bac,
                COUNT(*) as nombre,
                COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves
            FROM applications 
            WHERE type_bac IS NOT NULL AND TRIM(type_bac) != ''
            GROUP BY type_bac 
            ORDER BY nombre DESC
        `);
        
        res.json({
            success: true,
            stats: result.rows.map(row => ({
                type_bac: row.type_bac,
                nombre: parseInt(row.nombre),
                approuves: parseInt(row.approuves)
            }))
        });
    } catch (error) {
        console.error('Erreur stats type bac:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur serveur',
            details: error.message
        });
    }
};

// Statistiques par facultés
exports.getStatsByFacultes = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                fac.nom as faculte,
                fac.libelle as faculte_libelle,
                COUNT(DISTINCT f.id) as nombre_filieres,
                COUNT(CASE WHEN UPPER(TRIM(a.premier_choix)) = UPPER(TRIM(f.nom)) THEN a.id END)::integer as premier_choix,
                COUNT(CASE WHEN UPPER(TRIM(a.deuxieme_choix)) = UPPER(TRIM(f.nom)) THEN a.id END)::integer as deuxieme_choix,
                COUNT(CASE WHEN UPPER(TRIM(a.troisieme_choix)) = UPPER(TRIM(f.nom)) THEN a.id END)::integer as troisieme_choix,
                (COUNT(CASE WHEN UPPER(TRIM(a.premier_choix)) = UPPER(TRIM(f.nom)) THEN a.id END) +
                 COUNT(CASE WHEN UPPER(TRIM(a.deuxieme_choix)) = UPPER(TRIM(f.nom)) THEN a.id END) +
                 COUNT(CASE WHEN UPPER(TRIM(a.troisieme_choix)) = UPPER(TRIM(f.nom)) THEN a.id END))::integer as total_candidatures
            FROM facultes fac
            JOIN filieres f ON f.faculte_id = fac.id AND f.active = true
            LEFT JOIN applications a ON (
                UPPER(TRIM(a.premier_choix)) = UPPER(TRIM(f.nom)) OR
                UPPER(TRIM(a.deuxieme_choix)) = UPPER(TRIM(f.nom)) OR
                UPPER(TRIM(a.troisieme_choix)) = UPPER(TRIM(f.nom))
            )
            WHERE fac.active = true
            GROUP BY fac.id, fac.nom, fac.libelle
            HAVING COUNT(CASE WHEN UPPER(TRIM(a.premier_choix)) = UPPER(TRIM(f.nom)) THEN a.id END) +
                   COUNT(CASE WHEN UPPER(TRIM(a.deuxieme_choix)) = UPPER(TRIM(f.nom)) THEN a.id END) +
                   COUNT(CASE WHEN UPPER(TRIM(a.troisieme_choix)) = UPPER(TRIM(f.nom)) THEN a.id END) > 0
            ORDER BY total_candidatures DESC
        `);
        
        res.json({ 
            success: true,
            stats: result.rows,
            total: result.rows.reduce((sum, row) => sum + parseInt(row.total_candidatures || 0), 0)
        });
    } catch (error) {
        console.error('Erreur stats facultés:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur',
            details: error.message 
        });
    }
};

// Test de données
exports.getTestData = async (req, res) => {
    try {
        const countResult = await pool.query('SELECT COUNT(*) as total FROM applications');
        const totalApplications = parseInt(countResult.rows[0].total);
        
        if (totalApplications === 0) {
            return res.json({
                success: false,
                message: 'Aucun dossier trouvé en base de données',
                total: 0
            });
        }
        
        const sampleResult = await pool.query(`
            SELECT id, nom, prenom, genre, type_bac, premier_choix, statut, created_at 
            FROM applications 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        
        res.json({
            success: true,
            total_applications: totalApplications,
            sample_data: sampleResult.rows,
            message: 'Données récupérées avec succès'
        });
    } catch (error) {
        console.error('Erreur test données:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du test des données',
            details: error.message
        });
    }
};