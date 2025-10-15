// Configuration de l'API
const API_BASE_URL = 'https://depot-w4hn.onrender.com/api';
// ========== SYSTÈME DE CACHE SIMPLE ==========

// Classe pour gérer les appels API - SANS LOCALSTORAGE
const apiCache = {
    data: new Map(),
    ttl: 5 * 60 * 1000, // 5 minutes
    maxSize: 100, // Limite de taille
    
    get(key) {
        const cached = this.data.get(key);
        if (!cached) return null;
        
        const now = Date.now();
        if (now - cached.timestamp > this.ttl) {
            this.data.delete(key);
            return null;
        }
        
        return cached.value;
    },
    
    set(key, value) {
        // Limiter la taille du cache
        if (this.data.size >= this.maxSize) {
            const firstKey = this.data.keys().next().value;
            this.data.delete(firstKey);
        }
        
        this.data.set(key, {
            value: value,
            timestamp: Date.now()
        });
    },
    
    clear(pattern) {
        if (pattern) {
            const keysToDelete = [];
            this.data.forEach((_, key) => {
                if (key.includes(pattern)) {
                    keysToDelete.push(key);
                }
            });
            keysToDelete.forEach(key => this.data.delete(key));
        } else {
            this.data.clear();
        }
    }
}
// Fonction pour vider le cache API après une modification
function viderCacheAPI(pattern) {
    if (pattern) {
        console.log('🗑️ Vidage cache API:', pattern);
        apiCache.clear(pattern);
    }
}
class ApiClient {
    constructor() {
        this.baseURL = 'https://depot-w4hn.onrender.com/api';
        this.token = localStorage.getItem('authToken');
        this.currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        this.pendingRequests = new Map(); // Éviter les requêtes doublons
    }

    // Méthode request OPTIMISÉE avec cache
    async request(endpoint, options = {}) {
        const token = localStorage.getItem('authToken') || this.token;
        const url = `${this.baseURL}${endpoint}`;
        
        // Générer une clé de cache
        const cacheKey = `${options.method || 'GET'}_${endpoint}_${JSON.stringify(options.body || '')}`;
        
        // Vérifier le cache pour les GET
        if ((!options.method || options.method === 'GET') && !options.skipCache) {
            const cached = apiCache.get(cacheKey);
            if (cached) {
                console.log('📦 Depuis cache:', endpoint);
                return cached;
            }
        }
        
        // Éviter les requêtes doublons en cours
        if (this.pendingRequests.has(cacheKey)) {
            console.log('⏳ Requête en cours, attente...', endpoint);
            return this.pendingRequests.get(cacheKey);
        }
        
        const isFormData = options.body instanceof FormData;
        
        const headers = { ...options.headers };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        if (!isFormData && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        
        const config = {
            ...options,
            headers
        };

        if (!isFormData && config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        // Créer la promesse de requête
        const requestPromise = fetch(url, config)
            .then(async response => {
                if (response.status === 401) {
                    console.warn('⚠️ Session expirée');
                    this.logout();
                    throw new Error('Session expirée');
                }
                
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorData;
                    try {
                        errorData = JSON.parse(errorText);
                    } catch (e) {
                        errorData = { error: errorText || `Erreur ${response.status}` };
                    }
                    throw new Error(errorData.error || errorData.message || `Erreur ${response.status}`);
                }

                if (response.status === 204) {
                    return { success: true };
                }

                const result = await response.json();
                
                // Mettre en cache les GET réussis
                if ((!options.method || options.method === 'GET') && !options.skipCache) {
                    apiCache.set(cacheKey, result);
                }
                
                return result;
            })
            .finally(() => {
                // Nettoyer les requêtes en cours
                this.pendingRequests.delete(cacheKey);
            });
        
        // Stocker la requête en cours
        this.pendingRequests.set(cacheKey, requestPromise);
        
        return requestPromise;
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
        body: JSON.stringify(data)
    });
}

