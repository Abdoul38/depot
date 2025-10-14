// Configuration de l'API
const API_BASE_URL = 'http://localhost:3000/api';

// Classe pour gérer les appels API - SANS LOCALSTORAGE
class ApiClient {
    constructor() {
        this.baseURL = 'http://localhost:3000/api'; // Vérifiez cette URL
        this.token = localStorage.getItem('authToken');
        this.currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    }

    // Méthode pour définir le token d'authentification
    setToken(token, user = null) {
        this.token = token;
        if (token) {
            localStorage.setItem('authToken', token);
            if (user) {
                this.currentUser = user;
                localStorage.setItem('currentUser', JSON.stringify(user));
            }
        } else {
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            this.currentUser = null;
        }
    }
    
    logout() {
        this.setToken(null);
    }

    
// Dans la classe ApiClient

// =================== MÉTHODES GESTION ÉTUDIANTS ===================
// À ajouter dans votre classe ApiClient existante

// Récupérer la liste des étudiants
async getEtudiants(filters = {}) {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.statut) params.append('statut', filters.statut);
    
    const url = `/admin/etudiants${params.toString() ? '?' + params.toString() : ''}`;
    return this.request(url);
}

// Récupérer un étudiant spécifique
// Dans la classe ApiClient
async getEtudiant(id) {
  try {
    const response = await this.request(`/admin/etudiants/${id}`);
    return response;
  } catch (error) {
    console.error('Erreur getEtudiant:', error);
    throw error;
  }
}

// Mettre à jour un étudiant
async updateEtudiant(id, data) {
    return this.request(`/admin/etudiants/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

// Générer un matricule
async genererMatricule(id) {
    return this.request(`/admin/etudiants/${id}/generer-matricule`, {
        method: 'POST'
    });
}

// Supprimer un étudiant
async supprimerEtudiant(id) {
    return this.request(`/admin/etudiants/${id}`, {
        method: 'DELETE'
    });
}

// Toggle autorisation d'inscription
async toggleInscriptionEtudiant(id) {
    return this.request(`/admin/etudiants/${id}/toggle-inscription`, {
        method: 'PUT'
    });
}

// Importer des étudiants depuis Excel
// Dans apiClient.js - Remplacer la fonction importerEtudiants
async importerEtudiants(fichier) {
    if (!fichier) {
        throw new Error('Fichier requis');
    }
    
    // Vérifier le type de fichier
    const validTypes = [
        'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.ms-excel.template.macroEnabled.12',
      'application/vnd.ms-excel.addin.macroEnabled.12',
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
      'text/csv'
    ];
    
    if (!validTypes.includes(fichier.type)) {
        throw new Error('Format de fichier invalide. Utilisez un fichier Excel (.xlsx ou .xls)');
    }
    
    // Vérifier la taille (max 10MB)
    if (fichier.size > 10 * 1024 * 1024) {
        throw new Error('Fichier trop volumineux (max 10MB)');
    }
    
    const formData = new FormData();
    formData.append('fichier', fichier);
    
    console.log('📤 Envoi fichier:', fichier.name, `(${(fichier.size / 1024).toFixed(2)} KB)`);
    
    const response = await fetch(`${API_BASE_URL}/admin/etudiants/import`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${this.token}`
        },
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.details || 'Erreur lors de l\'import');
    }
    
    return response.json();
}
// Télécharger le modèle Excel
async telechargerModeleExcel() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/etudiants/modele-excel`, {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });
        
        if (!response.ok) throw new Error('Erreur téléchargement modèle');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Modele_Import_Etudiants.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Erreur téléchargement modèle:', error);
        throw error;
    }
}

// Exporter les inscriptions
async exporterInscriptions() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/inscriptions/export`, {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });
        
        if (!response.ok) throw new Error('Erreur export');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Inscriptions_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Erreur export:', error);
        throw error;
    }
}

// =================== MÉTHODES CONFIGURATION INSCRIPTION ===================

// Récupérer la configuration
async getConfigInscription() {
    return this.request('/admin/inscription/config');
}

// Mettre à jour la configuration
async updateConfigInscription(config) {
    return this.request('/admin/inscription/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
}

// =================== MÉTHODES RESTRICTIONS ===================

// Récupérer les restrictions
async getRestrictions() {
    return this.request('/admin/inscription/restrictions');
}

// Créer une restriction
async creerRestriction(data) {
    return this.request('/admin/inscription/restrictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

// Toggle une restriction
async toggleRestriction(id) {
    return this.request(`/admin/inscription/restrictions/${id}/toggle`, {
        method: 'PUT'
    });
}

// Supprimer une restriction
async supprimerRestriction(id) {
    return this.request(`/admin/inscription/restrictions/${id}`, {
        method: 'DELETE'
    });
}

// =================== MÉTHODES INSCRIPTION PUBLIQUE ===================

// Rechercher un nouveau étudiant
async rechercherNouveauEtudiant(numeroDossier) {
    return this.request(`/inscription/rechercher-nouveau/${numeroDossier}`, {
        skipAuth: true
    });
}

// Rechercher un ancien étudiant
async rechercherAncienEtudiant(matricule) {
    return this.request(`/inscription/rechercher-ancien/${matricule}`, {
        skipAuth: true
    });
}

// Vérifier autorisation d'inscription
async verifierAutorisationEtudiant(etudiantId) {
    return this.request(`/inscription/verifier-autorisation/${etudiantId}`, {
        skipAuth: true
    });
}

// Valider une inscription
async validerInscription(data) {
    return this.request('/inscription/valider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        skipAuth: true
    });
}

// Obtenir le statut des inscriptions
async getStatutInscriptions() {
    return this.request('/inscription/config', {
        skipAuth: true
    });
}

// Obtenir les filières actives
async getFilieresActives() {
    return this.request('/filieres/actives', {
        skipAuth: true
    });
}
async getFacultesPublic() {
    return this.request('/facultes');
}

async getTypeBacsPublic() {
    return this.request('/type-bacs');
}

// Méthode pour récupérer les filières filtrées par type de bac
async getFilieresByBac(typeBac) {
    return this.request(`/filieres-by-bac/${encodeURIComponent(typeBac)}`);
}

// Méthode pour récupérer les filières avec filtres
async getFilieresByFilters(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    const endpoint = params ? `/filieres?${params}` : '/filieres';
    return this.request(endpoint);
}

async getFilieresPublic(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    const endpoint = params ? `/filieres?${params}` : '/filieres';
    return this.request(endpoint);
}

// Méthodes admin pour la gestion des formations
async getFacultes() {
    return this.request('/admin/facultes');
}

async saveFaculte(faculteData) {
    const method = faculteData.id ? 'PUT' : 'POST';
    const endpoint = faculteData.id ? `/admin/facultes/${faculteData.id}` : '/admin/facultes';
    return this.request(endpoint, {
        method: method,
        body: faculteData
    });
}

async deleteFaculte(id) {
    return this.request(`/admin/facultes/${id}`, {
        method: 'DELETE'
    });
}

async getTypeBacs() {
    return this.request('/admin/type-bacs');
}

async saveTypeBac(typeBacData) {
    const method = typeBacData.id ? 'PUT' : 'POST';
    const endpoint = typeBacData.id ? `/admin/type-bacs/${typeBacData.id}` : '/admin/type-bacs';
    return this.request(endpoint, {
        method: method,
        body: typeBacData
    });
}

async getFilieres() {
    return this.request('/admin/filieres');
}

async saveFiliere(filiereData) {
    const method = filiereData.id ? 'PUT' : 'POST';
    const endpoint = filiereData.id ? `/admin/filieres/${filiereData.id}` : '/admin/filieres';
    return this.request(endpoint, {
        method: method,
        body: filiereData
    });
}

async getDiplomes() {
    return this.request('/admin/diplomes');
}

async saveDiplome(diplomeData) {
    const method = diplomeData.id ? 'PUT' : 'POST';
    const endpoint = diplomeData.id ? `/admin/diplomes/${diplomeData.id}` : '/admin/diplomes';
    return this.request(endpoint, {
        method: method,
        body: diplomeData  // ✅ CORRIGÉ
    });
}

async deleteDiplome(id) {
    return this.request(`/admin/diplomes/${id}`, {
        method: 'DELETE'
    });
}
async exportCandidaturesComplete() {
    try {
        const response = await fetch(`${this.baseURL}/admin/export/candidatures-complete`, {
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Erreur lors de l\'export');
        }

        const blob = await response.blob();
        const filename = `candidatures_complete_${new Date().toISOString().split('T')[0]}.csv`;
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Erreur export complet:', error);
        throw error;
    }
}
// Méthodes pour la modification des dossiers
async getApplicationForEdit(id) {
    return this.request(`/applications/${id}/edit`);
}

async updateApplication(id, formData) {
    const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${this.token}`
        },
        body: formData // FormData pour gérer les fichiers
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de la mise à jour');
    }

    return response.json();
}

async canEditApplication(id) {
    return this.request(`/applications/${id}/can-edit`);
}
async exporterParFaculte(faculte = null) {
    try {
        console.log('📊 Export par faculté...', faculte);
        
        const url = faculte 
            ? `${this.baseURL}/admin/export/section/par-faculte?filter=${encodeURIComponent(faculte)}`
            : `${this.baseURL}/admin/export/section/par-faculte`;
            
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Erreur serveur:', errorText);
            throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        
        // Récupérer le nom du fichier depuis les headers
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `export_faculte_${faculte || 'toutes'}.xlsx`;
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
            if (filenameMatch) {
                filename = filenameMatch[1].replace(/"/g, '');
            }
        }
        
        console.log('📥 Téléchargement fichier:', filename);
        
        const urlBlob = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlBlob;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(urlBlob);
        
        console.log('✅ Export téléchargé avec succès');
        
    } catch (error) {
        console.error('❌ Erreur export par faculté:', error);
        throw error;
    }
}

async exporterParGenre(genre = null) {
    try {
        console.log('👥 Export par genre...', genre);
        
        const url = genre 
            ? `${this.baseURL}/admin/export/section/par-genre?filter=${encodeURIComponent(genre)}`
            : `${this.baseURL}/admin/export/section/par-genre`;
            
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        const filename = `export_genre_${genre || 'tous'}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        const urlBlob = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlBlob;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(urlBlob);
        
        console.log('✅ Export genre téléchargé');
        
    } catch (error) {
        console.error('❌ Erreur export genre:', error);
        throw error;
    }
}

async exporterParStatut(statut = 'en-attente') {
    try {
        console.log('📊 Export par statut...', statut);
        
        const url = `${this.baseURL}/admin/export/section/par-statut?filter=${encodeURIComponent(statut)}`;
            
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        const filename = `export_statut_${statut}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        const urlBlob = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlBlob;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(urlBlob);
        
        console.log('✅ Export statut téléchargé');
        
    } catch (error) {
        console.error('❌ Erreur export statut:', error);
        throw error;
    }
}

async exportApprouvesExcel() {
    try {
        console.log('📊 Téléchargement Excel dossiers approuvés...');
        
        const response = await fetch(`${this.baseURL}/admin/export/approuves-excel`, {
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Erreur lors de l\'export');
        }

        const blob = await response.blob();
        const filename = `Dossiers_Approuves_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('✅ Export Excel téléchargé');
        
    } catch (error) {
        console.error('❌ Erreur export Excel:', error);
        throw error;
    }
}

async exportBySection(type, filter = null) {
    try {
        console.log(`📊 Export section ${type}${filter ? ` - Filtre: ${filter}` : ''}`);
        
        const url = filter 
            ? `${this.baseURL}/admin/export/section/${type}?filter=${encodeURIComponent(filter)}`
            : `${this.baseURL}/admin/export/section/${type}`;
            
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Erreur serveur:', errorText);
            throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        
        // Récupérer le nom du fichier depuis les headers
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `export_${type}.xlsx`;
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
            if (filenameMatch) {
                filename = filenameMatch[1].replace(/"/g, '');
            }
        }
        
        console.log('📥 Téléchargement fichier:', filename);
        
        const urlBlob = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlBlob;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(urlBlob);
        
        console.log('✅ Export téléchargé avec succès');
        
    } catch (error) {
        console.error('❌ Erreur export section:', error);
        throw error;
    }
}
async getStatsDashboard() {
    try {
        console.log('📊 Récupération statistiques dashboard...');
        const response = await this.request('/admin/stats/dashboard');
        console.log('✅ Dashboard récupéré:', response);
        return response;
    } catch (error) {
        console.error('❌ Erreur dashboard:', error);
        throw error;
    }
}

async getStatsByGenre() {
    try {
        console.log('📊 Récupération statistiques par genre...');
        const response = await this.request('/admin/stats/genre');
        console.log('✅ Stats genre récupérées:', response);
        return response;
    } catch (error) {
        console.error('❌ Erreur stats genre:', error);
        throw error;
    }
}

async getStatsByFilieres() {
    try {
        console.log('📚 Récupération statistiques par filières...');
        const response = await this.request('/admin/stats/filieres');
        console.log('✅ Stats filières récupérées:', response);
        return response;
    } catch (error) {
        console.error('❌ Erreur stats filières:', error);
        throw error;
    }
}

async getStatsByFacultes() {
    try {
        console.log('🏛️ Récupération statistiques par facultés...');
        const response = await this.request('/admin/stats/facultes-candidatures');
        console.log('✅ Stats facultés récupérées:', response);
        return response;
    } catch (error) {
        console.error('❌ Erreur stats facultés:', error);
        throw error;
    }
}


async getStatsByTypeBac() {
    try {
        console.log('🎓 Récupération statistiques par type de bac...');
        const response = await this.request('/admin/stats/type-bac');
        console.log('✅ Stats type bac récupérées:', response);
        return response;
    } catch (error) {
        console.error('❌ Erreur stats type bac:', error);
        throw error;
    }
}

    async getStatsByLieuObtention() {
        try {
            const response = await this.request('/admin/stats/lieu-obtention');
            return response;
        } catch (error) {
            console.error('❌ Erreur stats lieu obtention:', error);
            throw error;
        }
    }

    async getStatsTemporelles() {
        try {
            const response = await this.request('/admin/stats/temporelles');
            return response;
        } catch (error) {
            console.error('❌ Erreur stats temporelles:', error);
            throw error;
        }
    }

    async getStatsGenreBac() {
        try {
            const response = await this.request('/admin/stats/genre-bac');
            return response;
        } catch (error) {
            console.error('❌ Erreur stats genre-bac:', error);
            throw error;
        }
    }

    async getStatsMentionsFilieres() {
        try {
            const response = await this.request('/admin/stats/mentions-filieres');
            return response;
        } catch (error) {
            console.error('❌ Erreur stats mentions-filières:', error);
            throw error;
        }
    }

    

    async exportStatistics(type) {
        try {
            const response = await fetch(`${this.baseURL}/admin/export/statistiques/${type}`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Erreur lors de l\'export');
            }

            const blob = await response.blob();
            const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `export_stats_${type}.csv`;
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('❌ Erreur export:', error);
            throw error;
        }
    }
            async toggleInscriptionsGlobal(actif, raison = null) {
                return this.request('/admin/inscription/toggle-global', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ actif, raison })
                });
            }

            // Obtenir le statut global
            async getStatutGlobalInscriptions() {
                return this.request('/admin/inscription/statut-global');
            }

  async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        
        const isFormData = options.body instanceof FormData;
        
        // Headers de base
        const headers = {
            ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
            ...options.headers
        };
        
        // Ajouter Content-Type seulement si ce n'est pas FormData
        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }
        
        const config = {
            headers: headers,
            ...options
        };

        // Si c'est du JSON, stringify le body
        if (!isFormData && config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        console.log('🔗 Requête API:', {
            url,
            method: config.method || 'GET',
            isFormData,
            hasToken: !!this.token,
            headers: Object.keys(headers)
        });

        try {
            const response = await fetch(url, config);
            
            console.log('📡 Réponse API:', {
                status: response.status,
                statusText: response.statusText,
                url: response.url
            });
            
            if (response.status === 401) {
                // Token invalide ou expiré
                this.logout();
                UIHelpers.showError('Session expirée. Veuillez vous reconnecter.');
                showPage('connexion');
                throw new Error('Session expirée');
            }
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Erreur serveur:', errorText);
                
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    errorData = { error: errorText || `Erreur ${response.status}` };
                }
                
                throw new Error(errorData.error || `Erreur ${response.status}: ${response.statusText}`);
            }

            if (response.status === 204) {
                return null;
            }

            const result = await response.json();
            console.log('✅ Réponse réussie:', result);
            return result;
            
        } catch (error) {
            console.error(`❌ Erreur API ${endpoint}:`, error);
            throw error;
        }
    }

    // Méthodes d'authentification
    async register(userData) {
        const response = await this.request('/register', {
            method: 'POST',
            body: userData
        });
        return response;
    }

    async login(credentials) {
        const response = await this.request('/login', {
            method: 'POST',
            body: credentials
        });
        
        if (response.token && response.user) {
            this.setToken(response.token, response.user);
        }
        
        return response;
    }

   

    async submitApplication(formData) {
        return this.request('/applications', {
            method: 'POST',
            body: formData
        });
    }
    
    async getMyApplications() {
        return this.request('/applications/my');
    }

    // Méthodes pour le profil
    async getProfile() {
        return this.request('/profile');
    }

    async updateProfile(profileData) {
        return this.request('/profile', {
            method: 'PUT',
            body: profileData
        });
    }
