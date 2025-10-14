const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

/**
 * Contrôleur pour la gestion des utilisateurs (Admin)
 */
class UsersController {
  
  /**
   * Récupérer tous les utilisateurs
   */
  async getAllUsers(req, res) {
    try {
      console.log('👥 Récupération utilisateurs');
      
      const result = await pool.query(`
        SELECT id, nom, email, telephone, role, created_at, updated_at
        FROM users 
        ORDER BY created_at DESC
      `);
      
      console.log(`✅ ${result.rows.length} utilisateurs récupérés`);
      
      res.json({ 
        success: true,
        users: result.rows,
        total: result.rows.length
      });
      
    } catch (error) {
      console.error('❌ Erreur récupération utilisateurs:', error);
      res.status(500).json({ 
        success: false,
        error: 'Erreur serveur' 
      });
    }
  }

  /**
   * Créer un nouvel utilisateur
   */
  async createUser(req, res) {
    try {
      const { nom, email, telephone, role, motDePasse } = req.body;
      
      console.log('➕ Création utilisateur:', email);
      
      // Validation
      if (!nom || !email || !telephone || !role || !motDePasse) {
        return res.status(400).json({ 
          success: false,
          error: 'Tous les champs sont requis' 
        });
      }
      
      // Vérifier si l'utilisateur existe déjà
      const existingUser = await pool.query(
        'SELECT * FROM users WHERE email = $1 OR telephone = $2',
        [email, telephone]
      );
      
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Un utilisateur avec cet email ou téléphone existe déjà' 
        });
      }
      
      // Hasher le mot de passe
      const hashedPassword = await bcrypt.hash(motDePasse, 10);
      
      // Insérer le nouvel utilisateur
      const result = await pool.query(
        `INSERT INTO users (nom, email, telephone, mot_de_passe, role, created_at) 
         VALUES ($1, $2, $3, $4, $5, NOW()) 
         RETURNING id, nom, email, telephone, role, created_at`,
        [nom, email, telephone, hashedPassword, role]
      );
      
      console.log('✅ Utilisateur créé:', result.rows[0].id);
      
      res.status(201).json({ 
        success: true,
        message: 'Utilisateur créé avec succès', 
        user: result.rows[0] 
      });
      
    } catch (error) {
      console.error('❌ Erreur création utilisateur:', error);
      res.status(500).json({ 
        success: false,
        error: 'Erreur serveur',
        details: error.message
      });
    }
  }

  /**
   * Modifier un utilisateur
   */
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { nom, email, telephone, role } = req.body;
      
      console.log('✏️ Modification utilisateur:', id);
      
      // Vérifier que l'email/téléphone n'est pas déjà utilisé par un autre utilisateur
      const existingUser = await pool.query(
        'SELECT * FROM users WHERE (email = $1 OR telephone = $2) AND id != $3',
        [email, telephone, id]
      );
      
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Cet email ou téléphone est déjà utilisé' 
        });
      }
      
      const result = await pool.query(
        `UPDATE users 
         SET nom = $1, email = $2, telephone = $3, role = $4, updated_at = NOW()
         WHERE id = $5 
         RETURNING id, nom, email, telephone, role, created_at, updated_at`,
        [nom, email, telephone, role, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'Utilisateur non trouvé' 
        });
      }
      
      console.log('✅ Utilisateur modifié:', id);
      
      res.json({ 
        success: true,
        message: 'Utilisateur mis à jour avec succès',
        user: result.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erreur modification utilisateur:', error);
      res.status(500).json({ 
        success: false,
        error: 'Erreur serveur' 
      });
    }
  }

  /**
   * Supprimer un utilisateur
   */
  async deleteUser(req, res) {
    try {
      const { id } = req.params;
      
      console.log('🗑️ Suppression utilisateur:', id);
      
      // Ne pas permettre la suppression de l'admin principal
      const userCheck = await pool.query(
        'SELECT email FROM users WHERE id = $1',
        [id]
      );
      
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'Utilisateur non trouvé' 
        });
      }
      
      if (userCheck.rows[0].email === 'admin@edufile.com') {
        return res.status(403).json({ 
          success: false,
          error: 'Impossible de supprimer l\'administrateur principal' 
        });
      }
      
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      
      console.log('✅ Utilisateur supprimé:', id);
      
      res.json({ 
        success: true,
        message: 'Utilisateur supprimé avec succès' 
      });
      
    } catch (error) {
      console.error('❌ Erreur suppression utilisateur:', error);
      res.status(500).json({ 
        success: false,
        error: 'Erreur serveur' 
      });
    }
  }

  /**
   * Réinitialiser le mot de passe d'un utilisateur
   */
  async resetPassword(req, res) {
    try {
      const { id } = req.params;
      const { nouveauMotDePasse } = req.body;
      
      if (!nouveauMotDePasse || nouveauMotDePasse.length < 6) {
        return res.status(400).json({ 
          success: false,
          error: 'Le mot de passe doit contenir au moins 6 caractères' 
        });
      }
      
      const hashedPassword = await bcrypt.hash(nouveauMotDePasse, 10);
      
      const result = await pool.query(
        'UPDATE users SET mot_de_passe = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
        [hashedPassword, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'Utilisateur non trouvé' 
        });
      }
      
      res.json({ 
        success: true,
        message: 'Mot de passe réinitialisé avec succès' 
      });
      
    } catch (error) {
      console.error('❌ Erreur réinitialisation mot de passe:', error);
      res.status(500).json({ 
        success: false,
        error: 'Erreur serveur' 
      });
    }
  }

  /**
   * Obtenir les statistiques des utilisateurs
   */
  async getUserStats(req, res) {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN role = 'admin' THEN 1 END) as admins,
          COUNT(CASE WHEN role = 'user' THEN 1 END) as users,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as nouveaux_30j,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as nouveaux_7j
        FROM users
      `);
      
      res.json({ 
        success: true,
        stats: result.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erreur statistiques utilisateurs:', error);
      res.status(500).json({ 
        success: false,
        error: 'Erreur serveur' 
      });
    }
  }
}

module.exports = new UsersController();