async creerEtudiant(data) {
    return this.request('/admin/etudiant/creer', {
        method: 'POST',
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
// Dans la classe ApiClient, section MÉTHODES GESTION ÉTUDIANTS

// Récupérer la dernière inscription d'un étudiant
async getDerniereInscription(etudiantId) {
    return this.request(`/admin/etudiants/${etudiantId}/derniere-inscription`);
}
async getInscriptionDetails(inscriptionId) {
    return this.request(`/admin/etudiants/inscription/${inscriptionId}`);
}

// Récupérer le reçu d'inscription d'un étudiant
async getRecuEtudiant(etudiantId) {
    return this.request(`/admin/etudiants/etudiant/${etudiantId}/recu`);
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
async getStatsInscriptions() {
    return this.request('/inscription/stats');
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
                    body: JSON.stringify({ actif, raison })
                });
            }

            // Obtenir le statut global
            async getStatutGlobalInscriptions() {
                return this.request('/admin/inscription/statut-global');
            }

    // Méthodes d'authentification
    async register(userData) {
        const response = await this.request('/auth/register', {
            method: 'POST',
            body: userData
        });
        return response;
    }

    async login(credentials) {
        const response = await this.request('/auth/login', {
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
// Dans la classe ApiClient
async updateApplicationStatus(applicationId, status) {
  const response = await this.request(`/admin/applications/${applicationId}/status`, {
    method: 'PUT',
    body: { statut: status }
  });
  
  // ✅ Vider le cache des applications
  apiCache.clear('applications');
  apiCache.clear('admin/applications');
  
  return response;
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
// =================== SYSTÈME DE CACHE ===================


// Fonctions utilitaires pour l'interface
// Fonctions utilitaires pour l'interface
// Fonctions utilitaires pour l'interface
// =================== CLASSE UIHELPERS CORRIGÉE ===================
class UIHelpers {
    static showMessage(message, type = 'info') {
        // Créer un élément de notification
        const notification = document.createElement('div');
        notification.className = 'custom-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10001;
            max-width: 400px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
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

        // Ajouter l'animation CSS une seule fois
        if (!document.getElementById('notificationStyles')) {
            const style = document.createElement('style');
            style.id = 'notificationStyles';
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
        }

        document.body.appendChild(notification);

        // Supprimer après 5 secondes
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    static showLoading(show = true) {
        console.log(`🔄 showLoading appelé avec: ${show}`);
        
        let loader = document.getElementById('globalLoader');
        
        if (show) {
            // Supprimer l'ancien loader s'il existe
            if (loader) {
                console.log('🗑️ Suppression ancien loader');
                loader.remove();
            }
            
            // Créer un nouveau loader
            console.log('✨ Création nouveau loader');
            loader = document.createElement('div');
            loader.id = 'globalLoader';
            loader.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: rgba(0, 0, 0, 0.7) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 99999 !important;
                opacity: 1 !important;
                visibility: visible !important;
            `;
            
            loader.innerHTML = `
                <div style="
                    background: white;
                    padding: 40px;
                    border-radius: 15px;
                    text-align: center;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                    min-width: 200px;
                ">
                    <div class="spinner"></div>
                    <p style="
                        margin: 15px 0 0 0;
                        color: #333;
                        font-weight: 600;
                        font-size: 16px;
                        font-family: Arial, sans-serif;
                    ">Chargement...</p>
                </div>
            `;
            
            // Ajouter le style du spinner une seule fois
            if (!document.getElementById('spinnerStyles')) {
                const style = document.createElement('style');
                style.id = 'spinnerStyles';
                style.textContent = `
                    .spinner {
                        width: 60px;
                        height: 60px;
                        border: 6px solid #f3f3f3;
                        border-top: 6px solid #667eea;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 0 auto;
                    }
                    
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    
                    #globalLoader {
                        pointer-events: all !important;
                    }
                `;
                document.head.appendChild(style);
            }
            
            document.body.appendChild(loader);
            document.body.style.overflow = 'hidden';
            
            console.log('✅ Loader affiché');
            
        } else {
            // Masquer et supprimer le loader
            if (loader) {
                console.log('❌ Masquage loader');
                loader.style.opacity = '0';
                loader.style.transition = 'opacity 0.3s ease';
                
                setTimeout(() => {
                    if (loader && loader.parentNode) {
                        loader.remove();
                        document.body.style.overflow = '';
                        console.log('✅ Loader supprimé');
                    }
                }, 300);
            } else {
                console.log('⚠️ Aucun loader à masquer');
                document.body.style.overflow = '';
            }
        }
    }
    
    static showError(message) {
        console.error('❌', message);
        this.showMessage(message, 'error');
    }

    static showSuccess(message) {
        console.log('✅', message);
        this.showMessage(message, 'success');
    }

    static showWarning(message) {
        console.warn('⚠️', message);
        this.showMessage(message, 'warning');
    }

    static showInfo(message) {
        console.info('ℹ️', message);
        this.showMessage(message, 'info');
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

// =================== FONCTION DE TEST DU LOADER ===================
function testerLoader() {
    console.log('🧪 === TEST DU LOADER ===');
    
    console.log('1. Affichage du loader...');
    UIHelpers.showLoading(true);
    
    setTimeout(() => {
        console.log('2. Loader devrait être visible maintenant');
        console.log('3. Masquage dans 2 secondes...');
    }, 1000);
    
    setTimeout(() => {
        console.log('4. Masquage du loader...');
        UIHelpers.showLoading(false);
        console.log('5. Test terminé ✅');
    }, 3000);
}

// Export pour usage global
window.testerLoader = testerLoader;

console.log('✅ UIHelpers chargé. Tapez "testerLoader()" dans la console pour tester.');
// Instance globale du client API
const apiClient = new ApiClient();

// Variables globales
let currentApplicationData = {};

// Fonctions d'affichage des pages
// Fonctions d'affichage des pages
// ========== PARTIE OPTIMISÉE : CHARGEMENT DES PAGES ==========

function showPage(pageId) {
    console.log('📄 Navigation vers:', pageId);
    
    // Masquer toutes les pages
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    
    const targetPage = document.getElementById(pageId);
    if (!targetPage) {
        console.error('❌ Page non trouvée:', pageId);
        return;
    }
    
    targetPage.classList.add('active');
    
    // Mettre à jour l'UI immédiatement
    if (typeof updateUI === 'function') {
        updateUI();
    }
    
    // ✅ CORRECTION : Pas de loading pour ces pages
    const pagesSansLoading = ['connexion', 'inscription', 'accueil', 'dashboard', 'profil'];
    
    if (pagesSansLoading.includes(pageId)) {
        // Chargement léger sans spinner
        setTimeout(() => chargerDonneesPageSecurisee(pageId), 50);
    } else {
        // Avec délai pour les pages complexes
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => chargerDonneesPageSecurisee(pageId), { timeout: 500 });
        } else {
            setTimeout(() => chargerDonneesPageSecurisee(pageId), 200);
        }
    }
}

// ✅ Fonction SÉCURISÉE de chargement
function chargerDonneesPageSecurisee(pageId) {
    try {
        console.log('🔍 Tentative chargement pour:', pageId);
        
        // ✅ Vérifier que l'utilisateur est connecté pour les pages protégées
        const pagesProtegees = ['profil', 'mesDossiers', 'gestionUtilisateurs', 
                                'gestionDossiers', 'gestionEtudiants', 'configInscription', 
                                'statistiques', 'gestionFormations', 'adminPanel'];
        
        if (pagesProtegees.includes(pageId)) {
            const token = localStorage.getItem('authToken');
            if (!token) {
                console.warn('⚠️ Aucun token - redirection vers connexion');
                showPage('connexion');
                return;
            }
        }
        
        // ✅ Mapping des chargeurs avec vérifications
        const chargeurs = {
            'profil': () => {
                if (typeof chargerProfil === 'function') {
                    chargerProfil();
                } else {
                    console.warn('⚠️ chargerProfil non disponible');
                    chargerProfilFallback();
                }
            },
            
            'mesDossiers': () => {
                if (typeof chargerMesDossiers === 'function') {
                    chargerMesDossiers();
                } else {
                    console.warn('⚠️ chargerMesDossiers non disponible');
                }
            },
            
            'gestionUtilisateurs': () => {
                if (typeof chargerUtilisateurs === 'function') {
                    chargerUtilisateurs();
                } else {
                    console.warn('⚠️ chargerUtilisateurs non disponible');
                }
            },
            
            'gestionDossiers': () => {
                if (typeof chargerDossiersAdmin === 'function') {
                    chargerDossiersAdmin();
                } else {
                    console.warn('⚠️ chargerDossiersAdmin non disponible');
                }
            },
            
            'gestionEtudiants': () => {
                if (typeof chargerEtudiants === 'function') {
                    chargerEtudiants();
                } else {
                    console.warn('⚠️ chargerEtudiants non disponible');
                }
            },
            
            'configInscription': () => {
                const fonctions = [
                    { nom: 'chargerConfigInscription', fn: chargerConfigInscription },
                    { nom: 'chargerRestrictions', fn: chargerRestrictions },
                    { nom: 'prepareRestrictionForm', fn: prepareRestrictionForm },
                    { nom: 'chargerStatutGlobalInscriptions', fn: chargerStatutGlobalInscriptions }
                ];
                
                fonctions.forEach(({ nom, fn }) => {
                    if (typeof fn === 'function') {
                        try {
                            fn();
                        } catch (error) {
                            console.error(`❌ Erreur ${nom}:`, error);
                        }
                    } else {
                        console.warn(`⚠️ ${nom} non disponible`);
                    }
                });
            },
            
            'statistiques': () => {
                if (typeof chargerTableauBordStats === 'function') {
                    chargerTableauBordStats();
                } else if (typeof chargerStatistiques === 'function') {
                    chargerStatistiques();
                } else {
                    console.warn('⚠️ Fonctions statistiques non disponibles');
                }
            },
            
            'gestionFormations': () => {
                if (typeof chargerFacultes === 'function') {
                    const activeTab = document.querySelector('.tab-content.active');
                    if (!activeTab || activeTab.id === 'facultes-tab') {
                        chargerFacultes();
                    }
                } else {
                    console.warn('⚠️ chargerFacultes non disponible');
                }
            },
            
            'adminPanel': () => {
                console.log('📊 Panel admin affiché - pas de chargement nécessaire');
            },
            
            'dashboard': () => {
                console.log('🏠 Dashboard affiché - pas de chargement nécessaire');
            },
            
            'accueil': () => {
                console.log('🏠 Page d\'accueil - pas de chargement nécessaire');
            }
        };
        
        const chargeur = chargeurs[pageId];
        
        if (chargeur) {
            console.log('✅ Chargement données:', pageId);
            chargeur();
        } else {
            console.log('ℹ️ Aucun chargeur défini pour:', pageId);
        }
        
    } catch (error) {
        console.error('❌ Erreur chargement page:', error);
        console.error('Stack:', error.stack);
        
        // NE PAS afficher d'erreur à l'utilisateur si c'est juste un chargeur manquant
        if (error.message && !error.message.includes('is not a function')) {
            if (typeof UIHelpers !== 'undefined' && typeof UIHelpers.showError === 'function') {
                UIHelpers.showError('Erreur lors du chargement de la page');
            }
        }
    }
}

// ✅ Fonction fallback pour charger le profil
async function chargerProfilFallback() {
    try {
        if (!apiClient || !apiClient.currentUser) {
            console.warn('⚠️ Pas d\'utilisateur connecté');
            return;
        }
        
        // Pré-remplir avec les données en cache
        const user = apiClient.currentUser;
        
        const fields = {
            'profilNom': user.nom,
            'profilEmail': user.email,
            'profilTelephone': user.telephone
        };
        
        Object.entries(fields).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.value = value || '';
            }
        });
        
        console.log('✅ Profil chargé depuis cache');
        
    } catch (error) {
        console.error('❌ Erreur chargement profil fallback:', error);
    }
}

// ✅ Fonction de diagnostic
function diagnostiquerChargeurs() {
    console.log('🔍 DIAGNOSTIC DES CHARGEURS:');
    
    const fonctionsRequises = [
        'chargerProfil',
        'chargerMesDossiers',
        'chargerUtilisateurs',
        'chargerDossiersAdmin',
        'chargerEtudiants',
        'chargerConfigInscription',
        'chargerRestrictions',
        'prepareRestrictionForm',
        'chargerStatutGlobalInscriptions',
        'chargerTableauBordStats',
        'chargerStatistiques',
        'chargerFacultes'
    ];
    
    fonctionsRequises.forEach(nom => {
        const existe = typeof window[nom] === 'function';
        console.log(`${existe ? '✅' : '❌'} ${nom}: ${existe ? 'OK' : 'MANQUANT'}`);
    });
    
    console.log('\n🔍 Variables globales:');
    console.log('- apiClient:', typeof apiClient !== 'undefined' ? '✅' : '❌');
    console.log('- UIHelpers:', typeof UIHelpers !== 'undefined' ? '✅' : '❌');
    console.log('- currentUser:', apiClient?.currentUser ? '✅' : '❌');
    console.log('- authToken:', localStorage.getItem('authToken') ? '✅' : '❌');
}

// ✅ Exporter pour utilisation globale


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

// =================== PRÉ-CHARGEMENT INTELLIGENT ===================
async function prechargerDonneesEssentielles() {
    if (!apiClient.token) return;
    
    console.log('🚀 Pré-chargement des données essentielles...');
    
    try {
        const role = apiClient.currentUser?.role;
        
        if (role === 'admin') {
            // Pré-charger en parallèle
            await apiClient.requestBatch([
                '/admin/facultes',
                '/admin/type-bacs',
                '/admin/filieres'
            ]);
            console.log('✅ Données admin pré-chargées');
        }
        
    } catch (error) {
        console.warn('⚠️ Erreur pré-chargement:', error);
    }
}

// Appeler après la connexion
async function login(event) {
    event.preventDefault();
    
    try {
        
        
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
// =================== MONITORING PERFORMANCE ===================
class PerformanceMonitor {
    constructor() {
        this.metrics = [];
    }
    
    startMeasure(name) {
        return {
            name,
            start: performance.now(),
            end: () => {
                const duration = performance.now() - this.start;
                this.metrics.push({ name, duration });
                console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`);
                return duration;
            }
        };
    }
    
    getAverageTime(name) {
        const relevant = this.metrics.filter(m => m.name === name);
        if (relevant.length === 0) return 0;
        const sum = relevant.reduce((acc, m) => acc + m.duration, 0);
        return sum / relevant.length;
    }
    
    report() {
        console.log('📊 Rapport de performance:');
        const grouped = {};
        this.metrics.forEach(m => {
            if (!grouped[m.name]) grouped[m.name] = [];
            grouped[m.name].push(m.duration);
        });
        
        Object.entries(grouped).forEach(([name, times]) => {
            const avg = times.reduce((a, b) => a + b) / times.length;
            console.log(`  ${name}: ${avg.toFixed(2)}ms (${times.length} appels)`);
        });
    }
}

const perfMonitor = new PerformanceMonitor();

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
// Fonction de soumission de candidature
// Cherchez la fonction submitApplication et modifiez-la comme ceci :

async function submitApplication(event) {
    event.preventDefault();
    
    try {
        UIHelpers.showLoading(true);
        
        if (!apiClient.token) {
            UIHelpers.showError('Vous devez être connecté pour soumettre un dossier');
            showPage('connexion');
            return;
        }
        
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
        
        const response = await apiClient.submitApplication(formData);
        
        // ✅ CORRECTION : Afficher la confirmation
        afficherConfirmationInscription(response.application);
        
        // ✅ NOUVEAU : Vider le cache des dossiers pour forcer le rechargement
        apiCache.clear('applications/my');
        
        // ✅ NOUVEAU : Pré-charger les dossiers en arrière-plan
        setTimeout(async () => {
            try {
                await apiClient.getMyApplications();
                console.log('✅ Dossiers pré-chargés en cache');
            } catch (error) {
                console.warn('⚠️ Erreur pré-chargement dossiers:', error);
            }
        }, 1000);
        
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

// Fonction pour afficher la page de confirmation après soumission
// Fonction pour afficher la page de confirmation après soumission
function afficherConfirmationInscription(application) {
    try {
        // Remplir les informations
        document.getElementById('confirmNomPrenom').textContent = 
            `${application.prenom} ${application.nom}`;
        
        document.getElementById('confirmNumeroDossier').textContent = 
            application.numero_dossier || 'En attente';
        
        document.getElementById('confirmEmail').textContent = application.email;
        document.getElementById('confirmTelephone').textContent = application.telephone;
        
        document.getElementById('confirmDateNaissance').textContent = 
            new Date(application.date_naissance).toLocaleDateString('fr-FR');
        
        // Choix
        document.getElementById('confirmPremierChoix').textContent = application.premier_choix;
        document.getElementById('confirmDeuxiemeChoix').textContent = application.deuxieme_choix;
        document.getElementById('confirmTroisiemeChoix').textContent = application.troisieme_choix;
        
        // Documents
        const documentsContainer = document.getElementById('confirmDocuments');
        const documentTypes = {
            'photoIdentite': '📷 Photo d\'identité',
            'pieceIdentite': '🆔 Pièce d\'identité',
            'diplomeBac': '🎓 Diplôme de Bac',
            'releve': '📊 Relevé de notes',
            'certificatNationalite': '🌍 Certificat de nationalité'
        };
        
        const documents = typeof application.documents === 'string' 
            ? JSON.parse(application.documents) 
            : application.documents || {};
        
        documentsContainer.innerHTML = '';
        Object.entries(documentTypes).forEach(([type, label]) => {
            const filename = documents[type];
            const isPresent = filename && filename !== 'Non fourni' && filename !== 'Optionnel';
            
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.style.cssText = `
                padding: 12px 15px;
                background: ${isPresent ? '#d1ecf1' : '#e9ecef'};
                color: ${isPresent ? '#0c5460' : '#6c757d'};
                border: 1px solid ${isPresent ? '#bee5eb' : '#dee2e6'};
                border-radius: 8px;
                text-align: left;
                cursor: ${isPresent ? 'pointer' : 'default'};
            `;
            
            if (isPresent) {
                btn.innerHTML = `<span>${label}</span>`;
                btn.onclick = () => telechargerDocument(application.id, type);
            } else {
                btn.innerHTML = `<span>${label}</span> <small style="float: right;">Non fourni</small>`;
                btn.disabled = true;
            }
            
            documentsContainer.appendChild(btn);
        });
        
        // Bouton de téléchargement du quitus
        document.getElementById('btnTelechargerQuitusConfirm').onclick = () => {
            genererQuitusAvecDonnees(application);
        };
        
        // ✅ NOUVEAU : Ajouter un bouton pour aller à "Mes Dossiers"
        const btnMesDossiers = document.createElement('button');
        btnMesDossiers.className = 'btn btn-primary';
        btnMesDossiers.style.cssText = 'margin-top: 20px; width: 100%;';
        btnMesDossiers.innerHTML = '📋 Voir tous mes dossiers';
        btnMesDossiers.onclick = () => {
            navigateToUserPage('mesDossiers');
        };
        
        // Ajouter le bouton après le bouton quitus
        const btnContainer = document.getElementById('btnTelechargerQuitusConfirm').parentElement;
        btnContainer.appendChild(btnMesDossiers);
        
        // Afficher la page de confirmation
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('confirmationInscription').classList.add('active');
        
        // Message de succès
        UIHelpers.showSuccess('✅ Dossier soumis avec succès! Veuillez télécharger votre quitus.');
        
        // Réinitialiser currentApplicationData
        currentApplicationData = {};
        
        // ✅ CORRECTION : Vider le cache après un court délai
        setTimeout(() => {
            apiCache.clear('applications/my');
            console.log('🗑️ Cache dossiers vidé');
        }, 500);
        
    } catch (error) {
        console.error('Erreur affichage confirmation:', error);
        UIHelpers.showError('Erreur lors de l\'affichage de la confirmation');
    }
}
// =================== GESTION CACHE APRÈS MODIFICATIONS ===================

// Fonction pour vider le cache après une modification admin
function viderCacheApresModification(type) {
    console.log('🗑️ Vidage cache après modification:', type);
    
    switch(type) {
        case 'dossier':
            apiCache.clear('admin/applications');
            apiCache.clear('applications');
            break;
            
        case 'etudiant':
            apiCache.clear('admin/etudiants');
            apiCache.clear('admin/inscription');
            break;
            
        case 'faculte':
            apiCache.clear('admin/facultes');
            apiCache.clear('facultes');
            break;
            
        case 'filiere':
            apiCache.clear('admin/filieres');
            apiCache.clear('filieres');
            apiCache.clear('filieres-by-bac');
            break;
            
        case 'typebac':
            apiCache.clear('admin/type-bacs');
            apiCache.clear('type-bacs');
            break;
            
        case 'diplome':
            apiCache.clear('admin/diplomes');
            break;
            
        case 'restriction':
            apiCache.clear('admin/inscription/restrictions');
            break;
            
        case 'config':
            apiCache.clear('admin/inscription/config');
            break;
            
        case 'utilisateur':
            apiCache.clear('admin/users');
            break;
            
        case 'stats':
            // Vider tous les caches de stats
            apiCache.clear('admin/stats');
            apiCache.clear('inscription/stats');
            break;
            
        default:
            console.warn('⚠️ Type de cache non reconnu:', type);
    }
}

// Export global
window.viderCacheApresModification = viderCacheApresModification;
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
// ✅ FONCTION AMÉLIORÉE: Fermer modal et rafraîchir
function fermerModalDetails() {
    const overlay = document.getElementById('detailsModalOverlay');
    if (overlay) {
        overlay.remove();
        
        // ✅ Vider le cache des dossiers
        viderCacheApresModification('dossier');
        
        // ✅ Rafraîchir la liste après fermeture du modal
        const currentPage = document.querySelector('.page.active');
        
        if (currentPage) {
            const pageId = currentPage.id;
            
            setTimeout(() => {
                if (pageId === 'gestionDossiers' || pageId === 'admin-content') {
                    // Page admin - recharger la liste admin
                    if (typeof chargerDossiersAdmin === 'function') {
                        chargerDossiersAdmin();
                    }
                } else if (pageId === 'mesDossiers' || document.querySelector('#user-content .page.active')?.id === 'mesDossiers') {
                    // Page utilisateur - recharger ses dossiers
                    if (typeof chargerMesDossiers === 'function') {
                        chargerMesDossiers();
                    }
                }
            }, 300);
        }
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

// ✅ NOUVELLE FONCTION: Fermer modal et rafraîchir
function fermerModalDetails() {
    const overlay = document.getElementById('detailsModalOverlay');
    if (overlay) {
        overlay.remove();
        
        // ✅ Rafraîchir la liste après fermeture du modal
        const currentPage = document.querySelector('.page.active');
        if (currentPage) {
            const pageId = currentPage.id;
            
            setTimeout(() => {
                if (pageId === 'gestionDossiers' && typeof chargerDossiersAdmin === 'function') {
                    chargerDossiersAdmin();
                } else if (pageId === 'mesDossiers' && typeof chargerMesDossiers === 'function') {
                    chargerMesDossiers();
                }
            }, 300);
        }
    }
}

// Fonction pour télécharger un document
async function telechargerDocument(applicationId, documentType) {
    try {
        
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
        
        // ✅ Vider le cache avant la recherche
        viderCacheApresModification('dossier');
        
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
document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('authToken');
    if (token && typeof apiClient !== 'undefined') {
        apiClient.token = token;
        
        // Récupérer aussi l'utilisateur
        const userStr = localStorage.getItem('currentUser');
        if (userStr) {
            try {
                apiClient.currentUser = JSON.parse(userStr);
            } catch (e) {
                console.error('Erreur parsing currentUser:', e);
            }
        }
        
        console.log('✅ ApiClient initialisé avec token');
    }
});

// Fonction pour changer le mot de passe
async function changePassword(event) {
    event.preventDefault();
    
    try {
        
        
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
// ✅ Fonction chargerMesDossiers AMÉLIORÉE - Support mobile complet
async function chargerMesDossiers() {
  try {
    if (!apiClient.currentUser) return;
    
    console.log('📋 Chargement dossiers...');
    
    const response = await apiClient.getMyApplications();
    const applications = response.applications || [];
    
    console.log(`✅ ${applications.length} dossier(s) trouvé(s)`);
    
    // Charger dans le tableau (desktop)
    chargerTableauDossiers(applications);
    
    // Charger dans les cartes (mobile)
    chargerCartesDossiers(applications);
    
  } catch (error) {
    console.error('❌ Erreur chargement dossiers:', error);
    UIHelpers.showError('Erreur lors du chargement des dossiers');
  }
}

// ===== CHARGEMENT TABLEAU (Desktop) =====
function chargerTableauDossiers(applications) {
    const tableau = document.getElementById('tableauDossiers');
    if (!tableau) return;
    
    tableau.innerHTML = '';
    
    if (applications.length === 0) {
        tableau.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 40px;">
                    <div class="empty-state">
                        <div class="empty-state-icon">📂</div>
                        <div class="empty-state-text">Aucun dossier déposé pour le moment</div>
                        <button class="btn btn-primary" onclick="startApplicationProcess()" 
                                style="margin-top: 20px;">
                            ➕ Déposer un nouveau dossier
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // Créer les lignes du tableau
    applications.forEach(app => {
        const row = document.createElement('tr');
        
        const statutClass = app.statut === 'approuve' ? 'status-approved' : 
                          app.statut === 'rejete' ? 'status-rejected' : 'status-pending';
        const statutText = app.statut === 'approuve' ? '✅ Approuvé' : 
                         app.statut === 'rejete' ? '❌ Rejeté' : '⏳ En attente';
        
        row.innerHTML = `
            <td>${new Date(app.created_at).toLocaleDateString('fr-FR')}</td>
            <td><strong>${app.nom} ${app.prenom}</strong></td>
            <td><code style="background: #f0f0f0; padding: 3px 8px; border-radius: 4px;">${app.numero_dossier}</code></td>
            <td><span class="status-badge ${statutClass}">${statutText}</span></td>
            <td>
                <button class="btn btn-secondary" onclick="voirMonDossier(${app.id})" 
                        style="padding: 8px 12px; margin: 2px;">
                    👁️ Voir
                </button>
                <button class="btn" onclick="modifierDossier(${app.id})" 
                        style="padding: 8px 12px; margin: 2px; background: #ffc107; color: white;">
                    ✏️ Modifier
                </button>
                <button class="btn btn-primary" onclick="telechargerQuitusFromApp(${app.id})" 
                        style="padding: 8px 12px; margin: 2px;">
                    📄 Quitus
                </button>
            </td>
        `;
        tableau.appendChild(row);
    });
}

// ===== CHARGEMENT CARTES (Mobile) =====
function chargerCartesDossiers(applications) {
    const container = document.getElementById('mobileCardsContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (applications.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="background: white; padding: 40px; border-radius: 12px;">
                <div class="empty-state-icon">📂</div>
                <div class="empty-state-text">Aucun dossier déposé</div>
                <button class="btn btn-primary" onclick="startApplicationProcess()" 
                        style="margin-top: 20px; width: 100%; padding: 15px;">
                    ➕ Nouveau dossier
                </button>
            </div>
        `;
        return;
    }
    
    // Créer les cartes
    applications.forEach(app => {
        const card = document.createElement('div');
        card.className = 'mobile-card';
        
        const statutClass = app.statut === 'approuve' ? 'status-approved' : 
                          app.statut === 'rejete' ? 'status-rejected' : 'status-pending';
        const statutText = app.statut === 'approuve' ? '✅ Approuvé' : 
                         app.statut === 'rejete' ? '❌ Rejeté' : '⏳ En attente';
        
        // Changer la couleur du border-left selon le statut
        const borderColor = app.statut === 'approuve' ? '#28a745' : 
                           app.statut === 'rejete' ? '#dc3545' : '#667eea';
        card.style.borderLeftColor = borderColor;
        
        card.innerHTML = `
            <div class="mobile-card-header">
                <div>
                    <div class="mobile-card-title">${app.nom} ${app.prenom}</div>
                    <div class="mobile-card-date">${new Date(app.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                    })}</div>
                </div>
                <span class="status-badge ${statutClass}">${statutText}</span>
            </div>
            
            <div class="mobile-card-info">
                <div class="mobile-card-row">
                    <span class="mobile-card-label">N° Dossier</span>
                    <span class="mobile-card-value">${app.numero_dossier}</span>
                </div>
                ${app.numero_depot ? `
                <div class="mobile-card-row">
                    <span class="mobile-card-label">N° Dépôt</span>
                    <span class="mobile-card-value" style="color: #28a745;">${app.numero_depot}</span>
                </div>
                ` : ''}
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Premier choix</span>
                    <span class="mobile-card-value" style="font-size: 12px; text-align: right; font-family: inherit;">
                        ${app.premier_choix || 'Non spécifié'}
                    </span>
                </div>
            </div>
            
            <div class="mobile-card-actions">
                <button class="btn btn-secondary" onclick="voirMonDossier(${app.id})">
                    👁️ Voir les détails
                </button>
                <button class="btn" onclick="modifierDossier(${app.id})" 
                        style="background: #ffc107; color: white;">
                    ✏️ Modifier le dossier
                </button>
                <button class="btn btn-primary" onclick="telechargerQuitusFromApp(${app.id})">
                    📄 Télécharger le quitus
                </button>
            </div>
        `;
        
        container.appendChild(card);
    });
    
    console.log(`✅ ${applications.length} carte(s) mobile créée(s)`);
}

// ===== FONCTION UTILITAIRE: Basculer entre vue tableau et cartes =====
function toggleMobileView() {
    const isMobile = window.innerWidth <= 768;
    const tableContainer = document.getElementById('tableContainer');
    const cardsContainer = document.getElementById('mobileCardsContainer');
    
    if (!tableContainer || !cardsContainer) return;
    
    if (isMobile) {
        // Afficher les cartes sur mobile
        tableContainer.style.display = 'none';
        cardsContainer.style.display = 'block';
        console.log('📱 Mode mobile: cartes activées');
    } else {
        // Afficher le tableau sur desktop
        tableContainer.style.display = 'block';
        cardsContainer.style.display = 'none';
        console.log('🖥️ Mode desktop: tableau activé');
    }
}

// ===== ÉCOUTER LES CHANGEMENTS DE TAILLE D'ÉCRAN =====
window.addEventListener('resize', toggleMobileView);
window.addEventListener('load', toggleMobileView);

// ===== APPELER LORS DU CHARGEMENT DE LA PAGE =====
document.addEventListener('DOMContentLoaded', function() {
    // Appliquer la vue correcte au démarrage
    setTimeout(toggleMobileView, 100);
    
    // Détecter le scroll pour masquer l'indicateur
    const tableContainer = document.querySelector('.table-responsive');
    if (tableContainer) {
        tableContainer.addEventListener('scroll', function() {
            this.classList.add('scrolled');
        }, { once: true });
    }
});

// ===== EXPORT GLOBAL =====
window.chargerMesDossiers = chargerMesDossiers;
window.chargerTableauDossiers = chargerTableauDossiers;
window.chargerCartesDossiers = chargerCartesDossiers;
window.toggleMobileView = toggleMobileView;

console.log('✅ Module Mes Dossiers chargé (responsive)');


async function telechargerQuitusFromApp(appId) {
  try {
    
    
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


async function genererQuitusAvecDonnees(application) {
  console.log('Début génération quitus pour:', application);
  
  try {
    // Charger jsPDF
    if (typeof window.jspdf === "undefined") {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      document.head.appendChild(script);
      await new Promise(resolve => script.onload = resolve);
    }

    // Charger la bibliothèque QR Code
    if (typeof QRCode === "undefined") {
      const qrScript = document.createElement("script");
      qrScript.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      document.head.appendChild(qrScript);
      await new Promise(resolve => qrScript.onload = resolve);
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ 
      format: "a4", 
      unit: "mm",
      compress: true
    });

    // ========== EN-TÊTE (OPTIMISÉ) ==========
    // Logo université
    try {
      const logoUrl = 'http://localhost:3000/uploads/logo-universite.png';
      const response = await fetch(logoUrl);
      if (response.ok) {
        const blob = await response.blob();
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        doc.addImage(base64, "PNG", 15, 8, 20, 20);
      }
    } catch (err) {
      console.warn("Logo non chargé:", err);
    }

    // Texte en-tête
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 51, 102);
    doc.text("RÉPUBLIQUE DU NIGER", 105, 12, { align: "center" });
    
    doc.setFontSize(8.5);
    doc.text("MINISTÈRE DE L'ENSEIGNEMENT SUPÉRIEUR DE LA RECHERCHE", 105, 16, { align: "center" });
    doc.text("ET DE L'INNOVATION TECHNOLOGIQUE", 105, 19, { align: "center" });
    doc.text("UNIVERSITÉ DJIBO HAMANI", 105, 22, { align: "center" });
    doc.text("SERVICE CENTRAL DE LA SCOLARITÉ (SCScol)", 105, 25, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Tel: 86 15 67 79 | BP: 237 Tahoua / Niger | Email: scscol.udh@gmail.com", 105, 29, { align: "center" });

    // Double trait
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.5);
    doc.line(15, 32, 195, 32);
    doc.setLineWidth(1.2);
    doc.line(15, 33.5, 195, 33.5);

    // ========== TITRE (OPTIMISÉ) ==========
    let y = 42;
    
    doc.setFillColor(0, 51, 102);
    doc.rect(35, y, 140, 10, 'F');
    
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("QUITTANCE DE PRÉINSCRIPTION", 105, y + 6.5, { align: "center" });
    
    y += 14;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("au titre de l'année académique 2025-2026", 105, y, { align: "center" });

    // Numéros
    y += 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`N° de quitus: ${application.numero_dossier || "En attente"}`, 20, y);
    doc.text(`N° de dépôt: ${application.numero_depot || "En attente"}`, 130, y);

    // ========== SECTION IDENTIFICATION ==========
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 51, 102);
    doc.text("IDENTIFICATION DU BACHELIER", 20, y);
    
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.5);
    doc.line(20, y + 1, 195, y + 1);
    doc.setLineWidth(1.2);
    doc.line(20, y + 2.5, 195, y + 2.5);

    y += 6;

    // Photo
    const photoX = 22;
    const photoY = y;
    const photoWidth = 28;
    const photoHeight = 33;
    let photoAdded = false;

    try {
      const documents = typeof application.documents === 'string' 
        ? JSON.parse(application.documents) 
        : application.documents || {};

      if (documents?.photoIdentite && documents.photoIdentite !== 'Non fourni') {
        const photoUrl = `http://localhost:3000/uploads/${documents.photoIdentite}`;
        
        await new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          
          img.onload = function() {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              const pixelWidth = photoWidth * 3.78;
              const pixelHeight = photoHeight * 3.78;
              
              canvas.width = pixelWidth;
              canvas.height = pixelHeight;
              
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, pixelWidth, pixelHeight);
              
              const imgRatio = img.width / img.height;
              const canvasRatio = pixelWidth / pixelHeight;
              
              let drawWidth, drawHeight, offsetX, offsetY;
              
              if (imgRatio > canvasRatio) {
                drawHeight = pixelHeight;
                drawWidth = img.width * (pixelHeight / img.height);
                offsetX = (pixelWidth - drawWidth) / 2;
                offsetY = 0;
              } else {
                drawWidth = pixelWidth;
                drawHeight = img.height * (pixelWidth / img.width);
                offsetX = 0;
                offsetY = (pixelHeight - drawHeight) / 2;
              }
              
              ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
              
              const dataURL = canvas.toDataURL('image/jpeg', 0.85);
              doc.addImage(dataURL, 'JPEG', photoX, photoY, photoWidth, photoHeight);
              
              doc.setDrawColor(0, 0, 0);
              doc.setLineWidth(0.3);
              doc.rect(photoX, photoY, photoWidth, photoHeight);
              
              photoAdded = true;
              console.log('Photo ajoutée');
              resolve();
              
            } catch (error) {
              console.error('Erreur photo:', error);
              resolve();
            }
          };
          
          img.onerror = () => resolve();
          setTimeout(() => resolve(), 5000);
          
          img.src = photoUrl;
        });
      }
    } catch (error) {
      console.warn('Erreur traitement photo:', error);
    }

    if (!photoAdded) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(photoX, photoY, photoWidth, photoHeight);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('PHOTO', photoX + photoWidth/2, photoY + photoHeight/2, { align: 'center' });
    }

    // Informations personnelles (COMPACTÉES)
    const infoX = 56;
    let infoY = y + 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);

    const infos = [
      `Nom: ${application.nom || ""}`,
      `Prénom: ${application.prenom || ""}`,
      `Date de naissance: ${application.date_naissance ? new Date(application.date_naissance).toLocaleDateString('fr-FR') : ""}`,
      `Lieu: ${application.lieu_naissance || ""}`,
      `Nationalité: ${application.nationalite || ""}`,
      `Genre: ${application.genre === 'masculin' ? 'Masculin' : 'Féminin'}`,
      `Email: ${application.email || ""}`,
      `Téléphone: ${application.telephone || ""}`,
      `Adresse: ${application.adresse || ""}`
    ];

    infos.forEach(text => {
      doc.text(text, infoX, infoY);
      infoY += 4.2;
    });

    // ========== QR CODE (OPTIMISÉ) ==========
    const qrX = 160;
    const qrY = y;
    const qrSize = 32;

    try {
      const qrData = JSON.stringify({
        numero_dossier: application.numero_dossier || "En attente",
        numero_depot: application.numero_depot || "En attente",
        nom: application.nom,
        prenom: application.prenom,
        date_naissance: application.date_naissance,
        email: application.email
      });

      const qrContainer = document.createElement('div');
      qrContainer.style.display = 'none';
      document.body.appendChild(qrContainer);

      const qrCode = new QRCode(qrContainer, {
        text: qrData,
        width: 100,
        height: 100,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const qrImage = qrContainer.querySelector('img');
      if (qrImage && qrImage.src) {
        doc.addImage(qrImage.src, 'PNG', qrX, qrY, qrSize, qrSize);
        
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        doc.rect(qrX, qrY, qrSize, qrSize);
        
        doc.setFontSize(7);
        doc.setTextColor(0, 0, 0);
        doc.text('Scanner pour vérifier', qrX + qrSize/2, qrY + qrSize + 3, { align: 'center' });
        
        console.log('✅ QR Code ajouté');
      }

      document.body.removeChild(qrContainer);

    } catch (error) {
      console.warn('Erreur QR Code:', error);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(qrX, qrY, qrSize, qrSize);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('QR CODE', qrX + qrSize/2, qrY + qrSize/2, { align: 'center' });
    }

    // ========== SECTION DIPLÔME (OPTIMISÉ) ==========
    y += 44;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 51, 102);
    doc.text("INFORMATION DU DIPLÔME (BAC)", 20, y);
    
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.5);
    doc.line(20, y + 1, 195, y + 1);
    doc.setLineWidth(1.2);
    doc.line(20, y + 2.5, 195, y + 2.5);

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);

    doc.text(`Niveau: Supérieur`, 22, y);
    doc.text(`Nom du diplôme: ${application.type_bac || ""}`, 110, y);
    y += 5;
    doc.text(`Année d'obtention: ${application.annee_obtention || ""}`, 22, y);
    doc.text(`Mention: ${application.mention || ""}`, 110, y);
    y += 5;
    doc.text(`Pays d'obtention: Niger`, 22, y);
    doc.text(`Région: ${application.lieu_obtention || ""}`, 110, y);

    // ========== SECTION CHOIX (OPTIMISÉ) ==========
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 51, 102);
    doc.text("LES CHOIX DE SECTIONS", 20, y);
    
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.5);
    doc.line(20, y + 1, 195, y + 1);
    doc.setLineWidth(1.2);
    doc.line(20, y + 2.5, 195, y + 2.5);

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Je soussigné(e), manifeste mon intérêt pour entreprendre des études dans les sections ci-dessus par ordre de', 22, y);
    y += 4;
    doc.text('préférence.', 22, y);
    
    
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(`Premier choix: ${application.premier_choix || ""}`, 22, y);
    y += 5;
    doc.text(`Deuxième choix: ${application.deuxieme_choix || ""}`, 22, y);
    y += 5;
    doc.text(`Troisième choix: ${application.troisieme_choix || ""}`, 22, y);

    // ========== SECTION DOCUMENTS (OPTIMISÉ) ==========
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 51, 102);
    doc.text("LISTE DES FICHIERS JOINTS", 20, y);
    
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.5);
    doc.line(20, y + 1, 195, y + 1);
    doc.setLineWidth(1.2);
    doc.line(20, y + 2.5, 195, y + 2.5);

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const docs = [
      "- Attestation du Bac",
      "- Relevé de notes",
      "- Extrait de naissance",
      "- Certificat de nationalité"
    ];
    docs.forEach(d => {
      doc.text(d, 22, y);
      y += 4.5;
    });
    doc.setDrawColor(255, 193, 7);
    doc.setFillColor(255, 243, 205);
    doc.rect(20, y, 175, 18, 'FD');
    // ========== NOTE FINALE (OPTIMISÉ) ==========
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    const noteText = `NB: La validation de la préinscription est assujettie au dépôt, au Service Central de la Scolarité, du Lundi 28 Juillet au Vendredi 29 Août 2025 inclus, d'un dossier physique constitué du quitus de préinscription et des documents joints en ligne.`;
    doc.text(noteText, 22, y, { maxWidth: 170, align: "justify" });

    y += 16;
    doc.setFontSize(8.5);
    doc.text("Je soussigné(e) certifie exactes les informations ci-dessus.", 22, y);
    
    y += 6;
    const today = new Date().toLocaleDateString("fr-FR", { 
      weekday: "long", 
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    });
    doc.text(`Fait le ${today}`, 22, y);
    doc.text("Signature du candidat", 150, y + 12);

    // ========== PIED DE PAGE ==========
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 51, 102);
    doc.text("Université Djibo Hamani - Service Central de la Scolarité", 105, 280, { align: "center" });

    // Numéro de document
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    const numeroDoc = `QUITUS-${application.numero_dossier || "EN-ATTENTE"}-${Date.now()}`;
    doc.text(`N° ${numeroDoc}`, 105, 285, { align: "center" });

    // Sauvegarde
    const nomFichier = `Quitus_${(application.nom || "").replace(/\s+/g, "_")}_${(application.prenom || "").replace(/\s+/g, "_")}.pdf`;
    doc.save(nomFichier);
    
    console.log('✅ Quitus généré avec succès');
    UIHelpers.showSuccess('Quitus téléchargé avec succès !');

  } catch (error) {
    console.error("Erreur génération quitus:", error);
    UIHelpers.showError('Erreur lors de la génération du quitus');
    throw error;
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


// =================== PAGINATION ET CHARGEMENT PROGRESSIF ===================
async function chargerDossiersAdmin(page = 1, limit = 50) {
    try {
        const startTime = performance.now();
        console.log('📊 Début chargement dossiers page', page);
        
        const statut = document.getElementById('filtreStatut')?.value || '';
        const filiere = document.getElementById('filtreFiliere')?.value || '';
        
        const filters = { page, limit };
        if (statut) filters.statut = statut;
        if (filiere) filters.filiere = filiere;
        
        // ✅ Requête avec pagination
        const response = await apiClient.getAllApplications(filters);
        const applications = response.applications || [];
        const total = response.total || 0;
        const totalPages = Math.ceil(total / limit);
        
        const endTime = performance.now();
        console.log(`✅ Chargé en ${(endTime - startTime).toFixed(2)}ms`);
        
        const tableau = document.getElementById('tableauDossiersAdmin');
        
        // Si c'est la première page, vider le tableau
        if (page === 1) {
            tableau.innerHTML = '';
        }
        
        if (applications.length === 0 && page === 1) {
            tableau.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #666;">Aucun dossier déposé</td></tr>';
            return;
        }
        
        // ✅ Utiliser DocumentFragment pour améliorer les performances
        const fragment = document.createDocumentFragment();
        
        applications.forEach(app => {
            const row = document.createElement('tr');
            const statutClass = app.statut === 'approuve' ? 'status-approved' : 
                              app.statut === 'rejete' ? 'status-rejected' : 'status-pending';
            const statutText = app.statut === 'approuve' ? 'Approuvé' : 
                             app.statut === 'rejete' ? 'Rejeté' : 'En attente';
            
            row.innerHTML = `
                <td>${new Date(app.created_at).toLocaleDateString('fr-FR')}</td>
                <td><strong>${app.prenom} ${app.nom}</strong></td>
                <td>${app.numero_dossier}</td>
                <td><span class="status-badge ${statutClass}">${statutText}</span></td>
                <td>
                    ${app.numero_depot ? `<small style="color: #666;">Dépôt: ${app.numero_depot}</small><br>` : ''}
                    <button class="btn btn-primary" style="padding: 5px 10px; margin: 2px;" onclick="voirDossier(${app.id})">Voir</button>
                    <button class="btn" style="padding: 5px 10px; margin: 2px; background: #28a745; color: white;" onclick="changerStatutDossier(${app.id}, 'approuve')">Approuver</button>
                    <button class="btn" style="padding: 5px 10px; margin: 2px; background: #dc3545; color: white;" onclick="changerStatutDossier(${app.id}, 'rejete')">Rejeter</button>
                </td>
            `;
            fragment.appendChild(row);
        });
        
        tableau.appendChild(fragment);
        
        // ✅ Ajouter la pagination si nécessaire
        if (totalPages > 1) {
            ajouterPagination('tableauDossiersAdmin', page, totalPages, (newPage) => {
                chargerDossiersAdmin(newPage, limit);
            });
        }
        
    } catch (error) {
        console.error('❌ Erreur chargement dossiers:', error);
        UIHelpers.showError('Erreur lors du chargement des dossiers');
    }
}

// Fonction de pagination réutilisable
function ajouterPagination(tableId, currentPage, totalPages, onPageChange) {
    const container = document.getElementById(tableId).parentElement;
    
    // Supprimer l'ancienne pagination
    const oldPagination = container.querySelector('.pagination-container');
    if (oldPagination) {
        oldPagination.remove();
    }
    
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination-container';
    paginationDiv.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 20px;';
    
    // Bouton Précédent
    if (currentPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '« Précédent';
        prevBtn.className = 'btn btn-secondary';
        prevBtn.onclick = () => onPageChange(currentPage - 1);
        paginationDiv.appendChild(prevBtn);
    }
    
    // Numéros de page
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    
    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'btn btn-primary' : 'btn btn-secondary';
        pageBtn.onclick = () => onPageChange(i);
        paginationDiv.appendChild(pageBtn);
    }
    
    // Bouton Suivant
    if (currentPage < totalPages) {
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Suivant »';
        nextBtn.className = 'btn btn-secondary';
        nextBtn.onclick = () => onPageChange(currentPage + 1);
        paginationDiv.appendChild(nextBtn);
    }
    
    // Info
    const info = document.createElement('span');
    info.textContent = `Page ${currentPage} sur ${totalPages}`;
    info.style.marginLeft = '20px';
    paginationDiv.appendChild(info);
    
    container.appendChild(paginationDiv);
}