// Dans la classe ApiClient
async searchApplications(query) {
  return this.request(`/admin/applications/search?q=${encodeURIComponent(query)}`);
}
    async changePassword(passwordData) {
        return this.request('/change-password', {
            method: 'PUT',
            body: passwordData
        });
    }

    // Méthodes administrateur
    async getUsers() {
        return this.request('/admin/users');
    }
    // Dans la classe ApiClient
async downloadDocument(applicationId, documentType) {
    try {
        console.log('📥 Début téléchargement document:', { applicationId, documentType });
        
        const response = await fetch(`${API_BASE_URL}/applications/${applicationId}/documents/${documentType}`, {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });

        console.log('📡 Réponse serveur:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erreur réponse:', errorText);
            throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }

        // Obtenir le nom du fichier depuis les headers
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `document_${documentType}`;
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }

        const blob = await response.blob();
        console.log('✅ Blob créé, taille:', blob.size);

        // Créer un lien de téléchargement
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Nettoyer l'URL après le téléchargement
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        console.log('✅ Téléchargement initié');

    } catch (error) {
        console.error('❌ Erreur téléchargement document:', error);
        throw error;
    }
}

    async getAllApplications(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        const endpoint = params ? `/admin/applications?${params}` : '/admin/applications';
        return this.request(endpoint);
    }

    // Dans la classe ApiClient
async updateApplicationStatus(applicationId, status) {
  const response = await this.request(`/admin/applications/${applicationId}/status`, {
    method: 'PUT',
    body: { statut: status }
  });
  return response; // Retourne maintenant l'application mise à jour
}
    async addUser(userData) {
        return this.request('/admin/users', {
            method: 'POST',
            body: userData
        });
    }
