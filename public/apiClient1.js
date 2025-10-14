// Configuration de l'API - VERSION MODULAIRE
const API_BASE_URL = 'http://localhost:3000/api';

class ApiClient {
    constructor() {
        this.baseURL = API_BASE_URL;
        this.token = localStorage.getItem('authToken');
        this.currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    }

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

    // =================== ÉTUDIANTS ===================
    async getEtudiants(filters = {}) {
        const params = new URLSearchParams();
        if (filters.search) params.append('search', filters.search);
        if (filters.statut) params.append('statut', filters.statut);
        
        const url = `/admin/etudiants${params.toString() ? '?' + params.toString() : ''}`;
        return this.request(url);
    }

    async getEtudiant(id) {
        return this.request(`/admin/etudiants/${id}`);
    }

    async creerEtudiant(data) {
        return this.request('/admin/etudiants/creer', {
            method: 'POST',
            body: data
        });
    }

    async updateEtudiant(id, data) {
        return this.request(`/admin/etudiants/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    async genererMatricule(id) {
        return this.request(`/admin/etudiants/${id}/generer-matricule`, {
            method: 'POST'
        });
    }

    async supprimerEtudiant(id) {
        return this.request(`/admin/etudiants/${id}`, {
            method: 'DELETE'
        });
    }

    async toggleInscriptionEtudiant(id) {
        return this.request(`/admin/etudiants/${id}/toggle-inscription`, {
            method: 'PUT'
        });
    }

    async importerEtudiants(fichier) {
        if (!fichier) throw new Error('Fichier requis');
        
        const validTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv'
        ];
        
        if (!validTypes.includes(fichier.type)) {
            throw new Error('Format invalide. Utilisez Excel (.xlsx, .xls) ou CSV');
        }
        
        if (fichier.size > 10 * 1024 * 1024) {
            throw new Error('Fichier trop volumineux (max 10MB)');
        }
        
        const formData = new FormData();
        formData.append('fichier', fichier);
        
        const response = await fetch(`${API_BASE_URL}/admin/etudiants/import`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.token}` },
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur import');
        }
        