// =================== DEBOUNCE POUR RECHERCHES ===================
// =================== DEBOUNCE OPTIMISÉ ===================
function debounce(func, wait = 500) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Recherche optimisée avec debounce
const rechercherDossiersDebounced = debounce(async function() {
    const query = document.getElementById('rechercheDossier')?.value?.trim();
    
    if (!query || query.length < 2) {
        chargerDossiersAdmin(1, 50);
        return;
    }
    
    try {
        
        
        const response = await apiClient.searchApplications(query);
        const applications = response.applications || [];
        
        const tableau = document.getElementById('tableauDossiersAdmin');
        tableau.innerHTML = '';
        
        if (applications.length === 0) {
            tableau.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">Aucun résultat</td></tr>';
            return;
        }
        
        // Utiliser DocumentFragment
        const fragment = document.createDocumentFragment();
        
        applications.forEach(app => {
            const row = document.createElement('tr');
            const statutClass = app.statut === 'approuve' ? 'status-approved' : 
                              app.statut === 'rejete' ? 'status-rejected' : 'status-pending';
            const statutText = app.statut === 'approuve' ? 'Approuvé' : 
                             app.statut === 'rejete' ? 'Rejeté' : 'En attente';
            
            row.innerHTML = `
                <td>${new Date(app.created_at).toLocaleDateString('fr-FR')}</td>
                <td><strong>${app.prenom} ${app.nom}</strong></td>
                <td>${app.numero_dossier}</td>
                <td><span class="status-badge ${statutClass}">${statutText}</span></td>
                <td>
                    <button class="btn btn-primary" style="padding: 5px 10px;" onclick="voirDossier(${app.id})">Voir</button>
                    <button class="btn" style="padding: 5px 10px; background: #28a745; color: white;" onclick="changerStatutDossier(${app.id}, 'approuve')">Approuver</button>
                    <button class="btn" style="padding: 5px 10px; background: #dc3545; color: white;" onclick="changerStatutDossier(${app.id}, 'rejete')">Rejeter</button>
                </td>
            `;
            fragment.appendChild(row);
        });
        
        tableau.appendChild(fragment);
        
    } catch (error) {
        console.error('Erreur recherche:', error);
        UIHelpers.showError('Erreur lors de la recherche');
    } finally {
        UIHelpers.showLoading(false);
    }
}, 500);