// Dans la classe ApiClient
async getApplication(id) {
  return this.request(`/applications/${id}`);
}
    async getStats() {
        return this.request('/admin/stats');
    }


    async exportData(type) {
        const response = await fetch(`${API_BASE_URL}/admin/export/${type}`, {
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Erreur lors de l\'export');
        }

        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `export_${type}.csv`;
        
        // Créer un lien de téléchargement
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Fonctions utilitaires pour l'interface
class UIHelpers {
    static showMessage(message, type = 'info') {
        // Créer un élément de notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 400px;
            animation: slideIn 0.3s ease;
        `;

        // Couleurs selon le type
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };

        notification.style.backgroundColor = colors[type] || colors.info;
        notification.textContent = message;

        // Ajouter l'animation CSS
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(notification);

        // Supprimer après 5 secondes
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
                document.head.removeChild(style);
            }, 300);
        }, 5000);
    }

    static showError(message) {
        this.showMessage(message, 'error');
    }

    static showSuccess(message) {
        this.showMessage(message, 'success');
    }

    static showLoading(show = true) {
        let loader = document.getElementById('globalLoader');
        
        if (show) {
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'globalLoader';
                loader.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                `;
                
                const spinner = document.createElement('div');
                spinner.style.cssText = `
                    width: 50px;
                    height: 50px;
                    border: 5px solid #f3f3f3;
                    border-top: 5px solid #667eea;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                `;
                
                const spinStyle = document.createElement('style');
                spinStyle.textContent = `
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(spinStyle);
                
                loader.appendChild(spinner);
                document.body.appendChild(loader);
            }
        } else if (loader) {
            document.body.removeChild(loader);
        }
    }

    static formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    static getStatusBadge(status) {
        const statusConfig = {
            'en-attente': { class: 'status-pending', text: 'En attente' },
            'approuve': { class: 'status-approved', text: 'Approuvé' },
            'rejete': { class: 'status-rejected', text: 'Rejeté' }
        };

        const config = statusConfig[status] || { class: 'status-pending', text: status };
        return `<span class="status-badge ${config.class}">${config.text}</span>`;
    }
}

// Instance globale du client API
const apiClient = new ApiClient();

// Variables globales
let currentApplicationData = {};

// Fonctions d'affichage des pages
// Fonctions d'affichage des pages
function showPage(pageId) {
    console.log('📄 Navigation vers page:', pageId);
    
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const targetPage = document.getElementById(pageId);
    if (!targetPage) {
        console.error('❌ Page non trouvée:', pageId);
        return;
    }
    
    targetPage.classList.add('active');
    updateUI();
    
    // Charger les données selon la page avec un délai pour assurer le rendu
    setTimeout(() => {
        try {
            switch(pageId) {
                case 'profil':
                    console.log('🔄 Chargement profil...');
                    chargerProfil();
                    break;
                    
                case 'mesDossiers':
                    console.log('🔄 Chargement mes dossiers...');
                    chargerMesDossiers();
                    break;
                    
                case 'gestionUtilisateurs':
                    console.log('🔄 Chargement utilisateurs...');
                    chargerUtilisateurs();
                    break;
                    
                case 'gestionDossiers':
                    console.log('🔄 Chargement dossiers admin...');
                    chargerDossiersAdmin();
                    break;
                // Dans la fonction showPage, ajouter :
                case 'gestionEtudiants':
                    chargerEtudiants();
                    break;
                    
                case 'configInscription':
                    chargerConfigInscription();
                    chargerRestrictions();
                    prepareRestrictionForm();
                    chargerStatutGlobalInscriptions(); // AJOUTER CETTE LIGNE
                    break;
                    
                case 'statistiques':
                    console.log('🔄 Chargement statistiques...');
                    // Charger le tableau de bord par défaut
                    if (typeof chargerTableauBordStats === 'function') {
                        chargerTableauBordStats();
                    } else {
                        console.warn('⚠️ chargerTableauBordStats non disponible');
                        chargerStatistiques(); // Fallback
                    }
                    break;
                    
                case 'gestionFormations':
                    console.log('🔄 Chargement formations...');
                    // Charger les facultés par défaut
                    if (document.getElementById('facultes-tab')?.classList.contains('active')) {
                        chargerFacultes();
                    }
                    break;
                    
                case 'importExport':
                    console.log('📊 Page import/export - pas de chargement nécessaire');
                    break;
                    
                case 'adminPanel':
                    console.log('🎛️ Panel admin - pas de chargement nécessaire');
                    break;
                    
                case 'dashboard':
                    console.log('🏠 Dashboard utilisateur');
                    // Optionnel: charger des stats utilisateur si nécessaire
                    break;
                    
                default:
                    console.log('ℹ️ Page sans chargement de données:', pageId);
            }
            
            console.log('✅ Page chargée:', pageId);
            
        } catch (error) {
            console.error('❌ Erreur chargement données page:', error);
            UIHelpers.showError('Erreur lors du chargement de la page');
        }
    }, 200); // Délai de 200ms pour assurer le rendu
}

function updateUI() {
    const isLoggedIn = apiClient.token !== null;
    const isAdmin = isLoggedIn && apiClient.currentUser?.role === 'admin';
    
    // Mettre à jour les boutons de navigation
    document.getElementById('loginBtn').style.display = isLoggedIn ? 'none' : 'inline-block';
    document.getElementById('registerBtn').style.display = isLoggedIn ? 'none' : 'inline-block';
    document.getElementById('logoutBtn').style.display = isLoggedIn ? 'inline-block' : 'none';
    
    // Ajouter les boutons spécifiques selon le rôle
    const navButtons = document.querySelector('.nav-buttons');
    const existingDashboardBtn = document.getElementById('dashboardBtn');
    const existingAdminBtn = document.getElementById('adminBtn');
    
    // Supprimer les boutons existants
    if (existingDashboardBtn) existingDashboardBtn.remove();
    if (existingAdminBtn) existingAdminBtn.remove();
    
    // Ajouter les boutons selon le rôle
    if (isLoggedIn && !isAdmin) {
        const dashboardBtn = document.createElement('button');
        dashboardBtn.className = 'btn btn-secondary';
        dashboardBtn.id = 'dashboardBtn';
        dashboardBtn.textContent = 'Tableau de bord';
        dashboardBtn.onclick = () => showPage('dashboard');
        navButtons.appendChild(dashboardBtn);
    }
    
    if (isAdmin) {
        const adminBtn = document.createElement('button');
        adminBtn.className = 'btn btn-primary';
        adminBtn.id = 'adminBtn';
        adminBtn.textContent = 'Admin';
        adminBtn.onclick = () => showPage('adminPanel');
        navButtons.appendChild(adminBtn);
    }
}

// Fonction d'inscription
async function register(event) {
    event.preventDefault();
    
    try {
        UIHelpers.showLoading(true);
        
        const userData = {
            nom: document.getElementById('regNom').value,
            email: document.getElementById('regEmail').value,
            telephone: document.getElementById('regTelephone').value,
            motDePasse: document.getElementById('regMotDePasse').value,
            dateNaissance: document.getElementById('regDateNaissance').value || null
        };
        
        const confirmMotDePasse = document.getElementById('regConfirmMotDePasse').value;
        
        if (userData.motDePasse !== confirmMotDePasse) {
            throw new Error('Les mots de passe ne correspondent pas');
        }
        
        const response = await apiClient.register(userData);
        
        UIHelpers.showSuccess('Compte créé avec succès! Vous pouvez maintenant vous connecter.');
        showPage('connexion');
        
    } catch (error) {
        console.error('Erreur inscription:', error);
        UIHelpers.showError(error.message || 'Erreur lors de la création du compte');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Fonction de connexion
async function login(event) {
    event.preventDefault();
    
    try {
        UIHelpers.showLoading(true);
        
        const credentials = {
            identifiant: document.getElementById('loginIdentifiant').value.trim(),
            motDePasse: document.getElementById('loginMotDePasse').value
        };
        
        console.log('🔐 Tentative de connexion...', credentials.identifiant);
        
        const response = await apiClient.login(credentials);
        
        console.log('✅ Réponse login:', response);
        
        // ✅ CORRECTION : Vérifier que nous avons bien reçu le token
        if (!response.token) {
            throw new Error('Token non reçu du serveur');
        }
        
        console.log('🎟️ Token reçu:', response.token.substring(0, 20) + '...');
        console.log('👤 Utilisateur:', response.user);
        
        // Le token est déjà défini dans apiClient.login, mais on le vérifie
        if (!apiClient.token) {
            console.error('❌ Token non défini après login');
            throw new Error('Erreur de sauvegarde du token');
        }
        
        UIHelpers.showSuccess('Connexion réussie!');
        
        // Redirection selon le rôle
        if (response.user.role === 'admin') {
            console.log('➡️ Redirection vers admin panel');
            showPage('adminPanel');
        } else {
            console.log('➡️ Redirection vers dashboard');
            showPage('dashboard');
        }
        
        updateUI();
        
    } catch (error) {
        console.error('❌ Erreur connexion:', error);
        UIHelpers.showError(error.message || 'Identifiants incorrects');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Fonction de déconnexion
function logout() {
    apiClient.logout();
    showPage('accueil');
    updateUI();
}

// Processus de dépôt de dossier
function startApplicationProcess() {
    currentApplicationData = {};
    showPage('etape1');
}

async function nextStep(event, nextStepNumber) {
    event.preventDefault();
    
    try {
        // Sauvegarder les données de l'étape actuelle
        if (nextStepNumber === 2) {
            currentApplicationData.nom = document.getElementById('nom').value;
            currentApplicationData.prenom = document.getElementById('prenom').value;
            currentApplicationData.dateNaissance = document.getElementById('dateNaissance').value;
            currentApplicationData.lieuNaissance = document.getElementById('lieuNaissance').value;
            currentApplicationData.nationalite = document.getElementById('nationalite').value;
            currentApplicationData.genre = document.getElementById('genre').value;
            currentApplicationData.adresse = document.getElementById('adresse').value;
            currentApplicationData.telephone = document.getElementById('telephone').value;
            currentApplicationData.email = document.getElementById('email').value;
            
            // Nouveaux champs bac
            currentApplicationData.typeBac = document.getElementById('typeBac').value;
            currentApplicationData.lieuObtention = document.getElementById('lieuObtention').value;
            currentApplicationData.anneeObtention = document.getElementById('anneeObtention').value;
            currentApplicationData.mention = document.getElementById('mention').value;
            
        } else if (nextStepNumber === 3) {
            // Données de l'étape 2
            currentApplicationData.premierChoix = document.getElementById('premierChoix').value;
            currentApplicationData.deuxiemeChoix = document.getElementById('deuxiemeChoix').value;
            currentApplicationData.troisiemeChoix = document.getElementById('troisiemeChoix').value;
            
        } else if (nextStepNumber === 4) {
            // Données de l'étape 3 (fichiers)
            currentApplicationData.documents = {
                photoIdentite: document.getElementById('photoIdentite').files[0]?.name || 'Non fourni',
                pieceIdentite: document.getElementById('pieceIdentite').files[0]?.name || 'Non fourni',
                diplomeBac: document.getElementById('diplomeBac').files[0]?.name || 'Non fourni',
                releve: document.getElementById('releve').files[0]?.name || 'Non fourni',
                certificatNationalite: document.getElementById('certificatNationalite').files[0]?.name || 'Optionnel'
            };
            
            afficherResume();
        }
        
        showPage('etape' + nextStepNumber);
        
    } catch (error) {
        console.error('Erreur étape suivante:', error);
        UIHelpers.showError('Erreur lors du passage à l\'étape suivante');
    }
}

function afficherResume() {
    // Informations personnelles complètes
    document.getElementById('resumeNomPrenom').textContent = 
        `${currentApplicationData.prenom} ${currentApplicationData.nom}`;
    document.getElementById('resumeNaissance').textContent = 
        `Né(e) le ${new Date(currentApplicationData.dateNaissance).toLocaleDateString('fr-FR')} à ${currentApplicationData.lieuNaissance}`;
    document.getElementById('resumeContact').textContent = 
        `${currentApplicationData.email} | ${currentApplicationData.telephone}`;
    document.getElementById('resumeNationalite').textContent = currentApplicationData.nationalite;
    document.getElementById('resumeGenre').textContent = currentApplicationData.genre === 'masculin' ? 'Masculin' : 'Féminin';
    document.getElementById('resumeAdresse').textContent = currentApplicationData.adresse;
    
    // Informations baccalauréat
    document.getElementById('resumeBac').innerHTML = `
        <p style="margin: 5px 0;"><strong>Type de bac:</strong> ${currentApplicationData.typeBac}</p>
        <p style="margin: 5px 0;"><strong>Lieu d'obtention:</strong> ${currentApplicationData.lieuObtention}</p>
        <p style="margin: 5px 0;"><strong>Année d'obtention:</strong> ${currentApplicationData.anneeObtention}</p>
        <p style="margin: 5px 0;"><strong>Mention:</strong> ${currentApplicationData.mention}</p>
    `;
    
    // Formation
    document.getElementById('resumeFormation').innerHTML = `
        <p style="margin: 5px 0;"><strong>Premier choix:</strong> ${currentApplicationData.premierChoix}</p>
        <p style="margin: 5px 0;"><strong>Deuxième choix:</strong> ${currentApplicationData.deuxiemeChoix}</p>
        <p style="margin: 5px 0;"><strong>Troisième choix:</strong> ${currentApplicationData.troisiemeChoix}</p>
    `;
    
    // Documents avec aperçus
    const listeDocuments = document.getElementById('listeDocuments');
    listeDocuments.innerHTML = '';
    
    const documentTypes = {
        'photoIdentite': 'Photo d\'identité',
        'pieceIdentite': 'Pièce d\'identité',
        'diplomeBac': 'Diplôme de baccalauréat',
        'releve': 'Relevé de notes',
        'certificatNationalite': 'Certificat de nationalité'
    };
    
    Object.entries(documentTypes).forEach(([type, label]) => {
        const input = document.getElementById(type);
        const file = input.files[0];
        
        const div = document.createElement('div');
        div.className = 'document-resume-item';
        div.style.marginBottom = '15px';
        div.style.padding = '10px';
        div.style.border = '1px solid #e1e5e9';
        div.style.borderRadius = '8px';
        div.style.background = '#f8f9fa';
        
        if (file) {
            if (file.type.startsWith('image/')) {
                // Aperçu pour les images
                const reader = new FileReader();
                reader.onload = function(e) {
                    div.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <img src="${e.target.result}" alt="Aperçu" style="width: 60px; height: 60px; object-fit: cover; border-radius: 5px; border: 2px solid #ddd;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; color: #28a745;">${label}</div>
                                <div style="font-size: 12px; color: #666;">${file.name}</div>
                                <div style="font-size: 11px; color: #999;">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
                            </div>
                            <div style="color: #28a745; font-size: 24px;">✓</div>
                        </div>
                    `;
                };
                reader.readAsDataURL(file);
            } else {
                // Pour les PDF
                div.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="width: 60px; height: 60px; background: #dc3545; color: white; display: flex; align-items: center; justify-content: center; border-radius: 5px; font-size: 24px;">📄</div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: #28a745;">${label}</div>
                            <div style="font-size: 12px; color: #666;">${file.name}</div>
                            <div style="font-size: 11px; color: #999;">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
                        </div>
                        <div style="color: #28a745; font-size: 24px;">✓</div>
                    </div>
                `;
            }
        } else {
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="width: 60px; height: 60px; background: #6c757d; color: white; display: flex; align-items: center; justify-content: center; border-radius: 5px; font-size: 24px;">❌</div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #dc3545;">${label}</div>
                        <div style="font-size: 12px; color: #666;">Document non fourni</div>
                    </div>
                </div>
            `;
        }
        
        listeDocuments.appendChild(div);
    });
}
// Fonction de soumission de candidature
async function submitApplication(event) {
    event.preventDefault();
    
    try {
        UIHelpers.showLoading(true);
        
        // Vérifier que l'utilisateur est connecté
        if (!apiClient.token) {
            UIHelpers.showError('Vous devez être connecté pour soumettre un dossier');
            showPage('connexion');
            return;
        }
        
        // Créer FormData pour l'envoi des fichiers
        const formData = new FormData();
        
        // Ajouter les données textuelles
        const textFields = [
            'nom', 'prenom', 'dateNaissance', 'lieuNaissance', 'nationalite', 'genre',
            'adresse', 'telephone', 'email', 'typeBac', 'lieuObtention', 
            'anneeObtention', 'mention', 'premierChoix', 'deuxiemeChoix', 'troisiemeChoix'
        ];
        
        textFields.forEach(field => {
            if (currentApplicationData[field]) {
                formData.append(field, currentApplicationData[field]);
            }
        });
        
        // Ajouter les fichiers
        const fileInputs = [
            'photoIdentite', 'pieceIdentite', 'diplomeBac', 'releve', 'certificatNationalite'
        ];
        
        fileInputs.forEach(inputId => {
            const fileInput = document.getElementById(inputId);
            if (fileInput && fileInput.files[0]) {
                formData.append(inputId, fileInput.files[0]);
            }
        });
        
        console.log('Envoi du dossier avec token:', apiClient.token ? 'Présent' : 'Absent');
        
        // Envoyer à l'API
        const response = await apiClient.submitApplication(formData);
        
        UIHelpers.showSuccess('Dossier soumis avec succès!');
        openModal('confirmationModal');
        
    } catch (error) {
        console.error('Erreur soumission:', error);
        
        if (error.message.includes('401') || error.message.includes('Token')) {
            UIHelpers.showError('Session expirée. Veuillez vous reconnecter.');
            showPage('connexion');
        } else {
            UIHelpers.showError(error.message || 'Erreur lors de la soumission du dossier');
        }
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Gestion des modals
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Télécharger le quitus en PDF
// Remplacer la fonction telechargerQuitus existante
async function telechargerQuitus() {
  try {
    // Pour le dossier en cours de création, utiliser les données temporaires
    if (Object.keys(currentApplicationData).length > 0) {
      // Générer un numéro de dossier temporaire
      const formatNumero = (numero) => {
      if (!numero) return 'En attente';
      // Extraire les chiffres et s'assurer qu'ils ont 6 chiffres
      const chiffres = numero.replace(/\D/g, '');
      return 'UDH' + chiffres.padStart(6, '0');
    };
    
    const numeroQuitus = formatNumero(application.numero_dossier || application.numeroDossier);
    const numeroDepot = formatNumero(application.numero_depot || application.numeroDepot);
      
      // Préparer les données pour le quitus
      const applicationData = {
        ...currentApplicationData,
        numero_dossier: numeroDossier,
        numeroDossier: numeroDossier,
        statut: 'en-attente',
        documents: currentApplicationData.documents || {}
      };
      
      await genererQuitusAvecDonnees(applicationData);
    } else {
      UIHelpers.showError('Aucun dossier disponible pour générer le quitus');
    }
  } catch (error) {
    console.error('Erreur génération quitus:', error);
    UIHelpers.showError('Erreur lors de la génération du quitus');
  }
}
function creerModalDetails(application) {
    // Créer l'overlay du modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'detailsModalOverlay';
    
    // Créer le contenu du modal
    const modalContent = `
        <div class="modal-details">
            <div class="modal-header">
                <h3>Dossier #${application.numero_dossier}</h3>
                <button onclick="fermerModalDetails()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer;">&times;</button>
            </div>
            
            <div class="modal-body">
                <!-- Informations personnelles -->
                <div class="info-section">
                    <h4>
                        <span>👤</span>
                        Informations personnelles
                    </h4>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Nom complet</label>
                            <span>${application.prenom} ${application.nom}</span>
                        </div>
                        <div class="info-item">
                            <label>Date de naissance</label>
                            <span>${new Date(application.date_naissance).toLocaleDateString('fr-FR')}</span>
                        </div>
                        <div class="info-item">
                            <label>Lieu de naissance</label>
                            <span>${application.lieu_naissance}</span>
                        </div>
                        <div class="info-item">
                            <label>Nationalité</label>
                            <span>${application.nationalite}</span>
                        </div>
                        <div class="info-item">
                            <label>Genre</label>
                            <span>${application.genre === 'masculin' ? 'Masculin' : 'Féminin'}</span>
                        </div>
                        <div class="info-item">
                            <label>Email</label>
                            <span>${application.email}</span>
                        </div>
                        <div class="info-item">
                            <label>Téléphone</label>
                            <span>${application.telephone}</span>
                        </div>
                    </div>
                    <div class="info-item" style="margin-top: 15px;">
                        <label>Adresse complète</label>
                        <span>${application.adresse}</span>
                    </div>
                </div>
                
                <!-- Informations baccalauréat -->
                <div class="info-section">
                    <h4>
                        <span>🎓</span>
                        Informations du baccalauréat
                    </h4>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Type de bac</label>
                            <span>${application.type_bac}</span>
                        </div>
                        <div class="info-item">
                            <label>Lieu d'obtention</label>
                            <span>${application.lieu_obtention}</span>
                        </div>
                        <div class="info-item">
                            <label>Année d'obtention</label>
                            <span>${application.annee_obtention}</span>
                        </div>
                        <div class="info-item">
                            <label>Mention</label>
                            <span>${application.mention}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Choix de formation -->
                <div class="info-section">
                    <h4>
                        <span>📚</span>
                        Choix de formation
                    </h4>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Premier choix</label>
                            <span>${application.premier_choix}</span>
                        </div>
                        <div class="info-item">
                            <label>Deuxième choix</label>
                            <span>${application.deuxieme_choix}</span>
                        </div>
                        <div class="info-item">
                            <label>Troisième choix</label>
                            <span>${application.troisieme_choix}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Documents joints -->
                <div class="info-section">
                    <h4>
                        <span>📎</span>
                        Documents joints
                    </h4>
                    <div id="documentsContainer">
                        ${genererListeDocuments(application.documents, application.id)}
                    </div>
                </div>
                
                <!-- Statut du dossier -->
                <div class="status-section">
                    <h4 style="margin-bottom: 20px;">
                        <span>📊</span>
                        Statut du dossier
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; text-align: left;">
                        <div class="info-item">
                            <label>Numéro de dossier</label>
                            <span style="font-family: monospace; font-weight: bold;">${application.numero_dossier}</span>
                        </div>
                        <div class="info-item">
                            <label>Numéro de dépôt</label>
                            <span style="font-family: monospace; font-weight: bold;">${application.numero_depot || 'En attente d\'approbation'}</span>
                        </div>
                        <div class="info-item">
                            <label>Date de dépôt</label>
                            <span>${new Date(application.created_at).toLocaleDateString('fr-FR')} à ${new Date(application.created_at).toLocaleTimeString('fr-FR')}</span>
                        </div>
                    </div>
                    <div style="margin-top: 20px;">
                        ${genererBadgeStatut(application.statut)}
                    </div>
                </div>
            </div>
            
            <!-- Actions -->
            <div class="modal-actions">
                <button class="btn-icon btn-quitus" onclick="telechargerQuitusDepuisDetails(${application.id})">
                    <span>📄</span>
                    Télécharger le quitus
                </button>
                ${apiClient.currentUser?.role === 'admin' ? `
                    <button class="btn-icon btn-approve" onclick="changerStatutDossier(${application.id}, 'approuve'); fermerModalDetails();">
                        <span>✅</span>
                        Approuver
                    </button>
                    <button class="btn-icon btn-reject" onclick="changerStatutDossier(${application.id}, 'rejete'); fermerModalDetails();">
                        <span>❌</span>
                        Rejeter
                    </button>
                ` : ''}
                <button class="btn-icon btn-secondary" onclick="fermerModalDetails()">
                    <span>🚪</span>
                    Fermer
                </button>
            </div>
        </div>
    `;
    
    overlay.innerHTML = modalContent;
    document.body.appendChild(overlay);
    
    // Fermer le modal en cliquant sur l'overlay
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            fermerModalDetails();
        }
    });
}