        return response.json();
    }

    async telechargerModeleExcel() {
        const response = await fetch(`${API_BASE_URL}/admin/etudiants/modele-excel`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
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
    }

    // =================== INSCRIPTIONS ===================
    async rechercherNouveauEtudiant(numeroDossier) {
        return this.request(`/inscription/rechercher-nouveau/${numeroDossier}`, {
            skipAuth: true
        });
    }

    async rechercherAncienEtudiant(matricule) {
        return this.request(`/inscription/rechercher-ancien/${matricule}`, {
            skipAuth: true
        });
    }

    async verifierAutorisationEtudiant(etudiantId) {
        return this.request(`/inscription/verifier-autorisation/${etudiantId}`, {
            skipAuth: true
        });
    }

    async validerInscription(data) {
        return this.request('/inscription/valider', {
            method: 'POST',
            body: data,
            skipAuth: true
        });
    }

    async getStatutInscriptions() {
        return this.request('/inscription/config', { skipAuth: true });
    }

    async getConfigInscription() {
        return this.request('/admin/inscription/config');
    }

    async updateConfigInscription(config) {
        return this.request('/admin/inscription/config', {
            method: 'PUT',
            body: config
        });
    }

    async creerInscription(data) {
        return this.request('/inscription/creer', {
            method: 'POST',
            body: data
        });
    }

    async exporterInscriptions() {
        const response = await fetch(`${API_BASE_URL}/admin/inscriptions/export`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
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
    }

    async toggleInscriptionsGlobal(actif, raison = null) {
        return this.request('/admin/inscription/toggle-global', {
            method: 'PUT',
            body: { actif, raison }
        });
    }

    async getStatutGlobalInscriptions() {
        return this.request('/admin/inscription/statut-global');
    }

    // =================== RESTRICTIONS ===================
    async getRestrictions() {
        return this.request('/admin/inscription/restrictions');
    }

    async creerRestriction(data) {
        return this.request('/admin/inscription/restrictions', {
            method: 'POST',
            body: data
        });
    }

    async toggleRestriction(id) {
        return this.request(`/admin/inscription/restrictions/${id}/toggle`, {
            method: 'PUT'
        });
    }

    async supprimerRestriction(id) {
        return this.request(`/admin/inscription/restrictions/${id}`, {
            method: 'DELETE'
        });
    }

    // =================== FILIÈRES (CORRIGÉ) ===================
    async getFacultesPublic() {
        return this.request('/facultes');
    }

    async getTypeBacsPublic() {
        return this.request('/type-bacs');
    }

    // CORRIGÉ: Nouvelle route modulaire
    async getFilieresByBac(typeBac) {
        return this.request(`/filieres/par-bac/${encodeURIComponent(typeBac)}`);
    }

    async getFilieresPublic(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        const endpoint = params ? `/filieres?${params}` : '/filieres';
        return this.request(endpoint);
    }

    async getFilieresActives() {
        return this.request('/filieres', { skipAuth: true });
    }

    // Routes admin filières
    async getFilieres() {
        return this.request('/admin/filieres');
    }

    async saveFiliere(filiereData) {
        const method = filiereData.id ? 'PUT' : 'POST';
        const endpoint = filiereData.id 
            ? `/admin/filieres/${filiereData.id}` 
            : '/admin/filieres';
        return this.request(endpoint, {
            method: method,
            body: filiereData
        });
    }

    async deleteFiliere(id) {
        return this.request(`/admin/filieres/${id}`, {
            method: 'DELETE'
        });
    }

    // =================== FACULTÉS ===================
    async getFacultes() {
        return this.request('/admin/facultes');
    }

    async saveFaculte(faculteData) {
        const method = faculteData.id ? 'PUT' : 'POST';
        const endpoint = faculteData.id 
            ? `/admin/facultes/${faculteData.id}` 
            : '/admin/facultes';
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

    // =================== TYPES DE BAC ===================
    async getTypeBacs() {
        return this.request('/admin/type-bacs');
    }

    async saveTypeBac(typeBacData) {
        const method = typeBacData.id ? 'PUT' : 'POST';
        const endpoint = typeBacData.id 
            ? `/admin/type-bacs/${typeBacData.id}` 
            : '/admin/type-bacs';
        return this.request(endpoint, {
            method: method,
            body: typeBacData
        });
    }

    // =================== DIPLÔMES ===================
    async getDiplomes() {
        return this.request('/admin/diplomes');
    }

    async saveDiplome(diplomeData) {
        const method = diplomeData.id ? 'PUT' : 'POST';
        const endpoint = diplomeData.id 
            ? `/admin/diplomes/${diplomeData.id}` 
            : '/admin/diplomes';
        return this.request(endpoint, {
            method: method,
            body: diplomeData
        });
    }

    async deleteDiplome(id) {
        return this.request(`/admin/diplomes/${id}`, {
            method: 'DELETE'
        });
    }

    // =================== STATISTIQUES (CORRIGÉ) ===================
    async getStatsDashboard() {
        return this.request('/admin/stats/dashboard');
    }

    async getStatsByGenre() {
        return this.request('/admin/stats/genre');
    }

    async getStatsByFilieres() {
        return this.request('/admin/stats/filieres');
    }

    async getStatsByFacultes() {
        return this.request('/admin/stats/facultes-candidatures');
    }

    async getStatsByTypeBac() {
        return this.request('/admin/stats/type-bac');
    }

    async getStatsByLieuObtention() {
        return this.request('/admin/stats/lieu-obtention');
    }

    async getStatsTemporelles() {
        return this.request('/admin/stats/temporelles');
    }

    async getStatsGenreBac() {
        return this.request('/admin/stats/genre-bac');
    }

    async getStatsMentionsFilieres() {
        return this.request('/admin/stats/mentions-filieres');
    }

    async exportStatistics(type) {
        const response = await fetch(`${this.baseURL}/admin/export/statistiques/${type}`, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error('Erreur export');

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
    }

    // =================== EXPORTS ===================
    async exportCandidaturesComplete() {
        const response = await fetch(`${this.baseURL}/admin/export/candidatures-complete`, {
            headers: { Authorization: `Bearer ${this.token}` }
        });

        if (!response.ok) throw new Error('Erreur export');

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
    }

    async exportApprouvesExcel() {
        const response = await fetch(`${this.baseURL}/admin/stats/export-approuves-excel`, {
            headers: { Authorization: `Bearer ${this.token}` }
        });

        if (!response.ok) throw new Error('Erreur export');

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
    }

    async exportBySection(type, filter = null) {
        const url = filter 
            ? `${this.baseURL}/admin/export/section/${type}?filter=${encodeURIComponent(filter)}`
            : `${this.baseURL}/admin/export/section/${type}`;
            
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${this.token}` }
        });

        if (!response.ok) throw new Error(`Erreur ${response.status}`);

        const blob = await response.blob();
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `export_${type}.xlsx`;
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
            if (filenameMatch) filename = filenameMatch[1].replace(/"/g, '');
        }
        
        const urlBlob = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlBlob;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(urlBlob);
    }

    async exporterParFaculte(faculte = null) {
        return this.exportBySection('par-faculte', faculte);
    }

    async exporterParGenre(genre = null) {
        return this.exportBySection('par-genre', genre);
    }

    async exporterParStatut(statut = 'en-attente') {
        return this.exportBySection('par-statut', statut);
    }

    // =================== AUTHENTIFICATION ===================
    async register(userData) {
        return this.request('/register', {
            method: 'POST',
            body: userData
        });
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

    // =================== APPLICATIONS ===================
    async submitApplication(formData) {
        return this.request('/applications', {
            method: 'POST',
            body: formData
        });
    }
    
    async getMyApplications() {
        return this.request('/applications/my');
    }

    async getApplication(id) {
        return this.request(`/applications/${id}`);
    }

    async getAllApplications(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        const endpoint = params ? `/admin/applications?${params}` : '/admin/applications';
        return this.request(endpoint);
    }

    async searchApplications(query) {
        return this.request(`/admin/applications/search?q=${encodeURIComponent(query)}`);
    }

    async updateApplicationStatus(applicationId, status) {
        return this.request(`/admin/applications/${applicationId}/status`, {
            method: 'PUT',
            body: { statut: status }
        });
    }

    async downloadDocument(applicationId, documentType) {
        const response = await fetch(`${API_BASE_URL}/applications/${applicationId}/documents/${documentType}`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });

        if (!response.ok) throw new Error(`Erreur ${response.status}`);

        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `document_${documentType}`;
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
            if (filenameMatch) filename = filenameMatch[1];
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // =================== PROFIL ===================
    async getProfile() {
        return this.request('/profile');
    }

    async updateProfile(profileData) {
        return this.request('/profile', {
            method: 'PUT',
            body: profileData
        });
    }

    async changePassword(passwordData) {
        return this.request('/change-password', {
            method: 'PUT',
            body: passwordData
        });
    }

    // =================== ADMIN USERS ===================
    async getUsers() {
        return this.request('/admin/users');
    }

    async addUser(userData) {
        return this.request('/admin/users', {
            method: 'POST',
            body: userData
        });
    }

    async getStats() {
        return this.request('/admin/stats');
    }

    async exportData(type) {
        const response = await fetch(`${API_BASE_URL}/admin/export/${type}`, {
            headers: { Authorization: `Bearer ${this.token}` }
        });

        if (!response.ok) throw new Error('Erreur export');

        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `export_${type}.csv`;
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // =================== REQUEST HANDLER ===================
    async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        
        const isFormData = options.body instanceof FormData;
        
        const headers = {
            ...(this.token && !options.skipAuth && { 'Authorization': `Bearer ${this.token}` }),
            ...options.headers
        };
        
        if (!isFormData && !options.skipContentType) {
            headers['Content-Type'] = 'application/json';
        }
        
        const config = {
            headers: headers,
            ...options
        };

        if (!isFormData && config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            
            if (response.status === 401) {
                this.logout();
                UIHelpers.showError('Session expirée. Veuillez vous reconnecter.');
                showPage('connexion');
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
                throw new Error(errorData.error || `Erreur ${response.status}`);
            }

            if (response.status === 204) return null;

            return await response.json();
            
        } catch (error) {
            console.error(`Erreur API ${endpoint}:`, error);
            throw error;
        }
    }
}

// Instance globale
const apiClient = new ApiClient();

// Exporter pour utilisation
if (typeof window !== 'undefined') {
    window.apiClient = apiClient;
}

console.log('API Client initialisé - Version modulaire');