// Export global


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
    
    // ✅ Vider le cache
    viderCacheApresModification('dossier');
    
    // Recharger selon la page active
    const currentPage = document.querySelector('.page.active');
    
    if (currentPage) {
      const pageId = currentPage.id;
      
      setTimeout(() => {
        if (pageId === 'gestionDossiers' || pageId === 'admin-content') {
          if (typeof chargerDossiersAdmin === 'function') {
            chargerDossiersAdmin();
          }
        } else if (pageId === 'mesDossiers' || document.querySelector('#user-content .page.active')?.id === 'mesDossiers') {
          if (typeof chargerMesDossiers === 'function') {
            chargerMesDossiers();
          }
        }
      }, 300);
    }
    
    // Afficher un message avec le numéro de dépôt si le dossier est approuvé
    if (nouveauStatut === 'approuve' && response.application && response.application.numero_depot) {
      UIHelpers.showSuccess(`✅ Dossier approuvé avec succès! Numéro de dépôt: ${response.application.numero_depot}`);
    } else {
      UIHelpers.showSuccess(`✅ Dossier ${nouveauStatut === 'approuve' ? 'approuvé' : 'rejeté'} avec succès`);
    }
    
  } catch (error) {
    console.error('❌ Erreur changement statut:', error);
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
        
        UIHelpers.showSuccess('✅ Export terminé avec succès !');
        
        // ✅ Vider le cache des stats après export
        if (type.includes('stats') || type.includes('statistiques')) {
            viderCacheApresModification('stats');
        }
        
    } catch (error) {
        console.error('Erreur export:', error);
        UIHelpers.showError('Erreur lors de l\'export: ' + error.message);
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

async function modifierDossier(id) {
    try {
        
        
        // Vérifier si le dossier peut être modifié (toujours vrai maintenant)
        const checkResponse = await apiClient.canEditApplication(id);
        
        // ✅ MODIFICATION : Afficher un message d'information au lieu de bloquer
        if (checkResponse.infoMessage) {
            // Afficher un avertissement mais permettre la modification
            const continuer = confirm(
                checkResponse.infoMessage + '\n\nVoulez-vous continuer avec la modification ?'
            );
            
            if (!continuer) {
                UIHelpers.showLoading(false);
                return;
            }
        }
        
        // Récupérer les données du dossier
        const response = await apiClient.getApplicationForEdit(id);
        const app = response.application;
        
        // Afficher un message d'information si présent
        if (response.infoMessage) {
            UIHelpers.showMessage(response.infoMessage, 'warning');
        }
        
        // Afficher la page de modification
        showPage('modifierDossier');
        
        // Remplir le formulaire avec les données existantes
        document.getElementById('modifDossierId').value = app.id;
        document.getElementById('modifNom').value = app.nom || '';
        document.getElementById('modifPrenom').value = app.prenom || '';
        document.getElementById('modifDateNaissance').value = app.date_naissance || '';
        document.getElementById('modifLieuNaissance').value = app.lieu_naissance || '';
        document.getElementById('modifNationalite').value = app.nationalite || '';
        document.getElementById('modifGenre').value = app.genre || '';
        document.getElementById('modifAdresse').value = app.adresse || '';
        document.getElementById('modifTelephone').value = app.telephone || '';
        document.getElementById('modifEmail').value = app.email || '';
        document.getElementById('modifTypeBac').value = app.type_bac || '';
        document.getElementById('modifLieuObtention').value = app.lieu_obtention || '';
        document.getElementById('modifAnneeObtention').value = app.annee_obtention || '';
        document.getElementById('modifMention').value = app.mention || '';
        document.getElementById('modifPremierChoix').value = app.premier_choix || '';
        document.getElementById('modifDeuxiemeChoix').value = app.deuxieme_choix || '';
        document.getElementById('modifTroisiemeChoix').value = app.troisieme_choix || '';
        
        // Afficher les documents actuels
        const documents = typeof app.documents === 'string' ? JSON.parse(app.documents) : app.documents || {};
        
        afficherDocumentActuel('modifPhotoActuelle', documents.photoIdentite, 'Photo d\'identité');
        afficherDocumentActuel('modifPieceActuelle', documents.pieceIdentite, 'Pièce d\'identité');
        afficherDocumentActuel('modifDiplomeActuel', documents.diplomeBac, 'Diplôme de bac');
        afficherDocumentActuel('modifReleveActuel', documents.releve, 'Relevé de notes');
        afficherDocumentActuel('modifCertificatActuel', documents.certificatNationalite, 'Certificat de nationalité');
        
        // ✅ AJOUT : Afficher le statut actuel avec un bandeau coloré
        afficherStatutModification(app.statut);
        
    } catch (error) {
        console.error('Erreur chargement dossier:', error);
        UIHelpers.showError('Erreur lors du chargement du dossier');
    } finally {
        UIHelpers.showLoading(false);
    }
}
// Ajouter ces fonctions après la fonction modifierDossier

// Fonction pour charger les types de bac lors de la modification
async function chargerTypeBacModification() {
    try {
        const response = await apiClient.getTypeBacsPublic();
        const typeBacs = response.typeBacs || [];
        
        const selectTypeBac = document.getElementById('modifTypeBac');
        if (!selectTypeBac) return;
        
        // Sauvegarder la valeur actuelle (déjà remplie par modifierDossier)
        const currentValue = selectTypeBac.value;
        
        // Créer un select à la place du champ texte
        const newSelect = document.createElement('select');
        newSelect.id = 'modifTypeBac';
        newSelect.required = true;
        
        newSelect.innerHTML = '<option value="">Sélectionner un type de bac...</option>';
        
        typeBacs.forEach(typeBac => {
            const option = document.createElement('option');
            option.value = typeBac.nom;
            option.textContent = `${typeBac.nom} - ${typeBac.libelle}`;
            newSelect.appendChild(option);
        });
        
        // Restaurer la valeur
        if (currentValue) {
            newSelect.value = currentValue;
        }
        
        // Remplacer l'input par le select
        selectTypeBac.replaceWith(newSelect);
        
        // Ajouter l'événement de changement pour filtrer les filières
        document.getElementById('modifTypeBac').addEventListener('change', function() {
            filtrerFilieresParBacModification(this.value);
        });
        
        console.log('Types de bac chargés pour modification');
        
    } catch (error) {
        console.error('Erreur chargement types de bac modification:', error);
    }
}

// Fonction pour filtrer les filières selon le type de bac sélectionné
async function filtrerFilieresParBacModification(typeBac) {
    try {
        
        
        // Réinitialiser tous les selects de filières
        const selectsFilieres = [
            document.getElementById('modifPremierChoix'),
            document.getElementById('modifDeuxiemeChoix'), 
            document.getElementById('modifTroisiemeChoix')
        ];
        
        selectsFilieres.forEach(select => {
            if (select) {
                const currentValue = select.value;
                select.innerHTML = '<option value="">Sélectionner une filière...</option>';
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
                            option.textContent = `${filiere.libelle}`;
                            
                            // Ajouter des informations supplémentaires
                            if (filiere.faculte_nom) {
                                option.textContent += ` (${filiere.faculte_nom})`;
                            }
                            if (filiere.capacite_max) {
                                option.textContent += ` - Places: ${filiere.capacite_max}`;
                            }
                            
                            select.appendChild(option);
                        });
                        
                        // Restaurer la valeur si elle est toujours valide
                        const isValidChoice = filieres.some(f => f.nom.toLowerCase() === currentValue);
                        if (currentValue && isValidChoice) {
                            select.value = currentValue;
                        }
                    }
                });
                
                // Configurer les événements pour éviter les doublons
                configurerEvenementsChoixUniquesModification();
                
                UIHelpers.showSuccess(`${filieres.length} filière(s) disponible(s)`);
                
            } catch (error) {
                console.error('Erreur lors du chargement des filières:', error);
                
                // Afficher les filières génériques en cas d'erreur
                selectsFilieres.forEach(select => {
                    if (select) {
                        select.innerHTML = `
                            <option value="">Erreur de chargement - Filières génériques</option>
                            <option value="informatique">Informatique</option>
                            <option value="mathematiques">Mathématiques</option>
                            <option value="physique">Physique</option>
                            <option value="chimie">Chimie</option>
                        `;
                    }
                });
                
                UIHelpers.showError('Erreur lors du filtrage. Filières génériques affichées.');
            }
        }
        
    } catch (error) {
        console.error('Erreur filtrage filières modification:', error);
        UIHelpers.showError('Erreur lors du filtrage des filières');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Fonction pour configurer les événements d'unicité des choix
function configurerEvenementsChoixUniquesModification() {
    const selectsFilieres = [
        document.getElementById('modifPremierChoix'),
        document.getElementById('modifDeuxiemeChoix'), 
        document.getElementById('modifTroisiemeChoix')
    ];
    
    selectsFilieres.forEach((select, index) => {
        if (select) {
            // Supprimer les anciens event listeners
            const newSelect = select.cloneNode(true);
            select.replaceWith(newSelect);
            
            // Ajouter le nouvel event listener
            newSelect.addEventListener('change', function() {
                const valeurSelectionnee = this.value;
                
                // RéactiveR toutes les options
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

// Mettre à jour la fonction modifierDossier pour charger les types de bac

async function modifierDossierEnhanced(id) {
    // Appeler la fonction originale
    await originalModifierDossier(id);
    
    // Ajouter le chargement des types de bac et filières
    setTimeout(() => {
        chargerTypeBacModification();
        
        // Si un type de bac est déjà rempli, charger les filières correspondantes
        const typeBacField = document.getElementById('modifTypeBac');
        if (typeBacField && typeBacField.value) {
            filtrerFilieresParBacModification(typeBacField.value);
        }
    }, 500);
}

// Remplacer la fonction globale


// ✅ NOUVELLE FONCTION : Afficher un bandeau d'information sur le statut
function afficherStatutModification(statut) {
    const form = document.getElementById('modificationDossierForm');
    
    // Supprimer un éventuel bandeau existant
    const bandeauExistant = document.getElementById('bandeauStatutModif');
    if (bandeauExistant) {
        bandeauExistant.remove();
    }
    
    let message = '';
    let couleur = '';
    let icone = '';
    
    switch(statut) {
        case 'approuve':
            message = '⚠️ Ce dossier est actuellement APPROUVÉ. En le modifiant, il sera remis en attente de validation.';
            couleur = '#fff3cd';
            icone = '⚠️';
            break;
        case 'rejete':
            message = 'ℹ️ Ce dossier a été REJETÉ. Vous pouvez le modifier et le soumettre à nouveau pour validation.';
            couleur = '#f8d7da';
            icone = 'ℹ️';
            break;
        case 'en-attente':
            message = '✅ Ce dossier est en attente de validation. Vous pouvez le modifier librement.';
            couleur = '#d1ecf1';
            icone = '✅';
            break;
    }
    
    if (message) {
        const bandeau = document.createElement('div');
        bandeau.id = 'bandeauStatutModif';
        bandeau.style.cssText = `
            background: ${couleur};
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 25px;
            border-left: 4px solid ${statut === 'approuve' ? '#ffc107' : statut === 'rejete' ? '#dc3545' : '#17a2b8'};
            font-weight: 500;
        `;
        bandeau.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 24px;">${icone}</span>
                <div>${message}</div>
            </div>
        `;
        
        form.insertBefore(bandeau, form.firstChild);
    }
}

// Mettre à jour la fonction de soumission pour gérer le changement de statut
async function soumettreModificationDossier(event) {
    event.preventDefault();
    
    try {
        
        
        const id = document.getElementById('modifDossierId').value;
        
        // Créer le FormData
        const formData = new FormData();
        
        // Ajouter les champs texte
        formData.append('nom', document.getElementById('modifNom').value);
        formData.append('prenom', document.getElementById('modifPrenom').value);
        formData.append('dateNaissance', document.getElementById('modifDateNaissance').value);
        formData.append('lieuNaissance', document.getElementById('modifLieuNaissance').value);
        formData.append('nationalite', document.getElementById('modifNationalite').value);
        formData.append('genre', document.getElementById('modifGenre').value);
        formData.append('adresse', document.getElementById('modifAdresse').value);
        formData.append('telephone', document.getElementById('modifTelephone').value);
        formData.append('email', document.getElementById('modifEmail').value);
        formData.append('typeBac', document.getElementById('modifTypeBac').value);
        formData.append('lieuObtention', document.getElementById('modifLieuObtention').value);
        formData.append('anneeObtention', document.getElementById('modifAnneeObtention').value);
        formData.append('mention', document.getElementById('modifMention').value);
        formData.append('premierChoix', document.getElementById('modifPremierChoix').value);
        formData.append('deuxiemeChoix', document.getElementById('modifDeuxiemeChoix').value);
        formData.append('troisiemeChoix', document.getElementById('modifTroisiemeChoix').value);
        
        // Ajouter les fichiers (seulement s'ils sont fournis)
        const fileInputs = [
            'modifPhotoIdentite',
            'modifPieceIdentite',
            'modifDiplomeBac',
            'modifReleve',
            'modifCertificatNationalite'
        ];
        
        const fileMapping = {
            'modifPhotoIdentite': 'photoIdentite',
            'modifPieceIdentite': 'pieceIdentite',
            'modifDiplomeBac': 'diplomeBac',
            'modifReleve': 'releve',
            'modifCertificatNationalite': 'certificatNationalite'
        };
        
        fileInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input && input.files[0]) {
                formData.append(fileMapping[inputId], input.files[0]);
            }
        });
        
        // Envoyer la mise à jour
        const response = await apiClient.updateApplication(id, formData);
        
        // ✅ MODIFICATION : Message adapté selon le changement de statut
        if (response.statutChanged) {
            UIHelpers.showSuccess(
                'Dossier modifié avec succès ! 🎉\n\n' +
                'Le dossier a été remis en attente de validation suite à vos modifications.'
            );
        } else {
            UIHelpers.showSuccess('Dossier modifié avec succès !');
        }
        
        showPage('mesDossiers');
        chargerMesDossiers();
        
    } catch (error) {
        console.error('Erreur modification:', error);
        UIHelpers.showError(error.message || 'Erreur lors de la modification');
    } finally {
        UIHelpers.showLoading(false);
    }
}

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
window.modifierDossier = modifierDossier;
window.soumettreModificationDossier = soumettreModificationDossier;
window.afficherStatutModification = afficherStatutModification;
window.afficherConfirmationInscription = afficherConfirmationInscription;
window.showPage = showPage;
window.chargerDonneesPageSecurisee = chargerDonneesPageSecurisee;
window.diagnostiquerChargeurs = diagnostiquerChargeurs;
window.perfMonitor = perfMonitor; // Accessible globalement
window.rechercherDossiersDebounced = rechercherDossiersDebounced;
const originalModifierDossier = window.modifierDossier;
window.modifierDossier = modifierDossierEnhanced;

// Exporter les fonctions
window.chargerTypeBacModification = chargerTypeBacModification;
window.filtrerFilieresParBacModification = filtrerFilieresParBacModification;
window.configurerEvenementsChoixUniquesModification = configurerEvenementsChoixUniquesModification;