// Fonction pour générer la liste des documents
function genererListeDocuments(documentsJson, applicationId) {
    try {
        const documents = typeof documentsJson === 'string' ? JSON.parse(documentsJson) : documentsJson || {};
        
        const documentTypes = {
            'photoIdentite': 'Photo d\'identité',
            'pieceIdentite': 'Pièce d\'identité',
            'diplomeBac': 'Diplôme de baccalauréat',
            'releve': 'Relevé de notes',
            'certificatNationalite': 'Certificat de nationalité'
        };
        
        let html = '';
        
        Object.entries(documentTypes).forEach(([key, label]) => {
            const filename = documents[key];
            const isPresent = filename && filename !== 'Non fourni' && filename !== 'Optionnel';
            
            html += `
                <div class="document-item ${!isPresent ? 'document-missing' : ''}">
                    <div class="document-info">
                        <div class="document-name">${label}</div>
                        <div class="document-filename">${filename || 'Non fourni'}</div>
                    </div>
                    ${isPresent ? `
                        <button class="btn-icon btn-download" onclick="telechargerDocument(${applicationId}, '${key}')" style="padding: 8px 12px; font-size: 12px;">
                            <span>📥</span>
                            Télécharger
                        </button>
                    ` : `
                        <span style="color: #856404; font-style: italic; font-size: 12px;">Non disponible</span>
                    `}
                </div>
            `;
        });
        
        return html || '<p style="color: #666; text-align: center; padding: 20px;">Aucun document disponible</p>';
    } catch (error) {
        console.error('Erreur parsing documents:', error);
        return '<p style="color: #dc3545; text-align: center; padding: 20px;">Erreur lors du chargement des documents</p>';
    }
}

// Fonction pour générer le badge de statut
function genererBadgeStatut(statut) {
    switch(statut) {
        case 'approuve':
            return '<span class="status-badge-large status-approved-large">✅ Dossier Approuvé</span>';
        case 'rejete':
            return '<span class="status-badge-large status-rejected-large">❌ Dossier Rejeté</span>';
        default:
            return '<span class="status-badge-large status-pending-large">⏳ En Attente de Validation</span>';
    }
}

// Fonction pour fermer le modal de détails
function fermerModalDetails() {
    const overlay = document.getElementById('detailsModalOverlay');
    if (overlay) {
        overlay.remove();
    }
}

// Fonction modifiée pour voir les détails d'un dossier
// Fonction modifiée pour voir les détails d'un dossier
async function voirDossier(appId) {
    try {
        UIHelpers.showLoading(true);
        
        const response = await apiClient.getApplication(appId);
        const application = response.application;
        
        creerModalDetails(application);
        
    } catch (error) {
        console.error('Erreur récupération détails dossier:', error);
        UIHelpers.showError('Erreur lors de la récupération des détails');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Fonction pour télécharger un document
async function telechargerDocument(applicationId, documentType) {
    try {
        UIHelpers.showLoading(true);
        await apiClient.downloadDocument(applicationId, documentType);
        UIHelpers.showSuccess('Document téléchargé avec succès');
    } catch (error) {
        console.error('Erreur téléchargement document:', error);
        UIHelpers.showError('Erreur lors du téléchargement du document');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Fonction pour télécharger le quitus (admin)
async function telechargerQuitusAdmin(applicationId) {
    try {
        UIHelpers.showLoading(true);
        
        const response = await apiClient.downloadQuitus(applicationId);
        const application = response.application;
        
        // Utiliser la fonction existante pour générer le quitus
        await genererQuitusAvecDonnees(application);
        
    } catch (error) {
        console.error('Erreur téléchargement quitus admin:', error);
        UIHelpers.showError('Erreur lors du téléchargement du quitus');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Modification de la fonction voirMonDossier pour utiliser le nouveau modal
async function voirMonDossier(appId) {
    await voirDossier(appId); // Utilise la même fonction que l'admin
}
// Fonction pour générer la liste des documents avec boutons de téléchargement
function genererListeDocuments(documentsJson, applicationId) {
    try {
        const documents = typeof documentsJson === 'string' ? JSON.parse(documentsJson) : documentsJson || {};
        
        const documentTypes = {
            'photoIdentite': 'Photo d\'identité',
            'pieceIdentite': 'Pièce d\'identité',
            'diplomeBac': 'Diplôme de baccalauréat',
            'releve': 'Relevé de notes',
            'certificatNationalite': 'Certificat de nationalité'
        };
        
        let html = '';
        
        Object.entries(documentTypes).forEach(([key, label]) => {
            const filename = documents[key];
            const isPresent = filename && filename !== 'Non fourni' && filename !== 'Optionnel';
            
            html += `
                <div class="document-item ${!isPresent ? 'document-missing' : ''}">
                    <div class="document-info">
                        <div class="document-name">${label}</div>
                        <div class="document-filename">${filename || 'Non fourni'}</div>
                    </div>
                    ${isPresent ? `
                        <button class="btn-icon btn-download" onclick="telechargerDocument(${applicationId}, '${key}')" style="padding: 8px 12px; font-size: 12px;">
                            <span>📥</span>
                            Télécharger
                        </button>
                    ` : `
                        <span style="color: #856404; font-style: italic; font-size: 12px;">Non disponible</span>
                    `}
                </div>
            `;
        });
        
        return html || '<p style="color: #666; text-align: center; padding: 20px;">Aucun document disponible</p>';
    } catch (error) {
        console.error('Erreur parsing documents:', error);
        return '<p style="color: #dc3545; text-align: center; padding: 20px;">Erreur lors du chargement des documents</p>';
    }
}

// Fonction pour mettre à jour le profil
async function updateProfile(event) {
    event.preventDefault();
    
    try {
        UIHelpers.showLoading(true);
        
        const profileData = {
            nom: document.getElementById('profilNom').value,
            email: document.getElementById('profilEmail').value,
            telephone: document.getElementById('profilTelephone').value
        };
        
        await apiClient.updateProfile(profileData);
        
        // Mettre à jour l'utilisateur courant
        if (apiClient.currentUser) {
            apiClient.currentUser.nom = profileData.nom;
            apiClient.currentUser.email = profileData.email;
            apiClient.currentUser.telephone = profileData.telephone;
            localStorage.setItem('currentUser', JSON.stringify(apiClient.currentUser));
        }
        
        UIHelpers.showSuccess('Profil mis à jour avec succès!');
        
    } catch (error) {
        console.error('Erreur mise à jour profil:', error);
        UIHelpers.showError(error.message || 'Erreur lors de la mise à jour du profil');
    } finally {
        UIHelpers.showLoading(false);
    }
}
// Fonction de recherche des dossiers
async function rechercherDossiers() {
  try {
    const query = document.getElementById('rechercheDossier').value.trim();
    
    if (!query) {
      chargerDossiersAdmin();
      return;
    }

    UIHelpers.showLoading(true);
    
    const response = await apiClient.searchApplications(query);
    const applications = response.applications || [];
    
    const tableau = document.getElementById('tableauDossiersAdmin');
    tableau.innerHTML = '';
    
    if (applications.length === 0) {
      tableau.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #666;">Aucun dossier trouvé</td></tr>';
      return;
    }
    
    applications.forEach(app => {
      const row = document.createElement('tr');
      const statutClass = app.statut === 'approuve' ? 'status-approved' : 
                        app.statut === 'rejete' ? 'status-rejected' : 'status-pending';
      const statutText = app.statut === 'approuve' ? 'Approuvé' : 
                       app.statut === 'rejete' ? 'Rejeté' : 'En attente';
      
      row.innerHTML = `
        <td>${new Date(app.created_at).toLocaleDateString('fr-FR')}</td>
        <td>${app.prenom} ${app.nom}</td>
        <td>${app.premier_choix}</td>
        <td><span class="status-badge ${statutClass}">${statutText}</span></td>
        <td>
          ${app.numero_depot ? `<small style="color: #666;">Dépôt: ${app.numero_depot}</small><br>` : ''}
          <small style="color: #667eea;">Dossier: ${app.numero_dossier}</small><br>
          <button class="btn btn-primary" style="padding: 5px 10px; margin: 2px;" onclick="voirDossier(${app.id})">Voir</button>
          <button class="btn" style="padding: 5px 10px; margin: 2px; background: #28a745; color: white;" onclick="changerStatutDossier(${app.id}, 'approuve')">Approuver</button>
          <button class="btn" style="padding: 5px 10px; margin: 2px; background: #dc3545; color: white;" onclick="changerStatutDossier(${app.id}, 'rejete')">Rejeter</button>
        </td>
      `;
      tableau.appendChild(row);
    });
    
  } catch (error) {
    console.error('Erreur recherche dossiers:', error);
    UIHelpers.showError('Erreur lors de la recherche');
  } finally {
    UIHelpers.showLoading(false);
  }
}

// Fonction pour réinitialiser la recherche
function reinitialiserRecherche() {
  document.getElementById('rechercheDossier').value = '';
  document.getElementById('filtreStatut').value = '';
  document.getElementById('filtreFiliere').value = '';
  chargerDossiersAdmin();
}

// Recherche en temps réel (optionnel)
document.addEventListener('DOMContentLoaded', function() {
  const rechercheInput = document.getElementById('rechercheDossier');
  if (rechercheInput) {
    rechercheInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        rechercherDossiers();
      }
    });
  }
});

// Fonction pour changer le mot de passe
async function changePassword(event) {
    event.preventDefault();
    
    try {
        UIHelpers.showLoading(true);
        
        const passwordData = {
            ancienMotDePasse: document.getElementById('ancienMotDePasse').value,
            nouveauMotDePasse: document.getElementById('nouveauMotDePasse').value
        };
        
        const confirmNouveauMotDePasse = document.getElementById('confirmNouveauMotDePasse').value;
        
        if (passwordData.nouveauMotDePasse !== confirmNouveauMotDePasse) {
            throw new Error('Les nouveaux mots de passe ne correspondent pas');
        }
        
        await apiClient.changePassword(passwordData);
        
        UIHelpers.showSuccess('Mot de passe changé avec succès!');
        document.getElementById('motDePasseForm').reset();
        
    } catch (error) {
        console.error('Erreur changement mot de passe:', error);
        UIHelpers.showError(error.message || 'Erreur lors du changement de mot de passe');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Fonction pour charger les dossiers de l'utilisateur
async function chargerMesDossiers() {
  try {
    if (!apiClient.currentUser) return;
    
    const response = await apiClient.getMyApplications();
    const applications = response.applications || [];
    
    const tableau = document.getElementById('tableauDossiers');
    tableau.innerHTML = '';
    
    if (applications.length === 0) {
      tableau.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: #666;">Aucun dossier déposé pour le moment</td></tr>';
      return;
    }
    
    applications.forEach(app => {
      const row = document.createElement('tr');
      const statutClass = app.statut === 'approuve' ? 'status-approved' : 
                        app.statut === 'rejete' ? 'status-rejected' : 'status-pending';
      const statutText = app.statut === 'approuve' ? 'Approuvé' : 
                       app.statut === 'rejete' ? 'Rejeté' : 'En attente';
      
      row.innerHTML = `
        <td>${new Date(app.created_at).toLocaleDateString('fr-FR')}</td>
        <td>${app.nom} ${app.prenom}</td>
        <td>${app.numero_dossier}</td>
        <td><span class="status-badge ${statutClass}">${statutText}</span></td>
        <td>
          <button class="btn btn-secondary" style="padding: 5px 10px; margin: 2px;" onclick="voirMonDossier(${app.id})">Voir détails</button>
          <button class="btn btn-primary" style="padding: 5px 10px; margin: 2px;" onclick="telechargerQuitusFromApp(${app.id})">Télécharger quitus</button>
        </td>
      `;
      tableau.appendChild(row);
    });
    
  } catch (error) {
    console.error('Erreur chargement dossiers:', error);
    UIHelpers.showError('Erreur lors du chargement des dossiers');
  }
}



async function telechargerQuitusFromApp(appId) {
  try {
    UIHelpers.showLoading(true);
    
    // Récupérer les données du dossier depuis l'API
    const response = await apiClient.getApplication(appId);
    const application = response.application;
    
    // Utiliser les données du dossier pour générer le quitus
    await genererQuitusAvecDonnees(application);
    
  } catch (error) {
    console.error('Erreur récupération dossier:', error);
    UIHelpers.showError('Erreur lors de la génération du quitus');
  } finally {
    UIHelpers.showLoading(false);
  }
}

// Fonction optimisée pour générer le quitus avec une meilleure mise en page
// Fonction optimisée pour générer le quitus avec une meilleure mise en page
async function genererQuitusAvecDonnees(application) {
  try {
    // Vérifier si jsPDF est disponible
    if (typeof window.jsPDF === 'undefined') {
      UIHelpers.showError('Bibliothèque PDF non chargée. Veuillez rafraîchir la page.');
      return;
    }

    // Créer un nouveau document PDF
    const doc = new window.jsPDF();
    
    // Configuration
    let y = 15;
    const margin = 20;
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const lineHeight = 4.5;
    const photoWidth = 30;
    const photoHeight = 35;

    // Fonction pour ajouter du texte centré
    const addCenteredText = (text, size = 12, style = 'normal') => {
      doc.setFontSize(size);
      doc.setFont('helvetica', style);
      const textWidth = doc.getTextWidth(text);
      const x = (pageWidth - textWidth) / 2;
      doc.text(text, x, y);
      y += size === 14 ? 6 : size === 12 ? 5 : 4;
    };

    // Fonction pour ajouter du texte aligné à gauche
    const addLeftText = (text, x = margin, size = 10, style = 'normal') => {
      doc.setFontSize(size);
      doc.setFont('helvetica', style);
      doc.text(text, x, y);
      y += lineHeight;
      return y;
    };

    // Fonction pour ajouter du texte à une position spécifique sans changer y
    const addTextAt = (text, x, yPos, size = 10, style = 'normal') => {
      doc.setFontSize(size);
      doc.setFont('helvetica', style);
      doc.text(text, x, yPos);
    };

    // ===== LOGO EN HAUT À GAUCHE =====
    let logoAdded = false;
    const logoWidth = 25;
    const logoHeight = 25;
    const logoX = margin;
    const logoY = 15;

    try {
      // Vous pouvez changer cette URL par l'emplacement de votre logo
      const logoUrl = 'http://localhost:3000/uploads/logo-universite.png'; // ou votre chemin vers le logo
      
      await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        
        img.onload = function() {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            const pixelWidth = logoWidth * 3.78;
            const pixelHeight = logoHeight * 3.78;
            
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
            
            // Fond blanc
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, pixelWidth, pixelHeight);
            
            // Redimensionner le logo en gardant les proportions
            const ratio = Math.min(pixelWidth / img.width, pixelHeight / img.height);
            const drawWidth = img.width * ratio;
            const drawHeight = img.height * ratio;
            const offsetX = (pixelWidth - drawWidth) / 2;
            const offsetY = (pixelHeight - drawHeight) / 2;
            
            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
            
            const dataURL = canvas.toDataURL('image/png', 1.0);
            doc.addImage(dataURL, 'PNG', logoX, logoY, logoWidth, logoHeight);
            
            logoAdded = true;
            console.log('✅ Logo ajouté avec succès');
          } catch (error) {
            console.error('❌ Erreur ajout logo:', error);
          }
          resolve();
        };
        
        img.onerror = function() {
          console.log('📷 Logo non trouvé, continuation sans logo');
          resolve();
        };
        
        // Timeout pour éviter le blocage
        setTimeout(() => resolve(), 3000);
        
        img.src = logoUrl;
      });
      
    } catch (error) {
      console.warn('⚠️ Erreur chargement logo:', error);
    }

    // ===== EN-TÊTE OFFICIEL =====
    y = 15;
    
    // Si un logo est présent, décaler le texte vers la droite
    const headerStartX = logoAdded ? logoX + logoWidth + 10 : pageWidth / 2;
    
    // Fonction pour centrer le texte en tenant compte du logo
    const addHeaderText = (text, size = 12, style = 'normal') => {
      doc.setFontSize(size);
      doc.setFont('helvetica', style);
      const textWidth = doc.getTextWidth(text);
      const availableWidth = logoAdded ? pageWidth - (logoX + logoWidth + 10) - margin : pageWidth - 2 * margin;
      const x = logoAdded ? headerStartX + (availableWidth - textWidth) / 2 : (pageWidth - textWidth) / 2;
      doc.text(text, x, y);
      y += size === 12 ? 5 : size === 11 ? 4.5 : 4;
    };

    addHeaderText('REPUBLIQUE DU NIGER', 12, 'bold');
    addHeaderText('MINISTERE DE L\'ENSEIGNEMENT SUPERIEUR DE LA RECHERCHE ET DE', 9, 'bold');
    addHeaderText('L\'INNOVATION TECHNOLOGIQUE', 9, 'bold');
    y += 2;
    addHeaderText('UNIVERSITÉ DJIBO HAMANI DE TAHOUA', 11, 'bold');
    addHeaderText('SERVICE CENTRAL DE LA SCOLARITE (SCScol)', 9, 'bold');
    addHeaderText('Tel: 86 15 67 79 BP: 237 Tahoua / Niger Email: scscol.udht@gmail.com', 7);
    
    y += 8;

    // ===== TITRE PRINCIPAL =====
    addCenteredText('QUITANCE DE PRÉINSCRIPTION au titre de l\'année académique 2025-2026', 10, 'bold');
    
    y += 5;

    // ===== NUMÉROS DE QUITUS ET DÉPÔT =====
       doc.setFontSize(9);
    
    // Formater les numéros pour qu'ils aient 6 chiffres
    const formatNumero = (numero) => {
      if (!numero) return 'En attente';
      // Extraire les chiffres et s'assurer qu'ils ont 6 chiffres
      const chiffres = numero.replace(/\D/g, '');
      return 'UDH' + chiffres.padStart(6, '0');
    };
    
    const numeroQuitus = formatNumero(application.numero_dossier || application.numeroDossier);
    const numeroDepot = formatNumero(application.numero_depot || application.numeroDepot);
    
    doc.text(`N° de quitus: ${numeroQuitus}`, margin, y);
    
    if (application.statut === 'approuve' && (application.numero_depot || application.numeroDepot)) {
      doc.text(`N° de dépôt: ${numeroDepot}`, pageWidth - margin - 60, y);
    } else {
      doc.text(`N° de dépôt: En attente d'approbation`, pageWidth - margin - 80, y);
    }
    y += 8;


    // ===== IDENTIFICATION DU BACHELIER AVEC PHOTO =====
    addLeftText('IDENTIFICATION DU BACHELIER', margin, 10, 'bold');
    y += 2;

    // Position de la photo (à gauche)
    const photoX = margin;
    const photoY = y;
    let photoAdded = false;

    // Gestion de la photo
    try {
      const documents = typeof application.documents === 'string' 
        ? JSON.parse(application.documents) 
        : application.documents || {};

      if (documents && documents.photoIdentite && documents.photoIdentite !== 'Non fourni') {
        const photoFilename = documents.photoIdentite;
        const photoUrl = `http://localhost:3000/uploads/${photoFilename}`;
        
        console.log('📷 Tentative de chargement de la photo:', photoUrl);
        
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          
          img.onload = function() {
            try {
              console.log('✅ Photo chargée avec succès');
              
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              const pixelWidth = photoWidth * 3.78;
              const pixelHeight = photoHeight * 3.78;
              
              let drawWidth = img.width;
              let drawHeight = img.height;
              let offsetX = 0;
              let offsetY = 0;
              
              const ratio = Math.min(pixelWidth / img.width, pixelHeight / img.height);
              drawWidth = img.width * ratio;
              drawHeight = img.height * ratio;
              
              offsetX = (pixelWidth - drawWidth) / 2;
              offsetY = (pixelHeight - drawHeight) / 2;
              
              canvas.width = pixelWidth;
              canvas.height = pixelHeight;
              
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, pixelWidth, pixelHeight);
              ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
              
              const dataURL = canvas.toDataURL('image/jpeg', 0.8);
              doc.addImage(dataURL, 'JPEG', photoX, photoY, photoWidth, photoHeight);
              
              doc.setDrawColor(0, 0, 0);
              doc.setLineWidth(0.3);
              doc.rect(photoX, photoY, photoWidth, photoHeight);
              
              photoAdded = true;
              console.log('✅ Photo ajoutée au PDF avec succès');
              resolve();
              
            } catch (error) {
              console.error('❌ Erreur lors de l\'ajout de la photo au PDF:', error);
              reject(error);
            }
          };
          
          img.onerror = function(error) {
            console.error('❌ Erreur lors du chargement de l\'image:', error);
            resolve();
          };
          
          setTimeout(() => {
            if (!photoAdded) {
              console.warn('⏰ Timeout chargement photo');
              resolve();
            }
          }, 5000);
          
          img.src = photoUrl;
        });
        
      } else {
        console.log('📷 Aucune photo disponible');
      }
    } catch (error) {
      console.warn('⚠️ Erreur lors du traitement de la photo:', error);
    }

    // Si la photo n'a pas pu être ajoutée, créer un cadre vide
    if (!photoAdded) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(photoX, photoY, photoWidth, photoHeight);
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      addTextAt('PHOTO', photoX + 10, photoY + 20);
      
      console.log('📷 Cadre photo vide ajouté');
    }

    // Informations personnelles (à droite de la photo)
    const infoX = photoX + photoWidth + 8;
    const infoStartY = photoY;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    // Colonne 1 (informations de base)
    let currentY = infoStartY;
    addTextAt(`Nom: ${(application.nom || '').toUpperCase()}`, infoX, currentY);
    currentY += 5;
    addTextAt(`Prénom: ${application.prenom || ''}`, infoX, currentY);
    currentY += 5;
    addTextAt(`Date De Naissance: ${new Date(application.date_naissance || application.dateNaissance).toLocaleDateString('fr-FR') || ''}`, infoX, currentY);
    currentY += 5;
    addTextAt(`Lieu De Naissance: ${application.lieu_naissance || application.lieuNaissance || ''}`, infoX, currentY);
    currentY += 5;
    addTextAt(`Nationalité: ${application.nationalite || ''}`, infoX, currentY);
    currentY += 5;
    addTextAt(`Genre: ${(application.genre === 'masculin') ? 'Masculin' : 'Féminin'}`, infoX, currentY);
    currentY += 5;
    addTextAt(`Email: ${application.email || ''}`, infoX, currentY);
    currentY += 5;
    addTextAt(`Tel: ${application.telephone || ''}`, infoX, currentY);

    // Ajuster y pour continuer après la section photo/infos
    y = Math.max(photoY + photoHeight + 5, currentY + 3);

    // ===== INFORMATION DU DIPLOME =====
    addLeftText('INFORMATION DU DIPLOME (BAC)', margin, 10, 'bold');
    y += 1;

    // Informations du diplôme en deux colonnes
    const leftCol = margin;
    const rightCol = pageWidth / 2 + 5;

    doc.setFontSize(9);
    addTextAt(`Niveau: Supérieur`, leftCol, y);
    addTextAt(`Nom du Diplôme: ${application.type_bac || application.typeBac || ''}`, rightCol, y);
    y += 5;

    addTextAt(`Année d'obtention: ${application.annee_obtention || application.anneeObtention || ''}`, leftCol, y);
    addTextAt(`Groupe: Deuxième Groupe`, rightCol, y);
    y += 5;

    addTextAt(`Mention: ${application.mention || ''}`, leftCol, y);
    addTextAt(`Pays d'obtention: Niger`, rightCol, y);
    y += 5;

    addTextAt(`Région d'obtention: ${application.lieu_obtention || application.lieuObtention || ''}`, leftCol, y);
    addTextAt(`Adresse: ${application.adresse || ''}`, rightCol, y);
    y += 8;

    // ===== CHOIX DE SECTIONS =====
    addLeftText('Les choix de sections', margin, 10, 'bold');
    y += 1;

    doc.setFontSize(8);
    doc.text('Je soussigné(e), manifeste mon intérêt pour entreprendre des études dans les sections ci-dessus par ordre de', leftCol, y);
    y += 4;
    doc.text('préférence.', leftCol, y);
    y += 6;

    // Choix de formations (format compact)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    addTextAt('Premier Choix:', leftCol, y);
    doc.setFont('helvetica', 'normal');
    addTextAt(application.premier_choix || application.premierChoix || '', leftCol + 35, y);
    y += 5;

    doc.setFont('helvetica', 'bold');
    addTextAt('Deuxième Choix:', leftCol, y);
    doc.setFont('helvetica', 'normal');
    addTextAt(application.deuxieme_choix || application.deuxiemeChoix || '', leftCol + 35, y);
    y += 5;

    doc.setFont('helvetica', 'bold');
    addTextAt('Troisième Choix:', leftCol, y);
    doc.setFont('helvetica', 'normal');
    addTextAt(application.troisieme_choix || application.troisiemeChoix || '', leftCol + 35, y);
    y += 8;

    // ===== STATUT DU DOSSIER =====
    addLeftText('STATUT DU DOSSIER', margin, 10, 'bold');
    y += 1;
    
    let statutText = '';
    let statutColor = '#000000';
    
    switch(application.statut) {
      case 'approuve':
        statutText = '✅ DOSSIER APPROUVÉ';
        statutColor = '#28a745';
        break;
      case 'rejete':
        statutText = '❌ DOSSIER REJETÉ';
        statutColor = '#dc3545';
        break;
      default:
        statutText = '⏳ EN ATTENTE DE VALIDATION';
        statutColor = '#ffc107';
    }
    
    doc.setTextColor(statutColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(statutText, leftCol, y);
    doc.setTextColor('#000000');
    doc.setFont('helvetica', 'normal');
    y += 8;

    // ===== LISTE DES FICHIERS JOINTS =====
    addLeftText('Liste des fichiers joints', margin, 10, 'bold');
    y += 2;

    const documents = typeof application.documents === 'string' 
      ? JSON.parse(application.documents) 
      : application.documents || {};
      
    doc.setFontSize(8);
    Object.entries(documents).forEach(([type, nomFichier]) => {
      if (nomFichier && nomFichier !== 'Non fourni' && nomFichier !== 'Optionnel') {
        const nomDocument = getNomDocument(type);
        doc.text(`• ${nomDocument}: ${nomFichier}`, leftCol + 5, y);
        y += 4;
      }
    });

    y += 5;

    // ===== NOTE IMPORTANTE =====
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('NB:', leftCol, y);
    doc.setFont('helvetica', 'normal');
    
    const noteText = 'La validation de la préinscription est assujettie au dépôt, au Service Central de la Scolarité, sis à l\'Université Djibo Hamani de Tahoua, du Lundi 28 Juillet au Vendredi 29 Août 2025 inclus, d\'un dossier physique constitué du quitus de préinscription et des différents documents joints en ligne.';
    
    const splitNote = doc.splitTextToSize(noteText, pageWidth - 2 * margin);
    doc.text(splitNote, leftCol + 8, y);
    y += splitNote.length * 3 + 8;

    // ===== CERTIFICATION ET SIGNATURE =====
    doc.setFontSize(9);
    doc.text('Je soussigné(e) certifie exactes les informations ci-dessus.', leftCol, y);
    y += 10;

    // Date et signature sur la même ligne
    const aujourd = new Date();
    const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 
                 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateGeneration = `${jours[aujourd.getDay()]} ${aujourd.getDate()} ${mois[aujourd.getMonth()]} ${aujourd.getFullYear()}`;
    
    doc.text(`Fait, le ${dateGeneration}`, leftCol, y);
    doc.text('Signature du candidat', pageWidth - margin - 50, y);

    // ===== SAUVEGARDE DU PDF =====
      const nomFichier = `Quitance_${numeroQuitus}_${application.nom}_${application.prenom}.pdf`;
    doc.save(nomFichier);

    UIHelpers.showSuccess('Quitus PDF téléchargé avec succès!');

  } catch (error) {
    console.error('Erreur génération PDF:', error);
    UIHelpers.showError('Erreur lors de la génération du PDF: ' + error.message);
  }
}

// Fonction utilitaire pour obtenir le nom du document
function getNomDocument(type) {
  const nomsDocuments = {
    'photoIdentite': 'Photo d\'identité',
    'pieceIdentite': 'Pièce d\'identité',
    'diplomeBac': 'Diplôme de baccalauréat',
    'releve': 'Relevé de notes',
    'certificatNationalite': 'Certificat de nationalité'
  };
  return nomsDocuments[type] || type;
}

// Fonctions admin
function showAdminSection(section) {
    showPage(section);
}


async function chargerUtilisateurs() {
    try {
        const response = await apiClient.getUsers();
        const users = response.users || [];
        
        const tableau = document.getElementById('tableauUtilisateurs');
        tableau.innerHTML = '';
        
        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.nom}</td>
                <td>${user.email}</td>
                <td>${user.telephone}</td>
                <td>${new Date(user.created_at).toLocaleDateString('fr-FR')}</td>
                <td><span class="status-badge status-approved">${user.role}</span></td>
                <td>
                    <button class="btn btn-secondary" style="padding: 5px 10px; margin: 2px;" onclick="modifierUtilisateur(${user.id})">Modifier</button>
                    <button class="btn" style="padding: 5px 10px; margin: 2px; background: #dc3545; color: white;" onclick="supprimerUtilisateur(${user.id})">Supprimer</button>
                </td>
            `;
            tableau.appendChild(row);
        });
        
    } catch (error) {
        console.error('Erreur chargement utilisateurs:', error);
        UIHelpers.showError('Erreur lors du chargement des utilisateurs');
    }
}


async function chargerDossiersAdmin() {
    try {
        const statut = document.getElementById('filtreStatut')?.value || '';
        const filiere = document.getElementById('filtreFiliere')?.value || '';
        
        const filters = {};
        if (statut) filters.statut = statut;
        if (filiere) filters.filiere = filiere;
        
        const response = await apiClient.getAllApplications(filters);
        const applications = response.applications || [];
        
        const tableau = document.getElementById('tableauDossiersAdmin');
        tableau.innerHTML = '';
        
        if (applications.length === 0) {
            tableau.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #666;">Aucun dossier déposé</td></tr>';
            return;
        }
        
        applications.forEach(app => {
            const row = document.createElement('tr');
            const statutClass = app.statut === 'approuve' ? 'status-approved' : 
                              app.statut === 'rejete' ? 'status-rejected' : 'status-pending';
            const statutText = app.statut === 'approuve' ? 'Approuvé' : 
                             app.statut === 'rejete' ? 'Rejeté' : 'En attente';
            
            // Dans la fonction chargerDossiersAdmin(), mettre à jour l'affichage
// Dans chargerDossiersAdmin(), mettre à jour l'affichage du tableau
row.innerHTML = `
  <td>${new Date(app.created_at).toLocaleDateString('fr-FR')}</td>
  <td>
    <strong>${app.prenom} ${app.nom}</strong><br>
  </td>
  <td>${app.numero_dossier}</td>
  <td><span class="status-badge ${statutClass}">${statutText}</span></td>
  <td>
    ${app.numero_depot ? `<small style="color: #666;">Dépôt: ${app.numero_depot}</small><br>` : ''}
    <button class="btn btn-primary" style="padding: 5px 10px; margin: 2px;" onclick="voirDossier(${app.id})">Voir</button>
    <button class="btn" style="padding: 5px 10px; margin: 2px; background: #28a745; color: white;" onclick="changerStatutDossier(${app.id}, 'approuve')">Approuver</button>
    <button class="btn" style="padding: 5px 10px; margin: 2px; background: #dc3545; color: white;" onclick="changerStatutDossier(${app.id}, 'rejete')">Rejeter</button>
  </td>
`;
            tableau.appendChild(row);
        });
        
    } catch (error) {
        console.error('Erreur chargement dossiers admin:', error);
        UIHelpers.showError('Erreur lors du chargement des dossiers');
    }
}

async function chargerStatistiques() {
    try {
        const response = await apiClient.getStats();
        const stats = response.stats || response;
        
        document.getElementById('statUtilisateurs').textContent = stats.totalUsers || 0;
        document.getElementById('statDossiers').textContent = stats.totalApplications || 0;
        document.getElementById('statApprouves').textContent = stats.approvedApplications || 0;
        document.getElementById('statAttente').textContent = stats.pendingApplications || 0;
        
    } catch (error) {
        console.error('Erreur chargement statistiques:', error);
        UIHelpers.showError('Erreur lors du chargement des statistiques');
    }
}

async function ajouterUtilisateur(event) {
    event.preventDefault();
    
    try {
        UIHelpers.showLoading(true);
        
        const userData = {
            nom: document.getElementById('adminNom').value,
            email: document.getElementById('adminEmail').value,
            telephone: document.getElementById('adminTelephone').value,
            role: document.getElementById('adminRole').value,
            motDePasse: document.getElementById('adminMotDePasse').value
        };
        
        await apiClient.addUser(userData);
        
        closeModal('ajoutUtilisateurModal');
        chargerUtilisateurs();
        UIHelpers.showSuccess('Utilisateur ajouté avec succès');
        
        // Réinitialiser le formulaire
        document.getElementById('ajoutUtilisateurForm').reset();
        
    } catch (error) {
        console.error('Erreur ajout utilisateur:', error);
        UIHelpers.showError(error.message || 'Erreur lors de l\'ajout de l\'utilisateur');
    } finally {
        UIHelpers.showLoading(false);
    }
}

async function changerStatutDossier(appId, nouveauStatut) {
  try {
    UIHelpers.showLoading(true);
    
    const response = await apiClient.updateApplicationStatus(appId, nouveauStatut);
    
    // Recharger la liste des dossiers
    chargerDossiersAdmin();
    
    // Afficher un message avec le numéro de dépôt si le dossier est approuvé
    if (nouveauStatut === 'approuve' && response.application && response.application.numero_depot) {
      UIHelpers.showSuccess(`Dossier approuvé avec succès! Numéro de dépôt: ${response.application.numero_depot}`);
    } else {
      UIHelpers.showSuccess(`Dossier ${nouveauStatut === 'approuve' ? 'approuvé' : 'rejeté'} avec succès`);
    }
    
  } catch (error) {
    console.error('Erreur changement statut:', error);
    UIHelpers.showError('Erreur lors du changement de statut');
  } finally {
    UIHelpers.showLoading(false);
  }
}



function modifierUtilisateur(userId) {
    alert('Modification utilisateur ID: ' + userId + '\n\nCette fonctionnalité nécessite une implémentation backend supplémentaire.');
}

function supprimerUtilisateur(userId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
        alert('Suppression utilisateur ID: ' + userId + '\n\nCette fonctionnalité nécessite une implémentation backend supplémentaire.');
    }
}

// Fonctions d'import/export
async function exportData(type) {
    try {
        UIHelpers.showLoading(true);
        await apiClient.exportData(type);
        UIHelpers.showSuccess('Export terminé avec succès !');
    } catch (error) {
        console.error('Erreur export:', error);
        UIHelpers.showError('Erreur lors de l\'export');
    } finally {
        UIHelpers.showLoading(false);
    }
}

function importData(input) {
    const file = input.files[0];
    if (!file) return;
    
    alert('Import du fichier: ' + file.name + '\n\nCette fonctionnalité nécessite une implémentation backend supplémentaire.');
    
    // Réinitialiser l'input
    input.value = '';
}

// Gestion des clics en dehors des modals
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Vérifier l'authentification au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si l'utilisateur est déjà connecté
    if (apiClient.token && apiClient.currentUser) {
        if (apiClient.currentUser.role === 'admin') {
            showPage('adminPanel');
        } else {
            showPage('dashboard');
        }
        updateUI();
    } else {
        showPage('accueil');
    }
    
    console.log('🔗 Connexion à l\'API backend active');
    console.log('👤 Utilisateur actuel:', apiClient.currentUser);
});
// Fonction pour afficher l'aperçu des documents
function afficherApercuDocument(inputId, inputElement) {
    const file = inputElement.files[0];
    const previewContainer = document.getElementById('apercu-' + inputId);
    const fileUpload = inputElement.previousElementSibling;
    
    if (!file) {
        previewContainer.style.display = 'none';
        fileUpload.classList.remove('has-file');
        return;
    }
    
    // Marquer le file-upload comme ayant un fichier
    fileUpload.classList.add('has-file');
    
    // Créer le contenu de l'aperçu
    let previewContent = '';
    const fileSize = (file.size / 1024 / 1024).toFixed(2) + ' MB';
    
    if (file.type.startsWith('image/')) {
        // Pour les images
        const reader = new FileReader();
        reader.onload = function(e) {
            previewContent = `
                <div class="preview-content">
                    <img src="${e.target.result}" alt="Aperçu" class="preview-image">
                    <div class="preview-info">
                        <div class="preview-filename">${file.name}</div>
                        <div class="preview-size">Taille: ${fileSize}</div>
                        <div class="preview-actions">
                            <button class="btn-preview btn-preview-view" onclick="visualiserImage('${inputId}')">Agrandir</button>
                            <button class="btn-preview btn-preview-remove" onclick="supprimerDocument('${inputId}')">Supprimer</button>
                        </div>
                    </div>
                </div>
            `;
            previewContainer.innerHTML = previewContent;
            previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        // Pour les PDF
        previewContent = `
            <div class="preview-content">
                <div class="preview-pdf">📄</div>
                <div class="preview-info">
                    <div class="preview-filename">${file.name}</div>
                    <div class="preview-size">Taille: ${fileSize}</div>
                    <div class="preview-actions">
                        <button class="btn-preview btn-preview-remove" onclick="supprimerDocument('${inputId}')">Supprimer</button>
                    </div>
                </div>
            </div>
        `;
        previewContainer.innerHTML = previewContent;
        previewContainer.style.display = 'block';
    }
}

// Fonction pour visualiser une image en grand
function visualiserImage(inputId) {
    const input = document.getElementById(inputId);
    const file = input.files[0];
    
    if (!file || !file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        // Créer le modal de visualisation
        const modal = document.createElement('div');
        modal.className = 'modal-preview';
        modal.innerHTML = `
            <span class="modal-preview-close" onclick="fermerModalPreview()">&times;</span>
            <div class="modal-preview-content">
                <img src="${e.target.result}" alt="Aperçu agrandi" class="modal-preview-image">
                <div class="modal-preview-filename">${file.name}</div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'block';
        
        // Fermer en cliquant en dehors de l'image
        modal.onclick = function(event) {
            if (event.target === modal) {
                fermerModalPreview();
            }
        };
    };
    reader.readAsDataURL(file);
}

// Fonction pour fermer le modal de visualisation
function fermerModalPreview() {
    const modal = document.querySelector('.modal-preview');
    if (modal) {
        modal.remove();
    }
}

// Fonction pour supprimer un document
function supprimerDocument(inputId) {
    const input = document.getElementById(inputId);
    const previewContainer = document.getElementById('apercu-' + inputId);
    const fileUpload = input.previousElementSibling;
    
    input.value = '';
    previewContainer.style.display = 'none';
    fileUpload.classList.remove('has-file');
}

// Modifier la fonction afficherResume pour inclure tous les détails
function afficherResume() {
    // Informations personnelles complètes
    document.getElementById('resumeNomPrenom').textContent = 
        `${currentApplicationData.prenom} ${currentApplicationData.nom}`;
    document.getElementById('resumeNaissance').textContent = 
        `Né(e) le ${new Date(currentApplicationData.dateNaissance).toLocaleDateString('fr-FR')} à ${currentApplicationData.lieuNaissance}`;
    document.getElementById('resumeContact').textContent = 
        `${currentApplicationData.email} | ${currentApplicationData.telephone}`;
    
    // Informations baccalauréat
    document.getElementById('resumeBac').innerHTML = `
        <strong>Type de bac:</strong> ${currentApplicationData.typeBac}<br>
        <strong>Lieu d'obtention:</strong> ${currentApplicationData.lieuObtention}<br>
        <strong>Année d'obtention:</strong> ${currentApplicationData.anneeObtention}<br>
        <strong>Mention:</strong> ${currentApplicationData.mention}
    `;
    
    // Formation
    document.getElementById('resumeFormation').innerHTML = `
        <strong>Premier choix:</strong> ${currentApplicationData.premierChoix}<br>
        <strong>Deuxième choix:</strong> ${currentApplicationData.deuxiemeChoix}<br>
        <strong>Troisième choix:</strong> ${currentApplicationData.troisiemeChoix}
    `;
    
    // Documents avec aperçus
    const listeDocuments = document.getElementById('listeDocuments');
    listeDocuments.innerHTML = '';
    
    const documentTypes = {
        'photoIdentite': 'Photo d\'identité',
        'pieceIdentite': 'Pièce d\'identité',
        'diplomeBac': 'Diplôme de baccalauréat',
        'releve': 'Relevé de notes',
        'certificatNationalite': 'Certificat de nationalité'
    };
    
    Object.entries(documentTypes).forEach(([type, label]) => {
        const input = document.getElementById(type);
        const file = input.files[0];
        
        const div = document.createElement('div');
        div.className = 'document-resume-item';
        div.style.marginBottom = '15px';
        div.style.padding = '10px';
        div.style.border = '1px solid #e1e5e9';
        div.style.borderRadius = '8px';
        div.style.background = '#f8f9fa';
        
        if (file) {
            if (file.type.startsWith('image/')) {
                // Aperçu pour les images
                const reader = new FileReader();
                reader.onload = function(e) {
                    div.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <img src="${e.target.result}" alt="Aperçu" style="width: 60px; height: 60px; object-fit: cover; border-radius: 5px;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; color: #28a745;">${label}</div>
                                <div style="font-size: 12px; color: #666;">${file.name}</div>
                                <div style="font-size: 11px; color: #999;">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
                            </div>
                        </div>
                    `;
                };
                reader.readAsDataURL(file);
            } else {
                // Pour les PDF
                div.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="width: 60px; height: 60px; background: #dc3545; color: white; display: flex; align-items: center; justify-content: center; border-radius: 5px; font-size: 24px;">📄</div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: #28a745;">${label}</div>
                            <div style="font-size: 12px; color: #666;">${file.name}</div>
                            <div style="font-size: 11px; color: #999;">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
                        </div>
                    </div>
                `;
            }
        } else {
            div.innerHTML = `
                <div style="color: #dc3545; font-style: italic;">
                    ${label}: Non fourni
                </div>
            `;
        }
        
        listeDocuments.appendChild(div);
    });
}
// 1. Ajouter dans apiClient.js - Nouvelle fonction pour charger les filières filtrées
async function chargerFilieresParTypeBac() {
    try {
        // Charger d'abord les types de bac disponibles
        const responseTypeBacs = await apiClient.getTypeBacsPublic();
        const typeBacs = responseTypeBacs.typeBacs || [];
        
        // Remplir le select des types de bac
        const selectTypeBac = document.getElementById('typeBac');
        if (selectTypeBac) {
            // Sauvegarder la valeur actuelle
            const currentValue = selectTypeBac.value;
            
            // Vider et remplir le select
            selectTypeBac.innerHTML = '<option value="">Sélectionner un type de bac...</option>';
            
            typeBacs.forEach(typeBac => {
                const option = document.createElement('option');
                option.value = typeBac.nom;
                option.textContent = `${typeBac.nom} - ${typeBac.libelle}`;
                selectTypeBac.appendChild(option);
            });
            
            // Restaurer la valeur si elle existe
            if (currentValue) {
                selectTypeBac.value = currentValue;
            }
            
            // Ajouter l'événement de changement pour filtrer les filières
            selectTypeBac.addEventListener('change', function() {
                filtrerFilieresParBac(this.value);
            });
        }
        
    } catch (error) {
        console.error('Erreur chargement types de bac:', error);
    }
}

// 2. Fonction pour filtrer les filières selon le type de bac sélectionné
async function filtrerFilieresParBac(typeBac) {
    try {
        UIHelpers.showLoading(true);
        
        // Réinitialiser tous les selects de filières
        const selectsFilieres = [
            document.getElementById('premierChoix'),
            document.getElementById('deuxiemeChoix'), 
            document.getElementById('troisiemeChoix')
        ];
        
        selectsFilieres.forEach(select => {
            if (select) {
                const currentValue = select.value;
                select.innerHTML = '<option value="">Sélectionner une filière...</option>';
                
                // Si on efface le type de bac, recharger toutes les filières
               
            }
        });
        
        // Si un type de bac est sélectionné, charger les filières compatibles
        if (typeBac) {
            try {
                const response = await fetch(`${API_BASE_URL}/filieres-by-bac/${encodeURIComponent(typeBac)}`);
                
                if (!response.ok) {
                    throw new Error(`Erreur ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                const filieres = data.filieres || [];
                
                console.log(`Filières trouvées pour ${typeBac}:`, filieres);
                
                if (filieres.length === 0) {
                    selectsFilieres.forEach(select => {
                        if (select) {
                            select.innerHTML = `<option value="">Aucune filière disponible pour ce type de bac</option>`;
                        }
                    });
                    UIHelpers.showMessage(`Aucune filière trouvée pour le type de bac ${typeBac}`, 'warning');
                    return;
                }
                
                // Remplir les selects avec les filières compatibles
                selectsFilieres.forEach(select => {
                    if (select) {
                        const currentValue = select.value;
                        select.innerHTML = '<option value="">Sélectionner une filière...</option>';
                        
                        filieres.forEach(filiere => {
                            const option = document.createElement('option');
                            option.value = filiere.nom.toLowerCase();
                            option.textContent = `${filiere.libelle} (${filiere.faculte_nom})`;
                            
                            // Ajouter des informations sur la capacité si disponible
                            if (filiere.capacite_max) {
                                option.textContent += ` - Places: ${filiere.capacite_max}`;
                            }
                            
                            select.appendChild(option);
                        });
                        
                        // Restaurer la valeur si elle est encore valide
                        const isValidChoice = filieres.some(f => f.nom.toLowerCase() === currentValue);
                        if (currentValue && isValidChoice) {
                            select.value = currentValue;
                        }
                    }
                });
                
                UIHelpers.showSuccess(`${filieres.length} filière(s) disponible(s) pour le ${typeBac}`);
                
            } catch (error) {
                console.error('Erreur lors du chargement des filières:', error);
                
                // En cas d'erreur, afficher un message et proposer les filières génériques
                selectsFilieres.forEach(select => {
                    if (select) {
                        select.innerHTML = `
                            <option value="">Erreur de chargement - Filières génériques</option>
                            <option value="informatique">Informatique</option>
                            <option value="mathematiques">Mathématiques</option>
                        `;
                    }
                });
                
                UIHelpers.showError('Erreur lors du filtrage. Filières génériques affichées.');
            }
        }
        
    } catch (error) {
        console.error('Erreur filtrage filières:', error);
        UIHelpers.showError('Erreur lors du filtrage des filières');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// 3. Fonction pour valider la cohérence des choix
function validerChoixFilieres() {
    const typeBac = document.getElementById('typeBac')?.value;
    const premierChoix = document.getElementById('premierChoix')?.value;
    const deuxiemeChoix = document.getElementById('deuxiemeChoix')?.value;
    const troisiemeChoix = document.getElementById('troisiemeChoix')?.value;
    
    const erreurs = [];
    
    // Vérifier que les trois choix sont différents
    const choix = [premierChoix, deuxiemeChoix, troisiemeChoix].filter(Boolean);
    const choixUniques = [...new Set(choix)];
    
    if (choix.length !== choixUniques.length) {
        erreurs.push('Les trois choix de filières doivent être différents');
    }
    
    // Vérifier qu'au moins le premier choix est fait
    if (!premierChoix) {
        erreurs.push('Le premier choix de filière est obligatoire');
    }
    
    if (erreurs.length > 0) {
        UIHelpers.showError(erreurs.join('\n'));
        return false;
    }
    
    return true;
}

// 4. Modifier la fonction nextStep pour inclure la validation
const originalNextStep = window.nextStep;
window.nextStep = function(event, nextStepNumber) {
    // Si on passe de l'étape 2 à l'étape 3, valider les choix
    if (nextStepNumber === 3) {
        if (!validerChoixFilieres()) {
            event.preventDefault();
            return false;
        }
    }
    
    // Appeler la fonction originale
    return originalNextStep.call(this, event, nextStepNumber);
};

// 5. Initialiser le filtrage quand on arrive sur l'étape 1
document.addEventListener('DOMContentLoaded', function() {
    // Attendre que la page soit complètement chargée
    setTimeout(() => {
        const etape1 = document.getElementById('etape1');
        if (etape1) {
            // Observer les changements de visibilité de l'étape 1
            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        const target = mutation.target;
                        if (target.classList.contains('active') && target.id === 'etape1') {
                            // L'étape 1 devient active, charger les types de bac
                            setTimeout(() => chargerFilieresParTypeBac(), 500);
                        }
                    }
                });
            });
            
            observer.observe(etape1, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
    }, 1000);
});

// 6. Fonction utilitaire pour réinitialiser les filières
function reinitialiserFilieres() {
    const selectsFilieres = [
        document.getElementById('premierChoix'),
        document.getElementById('deuxiemeChoix'), 
        document.getElementById('troisiemeChoix')
    ];
    
    selectsFilieres.forEach(select => {
        if (select) {
            select.innerHTML = '<option value="">Sélectionner d\'abord un type de bac</option>';
            select.value = '';
        }
    });
}


// 7. Ajouter des événements pour éviter la sélection multiple de la même filière
function configurerEvenementsChoixUniques() {
    const selectsFilieres = [
        document.getElementById('premierChoix'),
        document.getElementById('deuxiemeChoix'), 
        document.getElementById('troisiemeChoix')
    ];
    
    selectsFilieres.forEach((select, index) => {
        if (select) {
            select.addEventListener('change', function() {
                const valeurSelectionnee = this.value;
                
                if (valeurSelectionnee) {
                    // Désactiver cette option dans les autres selects
                    selectsFilieres.forEach((autreSelect, autreIndex) => {
                        if (autreIndex !== index && autreSelect) {
                            const options = autreSelect.querySelectorAll('option');
                            options.forEach(option => {
                                if (option.value === valeurSelectionnee) {
                                    option.disabled = true;
                                    option.textContent = option.textContent.replace(' (déjà sélectionné)', '') + ' (déjà sélectionné)';
                                }
                            });
                        }
                    });
                }
                
                // Réactiver toutes les options puis désactiver celles qui sont prises
                selectsFilieres.forEach((autreSelect, autreIndex) => {
                    if (autreIndex !== index && autreSelect) {
                        const options = autreSelect.querySelectorAll('option');
                        options.forEach(option => {
                            option.disabled = false;
                            option.textContent = option.textContent.replace(' (déjà sélectionné)', '');
                        });
                    }
                });
                
                // Désactiver les options déjà sélectionnées dans les autres selects
                const valeursSelectionnees = selectsFilieres
                    .filter((s, i) => i !== index && s)
                    .map(s => s.value)
                    .filter(Boolean);
                
                selectsFilieres.forEach((autreSelect, autreIndex) => {
                    if (autreIndex !== index && autreSelect) {
                        const options = autreSelect.querySelectorAll('option');
                        options.forEach(option => {
                            if (valeursSelectionnees.includes(option.value) && option.value) {
                                option.disabled = true;
                                if (!option.textContent.includes('(déjà sélectionné)')) {
                                    option.textContent += ' (déjà sélectionné)';
                                }
                            }
                        });
                    }
                });
            });
        }
    });
}

// 8. Initialiser les événements quand l'étape 2 devient active
const originalShowPage = window.showPage;
window.showPage = function(pageId) {
    originalShowPage.call(this, pageId);
    
    if (pageId === 'etape2') {
        // Configurer les événements pour éviter les doublons de choix
        setTimeout(() => configurerEvenementsChoixUniques(), 100);
    }
};

console.log('✅ Système de filtrage des filières par type de bac initialisé');

// Modifier aussi la structure HTML du résumé dans index.html

// Gestion des erreurs globales
window.addEventListener('unhandledrejection', (event) => {
    console.error('Erreur non gérée:', event.reason);
    UIHelpers.showError('Une erreur inattendue s\'est produite');
});

// Export des utilitaires
window.apiClient = apiClient;
window.UIHelpers = UIHelpers;