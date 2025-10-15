let currentFacultes = [];
let currentFilieres = [];
let currentTypeBacs = [];
let currentDiplomes = [];

// Cache local pour les données de formation
const formationCache = {
    facultes: null,
    filieres: null,
    typeBacs: null,
    diplomes: null
};

// Fonction optimisée de chargement
async function chargerDonneesFormationAvecCache() {
    try {
        if (!formationCache.facultes) {
            const response = await apiClient.getFacultes();
            formationCache.facultes = response.facultes || [];
        }
        
        if (!formationCache.typeBacs) {
            const response = await apiClient.getTypeBacs();
            formationCache.typeBacs = response.typeBacs || [];
        }
        
        return {
            facultes: formationCache.facultes,
            typeBacs: formationCache.typeBacs
        };
    } catch (error) {
        console.error('Erreur chargement données:', error);
        throw error;
    }
}

// Vider le cache quand on modifie les données
function viderCacheFormation() {
    formationCache.facultes = null;
    formationCache.filieres = null;
    formationCache.typeBacs = null;
    formationCache.diplomes = null;
}

// Navigation entre les onglets
function openFormationTab(tabName) {
    // Masquer tous les contenus d'onglets
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Afficher l'onglet sélectionné
    document.getElementById(`${tabName}-tab`).classList.add('active');
    event.target.classList.add('active');
    
    // Charger les données de l'onglet
    if (tabName === 'facultes') {
        chargerFacultes();
    } else if (tabName === 'filieres') {
        chargerFilieres();
    }else if (tabName === 'diplomes') {
        chargerDiplomes();
    } else if (tabName === 'typeBacs') {
        chargerTypeBacs();
    }
}

// Chargement des facultés
async function chargerFacultes() {
    try {
        
        const response = await apiClient.getFacultes();
        currentFacultes = response.facultes || [];
        
        const tableau = document.getElementById('tableauFacultes');
        tableau.innerHTML = '';
        
        if (currentFacultes.length === 0) {
            tableau.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #666;">Aucune faculté trouvée</td></tr>';
            return;
        }
        
        currentFacultes.forEach(faculte => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${faculte.nom}</strong></td>
                <td>${faculte.libelle}</td>
                <td>${faculte.description || '-'}</td>
                <td><span class="stat-badge">${faculte.nombre_filieres || 0} filières</span></td>
                <td><span class="status-badge ${faculte.active ? 'status-approved' : 'status-rejected'}">${faculte.active ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <button class="btn btn-secondary" style="padding: 5px 10px; margin: 2px;" onclick="modifierFaculte(${faculte.id})">Modifier</button>
                    <button class="btn" style="padding: 5px 10px; margin: 2px; background: #dc3545; color: white;" onclick="supprimerFaculte(${faculte.id})">Supprimer</button>
                </td>
            `;
            tableau.appendChild(row);
        });
        
    } catch (error) {
        console.error('Erreur chargement facultés:', error);
        UIHelpers.showError('Erreur lors du chargement des facultés');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Chargement des filières
async function chargerFilieres() {
    try {
        
        const response = await apiClient.getFilieres();
        currentFilieres = response.filieres || [];
        
        const tableau = document.getElementById('tableauFilieres');
        tableau.innerHTML = '';
        
        if (currentFilieres.length === 0) {
            tableau.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #666;">Aucune filière trouvée</td></tr>';
            return;
        }
        
        currentFilieres.forEach(filiere => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${filiere.nom}</strong></td>
                <td>${filiere.libelle}</td>
                <td>${filiere.faculte_libelle}</td>
                <td>${filiere.capacite_max || 'Illimitée'}</td>
                <td>${filiere.types_bac_autorises ? filiere.types_bac_autorises.join(', ') : 'Aucun'}</td>
                <td><span class="stat-badge">${filiere.nombre_candidatures || 0} candidatures</span></td>
                <td><span class="status-badge ${filiere.active ? 'status-approved' : 'status-rejected'}">${filiere.active ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <button class="btn btn-secondary" style="padding: 5px 10px; margin: 2px;" onclick="modifierFiliere(${filiere.id})">Modifier</button>
                    <button class="btn" style="padding: 5px 10px; margin: 2px; background: #dc3545; color: white;" onclick="desactiverFiliere(${filiere.id})">Désactiver</button>
                </td>
            `;
            tableau.appendChild(row);
        });
        
    } catch (error) {
        console.error('Erreur chargement filières:', error);
        UIHelpers.showError('Erreur lors du chargement des filières');
    } finally {
        UIHelpers.showLoading(false);
    }
}

async function chargerDiplomes() {
    try {
        console.log('📚 Chargement diplômes...');
        
        
        const response = await apiClient.getDiplomes();
        currentDiplomes = response.diplomes || [];
        
        console.log(`✅ ${currentDiplomes.length} diplômes chargés`);
        
        const tableau = document.getElementById('tableauDiplomes');
        if (!tableau) {
            console.error('❌ Élément tableauDiplomes non trouvé');
            return;
        }
        
        tableau.innerHTML = '';
        
        if (currentDiplomes.length === 0) {
            tableau.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #666;">Aucun diplôme trouvé</td></tr>';
            return;
        }
        
        currentDiplomes.forEach(diplome => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${diplome.filiere_libelle || diplome.filiere_nom || '-'}</td>
                <td>${diplome.libelle}</td>
                <td>${diplome.faculte_libelle || diplome.faculte_nom}</td>
                <td><span class="status-badge ${diplome.active ? 'status-approved' : 'status-rejected'}">${diplome.active ? 'Actif' : 'Inactif'}</span></td>
                <td>
                    <button class="btn btn-secondary" style="padding: 5px 10px; margin: 2px;" onclick="modifierDiplome(${diplome.id})">Modifier</button>
                    <button class="btn" style="padding: 5px 10px; margin: 2px; background: #dc3545; color: white;" onclick="supprimerDiplome(${diplome.id})">Supprimer</button>
                </td>
            `;
            tableau.appendChild(row);
        });
        
    } catch (error) {
        console.error('❌ Erreur chargement diplômes:', error);
        UIHelpers.showError('Erreur lors du chargement des diplômes: ' + error.message);
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Chargement des types de bac
async function chargerTypeBacs() {
    try {
        
        const response = await apiClient.getTypeBacs();
        currentTypeBacs = response.typeBacs || [];
        
        const tableau = document.getElementById('tableauTypeBacs');
        tableau.innerHTML = '';
        
        if (currentTypeBacs.length === 0) {
            tableau.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #666;">Aucun type de bac trouvé</td></tr>';
            return;
        }
        
        currentTypeBacs.forEach(typeBac => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${typeBac.nom}</strong></td>
                <td>${typeBac.libelle}</td>
                <td>${typeBac.description || '-'}</td>
                <td><span class="stat-badge">${typeBac.nombre_filieres || 0} filières</span></td>
                <td><span class="status-badge ${typeBac.active ? 'status-approved' : 'status-rejected'}">${typeBac.active ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <button class="btn btn-secondary" style="padding: 5px 10px; margin: 2px;" onclick="modifierTypeBac(${typeBac.id})">Modifier</button>
                    <button class="btn" style="padding: 5px 10px; margin: 2px; background: #dc3545; color: white;" onclick="supprimerTypeBac(${typeBac.id})">Supprimer</button>
                </td>
            `;
            tableau.appendChild(row);
        });
        
    } catch (error) {
        console.error('Erreur chargement types de bac:', error);
        UIHelpers.showError('Erreur lors du chargement des types de bac');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Gestion des facultés
function ouvrirModalFaculte(faculte = null) {
    const modal = document.getElementById('ajoutFaculteModal');
    const titre = document.getElementById('titreFaculteModal');
    const form = document.getElementById('faculteForm');
    
    if (faculte) {
        titre.textContent = 'Modifier la faculté';
        document.getElementById('faculteId').value = faculte.id;
        document.getElementById('faculteNom').value = faculte.nom;
        document.getElementById('faculteLibelle').value = faculte.libelle;
        document.getElementById('faculteDescription').value = faculte.description || '';
        document.getElementById('faculteActive').checked = faculte.active !== false;
    } else {
        titre.textContent = 'Ajouter une faculté';
        form.reset();
        document.getElementById('faculteId').value = '';
    }
    
    openModal('ajoutFaculteModal');
}

async function sauvegarderFaculte(event) {
    event.preventDefault();
    
    try {
        UIHelpers.showLoading(true);
        
        const faculteData = {
            nom: document.getElementById('faculteNom').value,
            libelle: document.getElementById('faculteLibelle').value,
            description: document.getElementById('faculteDescription').value,
            active: document.getElementById('faculteActive').checked
        };
        
        const id = document.getElementById('faculteId').value;
        if (id) {
            faculteData.id = id;
        }
        
        await apiClient.saveFaculte(faculteData);
        
        // ✅ Vider le cache
        viderCacheApresModification('faculte');
        
        closeModal('ajoutFaculteModal');
        
        // ✅ Recharger
        setTimeout(() => chargerFacultes(), 300);
        
        UIHelpers.showSuccess(`Faculté ${id ? 'modifiée' : 'ajoutée'} avec succès`);
        
    } catch (error) {
        console.error('Erreur sauvegarde faculté:', error);
        UIHelpers.showError(error.message || 'Erreur lors de la sauvegarde');
    } finally {
        UIHelpers.showLoading(false);
    }
}

async function supprimerFaculte(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette faculté ? Cette action est irréversible.')) {
        return;
    }
    
    try {
        UIHelpers.showLoading(true);
        
        await apiClient.deleteFaculte(id);
        
        // ✅ Vider le cache
        viderCacheApresModification('faculte');
        
        // ✅ Recharger
        setTimeout(() => chargerFacultes(), 300);
        
        UIHelpers.showSuccess('Faculté supprimée avec succès');
    } catch (error) {
        console.error('Erreur suppression faculté:', error);
        UIHelpers.showError(error.message || 'Erreur lors de la suppression');
    } finally {
        UIHelpers.showLoading(false);
    }
}

async function ouvrirModalFiliere(filiere = null) {
    console.log('🔧 ouvrirModalFiliere appelée', filiere);
    
    try {
        // 1. D'abord ouvrir le modal IMMÉDIATEMENT
        openModal('ajoutFiliereModal');
        console.log('✅ Modal ouvert');
        
        // 2. Afficher un message de chargement
        const container = document.getElementById('typesBacContainer');
        const selectFacultes = document.getElementById('filiereFaculte');
        
        if (container) container.innerHTML = '<p>Chargement des types de bac...</p>';
        if (selectFacultes) selectFacultes.innerHTML = '<option value="">Chargement des facultés...</option>';
        
        // 3. Configurer le titre du modal
        const titre = document.getElementById('titreFiliereModal');
        if (filiere) {
            titre.textContent = 'Modifier la filière';
            document.getElementById('filiereId').value = filiere.id || '';
        } else {
            titre.textContent = 'Ajouter une filière';
            document.getElementById('filiereId').value = '';
        }
        
        // 4. Charger les données ASYNCHRONEMENT
        await chargerDonneesFiliereForm();
        
        // 5. Si c'est une modification, pré-remplir les champs
        if (filiere) {
            console.log('📝 Pré-remplissage pour modification', filiere);
            
            document.getElementById('filiereNom').value = filiere.nom || '';
            document.getElementById('filiereLibelle').value = filiere.libelle || '';
            document.getElementById('filiereFaculte').value = filiere.faculte_id || '';
            document.getElementById('filiereCapacite').value = filiere.capacite_max || '';
            document.getElementById('filiereDescription').value = filiere.description || '';
            document.getElementById('filiereActive').checked = filiere.active !== false;
            
            // Cocher les types de bac autorisés
            if (filiere.types_bac_autorises) {
                setTimeout(() => {
                    const checkboxes = document.querySelectorAll('#typesBacContainer input[type="checkbox"]');
                    checkboxes.forEach(checkbox => {
                        const typeBacId = checkbox.value;
                        // Vérifier si ce type de bac est dans la liste des autorisés
                        if (Array.isArray(filiere.types_bac_autorises)) {
                            checkbox.checked = filiere.types_bac_autorises.includes(parseInt(typeBacId)) || 
                                            filiere.types_bac_autorises.includes(typeBacId);
                        }
                    });
                }, 500);
            }
        } else {
            // Pour l'ajout, réinitialiser le formulaire
            document.getElementById('filiereForm').reset();
            document.getElementById('filiereActive').checked = true;
        }
        
        console.log('✅ Modal filière prêt');
        
    } catch (error) {
        console.error('❌ Erreur ouverture modal filière:', error);
        UIHelpers.showError('Erreur: ' + error.message);
    }
}
// Fonction similaire pour les facultés
async function ouvrirModalFaculte(faculte = null) {
    try {
        const titre = document.getElementById('titreFaculteModal');
        const form = document.getElementById('faculteForm');
        
        if (faculte) {
            titre.textContent = 'Modifier la faculté';
            document.getElementById('faculteId').value = faculte.id;
            document.getElementById('faculteNom').value = faculte.nom;
            document.getElementById('faculteLibelle').value = faculte.libelle;
            document.getElementById('faculteDescription').value = faculte.description || '';
            document.getElementById('faculteActive').checked = faculte.active !== false;
        } else {
            titre.textContent = 'Ajouter une faculté';
            form.reset();
            document.getElementById('faculteId').value = '';
        }
        
        openModal('ajoutFaculteModal');
        
    } catch (error) {
        console.error('❌ Erreur ouverture modal faculté:', error);
        UIHelpers.showError('Erreur lors du chargement du formulaire');
    }
}

async function chargerFilieresParFaculte() {
    try {
        const selectFaculte = document.getElementById('diplomeFaculte');
        const selectFiliere = document.getElementById('diplomeFiliere');
        const faculteId = selectFaculte.value;
        
        if (!faculteId) {
            selectFiliere.innerHTML = '<option value="">Sélectionner d\'abord une faculté</option>';
            selectFiliere.disabled = true;
            return;
        }
        
        console.log('📚 Chargement des filières pour faculté:', faculteId);
        
        selectFiliere.innerHTML = '<option value="">Chargement des filières...</option>';
        selectFiliere.disabled = true;
        
        // Récupérer toutes les filières
        const response = await apiClient.getFilieres();
        const filieres = response.filieres || [];
        
        // Filtrer par faculté
        const filieresFiltered = filieres.filter(f => f.faculte_id == faculteId);
        
        console.log(`✅ ${filieresFiltered.length} filières trouvées`);
        
        selectFiliere.innerHTML = '<option value="">Sélectionner une filière</option>';
        
        if (filieresFiltered.length > 0) {
            filieresFiltered.forEach(filiere => {
                const option = document.createElement('option');
                option.value = filiere.id;
                option.textContent = `${filiere.nom} - ${filiere.libelle}`;
                selectFiliere.appendChild(option);
            });
            selectFiliere.disabled = false;
        } else {
            selectFiliere.innerHTML = '<option value="">Aucune filière disponible pour cette faculté</option>';
        }
        
    } catch (error) {
        console.error('❌ Erreur chargement filières:', error);
        const selectFiliere = document.getElementById('diplomeFiliere');
        selectFiliere.innerHTML = '<option value="">Erreur de chargement</option>';
        UIHelpers.showError('Erreur lors du chargement des filières');
    }
}


// Fonction pour les types de bac
async function ouvrirModalTypeBac(typeBac = null) {
    try {
        const titre = document.getElementById('titreTypeBacModal');
        const form = document.getElementById('typeBacForm');
        
        if (typeBac) {
            titre.textContent = 'Modifier le type de bac';
            document.getElementById('typeBacId').value = typeBac.id;
            document.getElementById('typeBacNom').value = typeBac.nom;
            document.getElementById('typeBacLibelle').value = typeBac.libelle;
            document.getElementById('typeBacDescription').value = typeBac.description || '';
            document.getElementById('typeBacActive').checked = typeBac.active !== false;
        } else {
            titre.textContent = 'Ajouter un type de bac';
            form.reset();
            document.getElementById('typeBacId').value = '';
        }
        
        openModal('ajoutTypeBacModal');
        
    } catch (error) {
        console.error('❌ Erreur ouverture modal type de bac:', error);
        UIHelpers.showError('Erreur lors du chargement du formulaire');
    }
}

// Corrections des fonctions de modification pour utiliser les bonnes fonctions d'ouverture
function modifierFaculte(id) {
    console.log('🔧 Modification faculté ID:', id);
    const faculte = currentFacultes?.find(f => f.id === id);
    if (faculte) {
        ouvrirModalFaculte(faculte);
    } else {
        console.error('❌ Faculté introuvable:', id);
        UIHelpers.showError('Faculté introuvable');
    }
}

function modifierFiliere(id) {
    console.log('🔧 Modification filière ID:', id);
    const filiere = currentFilieres?.find(f => f.id === id);
    if (filiere) {
        ouvrirModalFiliere(filiere);
    } else {
        console.error('❌ Filière introuvable:', id);
        UIHelpers.showError('Filière introuvable');
    }
}

function modifierTypeBac(id) {
    console.log('🔧 Modification type de bac ID:', id);
    const typeBac = currentTypeBacs?.find(t => t.id === id);
    if (typeBac) {
        ouvrirModalTypeBac(typeBac);
    } else {
        console.error('❌ Type de bac introuvable:', id);
        UIHelpers.showError('Type de bac introuvable');
    }
}



async function sauvegarderFiliere(event) {
    event.preventDefault();
    
    try {
        UIHelpers.showLoading(true);
        
        console.log('💾 Début sauvegarde filière');
        
        const typesBacIds = [];
        const selectedCheckboxes = document.querySelectorAll('#typesBacContainer input[type="checkbox"]:checked');
        
        console.log(`📋 ${selectedCheckboxes.length} types de bac sélectionnés`);
        
        selectedCheckboxes.forEach(checkbox => {
            const typeBacId = parseInt(checkbox.value);
            if (!isNaN(typeBacId)) {
                typesBacIds.push(typeBacId);
            }
        });
        
        console.log('🏷️ IDs des types de bac:', typesBacIds);
        
        const nom = document.getElementById('filiereNom').value?.trim();
        const libelle = document.getElementById('filiereLibelle').value?.trim();
        const faculteId = document.getElementById('filiereFaculte').value;
        
        if (!nom || !libelle || !faculteId) {
            throw new Error('Le nom, le libellé et la faculté sont obligatoires');
        }
        
        if (typesBacIds.length === 0) {
            throw new Error('Veuillez sélectionner au moins un type de bac autorisé');
        }
        
        const filiereData = {
            nom: nom.toUpperCase(),
            libelle: libelle,
            faculte_id: parseInt(faculteId),
            capacite_max: document.getElementById('filiereCapacite').value || null,
            description: document.getElementById('filiereDescription').value?.trim() || null,
            active: document.getElementById('filiereActive').checked,
            types_bac_ids: typesBacIds
        };
        
        const id = document.getElementById('filiereId').value;
        if (id) {
            filiereData.id = parseInt(id);
        }
        
        console.log('📤 Données à envoyer:', filiereData);
        
        await apiClient.saveFiliere(filiereData);
        
        console.log('✅ Filière sauvegardée avec succès');
        
        // ✅ Vider le cache
        viderCacheApresModification('filiere');
        
        closeModal('ajoutFiliereModal');
        
        // ✅ Recharger
        setTimeout(() => chargerFilieres(), 300);
        
        UIHelpers.showSuccess(`Filière ${id ? 'modifiée' : 'ajoutée'} avec succès`);
        
    } catch (error) {
        console.error('❌ Erreur sauvegarde filière:', error);
        UIHelpers.showError(error.message || 'Erreur lors de la sauvegarde');
    } finally {
        UIHelpers.showLoading(false);
    }
}

async function sauvegarderDiplome(event) {
    event.preventDefault();
    
    try {
        console.log('💾 Sauvegarde diplôme...');
        
        UIHelpers.showLoading(true);
        
        const diplomeData = {
            libelle: document.getElementById('diplomeLibelle').value.trim(),
            faculte_id: parseInt(document.getElementById('diplomeFaculte').value),
            filiere_id: parseInt(document.getElementById('diplomeFiliere').value)
        };
        
        const id = document.getElementById('diplomeId').value;
        if (id) {
            diplomeData.id = parseInt(id);
            diplomeData.active = true;
        }
        
        console.log('📤 Données à envoyer:', diplomeData);
        
        if (!diplomeData.libelle || !diplomeData.faculte_id || !diplomeData.filiere_id) {
            throw new Error('Tous les champs sont obligatoires');
        }
        
        if (isNaN(diplomeData.faculte_id) || isNaN(diplomeData.filiere_id)) {
            throw new Error('Veuillez sélectionner une faculté et une filière valides');
        }
        
        await apiClient.saveDiplome(diplomeData);
        
        console.log('✅ Diplôme sauvegardé');
        
        // ✅ Vider le cache
        viderCacheApresModification('diplome');
        
        closeModal('ajoutDiplomeModal');
        
        // ✅ Recharger
        setTimeout(() => chargerDiplomes(), 300);
        
        UIHelpers.showSuccess(`Diplôme ${id ? 'modifié' : 'ajouté'} avec succès`);
        
    } catch (error) {
        console.error('❌ Erreur sauvegarde diplôme:', error);
        UIHelpers.showError(error.message || 'Erreur lors de la sauvegarde');
    } finally {
        UIHelpers.showLoading(false);
    }
}


function modifierDiplome(id) {
    console.log('🔧 Modification diplôme ID:', id);
    const diplome = currentDiplomes?.find(d => d.id === id);
    if (diplome) {
        ouvrirModalDiplome(diplome);
    } else {
        console.error('❌ Diplôme introuvable:', id);
        UIHelpers.showError('Diplôme introuvable');
    }
}

async function supprimerDiplome(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce diplôme ?')) {
        return;
    }
    
    try {
        UIHelpers.showLoading(true);
        
        await apiClient.deleteDiplome(id);
        
        // ✅ Vider le cache
        viderCacheApresModification('diplome');
        
        // ✅ Recharger
        setTimeout(() => chargerDiplomes(), 300);
        
        UIHelpers.showSuccess('Diplôme supprimé avec succès');
    } catch (error) {
        console.error('❌ Erreur suppression diplôme:', error);
        UIHelpers.showError(error.message || 'Erreur lors de la suppression');
    } finally {
        UIHelpers.showLoading(false);
    }
}
// Gestion des types de bac
function ouvrirModalTypeBac(typeBac = null) {
    const modal = document.getElementById('ajoutTypeBacModal');
    const titre = document.getElementById('titreTypeBacModal');
    const form = document.getElementById('typeBacForm');
    
    if (typeBac) {
        titre.textContent = 'Modifier le type de bac';
        document.getElementById('typeBacId').value = typeBac.id;
        document.getElementById('typeBacNom').value = typeBac.nom;
        document.getElementById('typeBacLibelle').value = typeBac.libelle;
        document.getElementById('typeBacDescription').value = typeBac.description || '';
        document.getElementById('typeBacActive').checked = typeBac.active !== false;
    } else {
        titre.textContent = 'Ajouter un type de bac';
        form.reset();
        document.getElementById('typeBacId').value = '';
    }
    
    openModal('ajoutTypeBacModal');
}

async function sauvegarderTypeBac(event) {
    event.preventDefault();
    
    try {
        UIHelpers.showLoading(true);
        
        const typeBacData = {
            nom: document.getElementById('typeBacNom').value,
            libelle: document.getElementById('typeBacLibelle').value,
            description: document.getElementById('typeBacDescription').value,
            active: document.getElementById('typeBacActive').checked
        };
        
        const id = document.getElementById('typeBacId').value;
        if (id) {
            typeBacData.id = id;
        }
        
        await apiClient.saveTypeBac(typeBacData);
        
        // ✅ Vider le cache
        viderCacheApresModification('typebac');
        
        closeModal('ajoutTypeBacModal');
        
        // ✅ Recharger
        setTimeout(() => chargerTypeBacs(), 300);
        
        UIHelpers.showSuccess(`Type de bac ${id ? 'modifié' : 'ajouté'} avec succès`);
        
    } catch (error) {
        console.error('Erreur sauvegarde type de bac:', error);
        UIHelpers.showError(error.message || 'Erreur lors de la sauvegarde');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Fonctions de modification
function modifierFaculte(id) {
    const faculte = currentFacultes.find(f => f.id === id);
    if (faculte) {
        ouvrirModalFaculte(faculte);
    }
}

function modifierFiliere(id) {
    const filiere = currentFilieres.find(f => f.id === id);
    if (filiere) {
        ouvrirModalFiliere(filiere);
    }
}

function modifierTypeBac(id) {
    const typeBac = currentTypeBacs.find(t => t.id === id);
    if (typeBac) {
        ouvrirModalTypeBac(typeBac);
    }
}
async function ouvrirModalFiliere(filiere = null) {
    try {
        // Charger les données nécessaires pour le formulaire
        await chargerDonneesFiliereForm();
        
        const modal = document.getElementById('ajoutFiliereModal');
        const titre = document.getElementById('titreFiliereModal');
        
        if (filiere) {
            titre.textContent = 'Modifier la filière';
            document.getElementById('filiereId').value = filiere.id;
            document.getElementById('filiereNom').value = filiere.nom || '';
            document.getElementById('filiereLibelle').value = filiere.libelle || '';
            document.getElementById('filiereFaculte').value = filiere.faculte_id || '';
            document.getElementById('filiereCapacite').value = filiere.capacite_max || '';
            document.getElementById('filiereDescription').value = filiere.description || '';
            document.getElementById('filiereActive').checked = filiere.active !== false;
            
            // Cocher les types de bac autorisés
            if (filiere.types_bac_autorises) {
                document.querySelectorAll('#typesBacContainer input[type="checkbox"]').forEach(checkbox => {
                    const typeBacNom = checkbox.value;
                    checkbox.checked = filiere.types_bac_autorises.includes(typeBacNom);
                });
            }
        } else {
            titre.textContent = 'Ajouter une filière';
            document.getElementById('filiereForm').reset();
            document.getElementById('filiereId').value = '';
        }
        
        openModal('ajoutFiliereModal');
    } catch (error) {
        console.error('Erreur ouverture modal filière:', error);
        UIHelpers.showError('Erreur lors du chargement du formulaire');
    }
}

async function ouvrirModalDiplome(diplome = null) {
    try {
        console.log('🎓 Ouverture modal diplôme...', diplome);
        
        // Charger les facultés
        const responseFacultes = await apiClient.getFacultes();
        const facultes = responseFacultes.facultes || [];
        
        const selectFacultes = document.getElementById('diplomeFaculte');
        const selectFilieres = document.getElementById('diplomeFiliere');
        
        if (!selectFacultes || !selectFilieres) {
            console.error('❌ Éléments du formulaire non trouvés');
            return;
        }
        
        // Réinitialiser les selects
        selectFacultes.innerHTML = '<option value="">Sélectionner une faculté</option>';
        selectFilieres.innerHTML = '<option value="">Sélectionner d\'abord une faculté</option>';
        
        facultes.forEach(faculte => {
            const option = document.createElement('option');
            option.value = faculte.id;
            option.textContent = `${faculte.nom} - ${faculte.libelle}`;
            selectFacultes.appendChild(option);
        });
        
        const titre = document.getElementById('titreDiplomeModal');
        const form = document.getElementById('diplomeForm');
        
        if (diplome) {
            titre.textContent = 'Modifier le diplôme';
            document.getElementById('diplomeId').value = diplome.id;
            document.getElementById('diplomeLibelle').value = diplome.libelle;
            document.getElementById('diplomeFaculte').value = diplome.faculte_id;
            
            // Charger les filières de cette faculté
            if (diplome.faculte_id) {
                await chargerFilieresParFaculte();
                // Sélectionner la filière après chargement
                setTimeout(() => {
                    document.getElementById('diplomeFiliere').value = diplome.filiere_id || '';
                }, 300);
            }
        } else {
            titre.textContent = 'Ajouter un diplôme';
            form.reset();
            document.getElementById('diplomeId').value = '';
        }
        
        openModal('ajoutDiplomeModal');
        console.log('✅ Modal diplôme ouvert');
        
    } catch (error) {
        console.error('❌ Erreur ouverture modal diplôme:', error);
        UIHelpers.showError('Erreur lors du chargement du formulaire: ' + error.message);
    }
}


// Fonction pour charger les données du formulaire filière
// Remplacer la fonction chargerDonneesFiliereForm existante par celle-ci dans votre index.html

// Fonction pour charger les données du formulaire filière
async function chargerDonneesFiliereForm() {
    try {
        
        
        console.log('📄 Chargement données formation...');
        
        // Utiliser le cache
        const { facultes, typeBacs } = await chargerDonneesFormationAvecCache();
        
        // Remplir le select facultés
        const selectFacultes = document.getElementById('filiereFaculte');
        if (selectFacultes) {
            selectFacultes.innerHTML = '<option value="">Sélectionner une faculté</option>';
            facultes.forEach(faculte => {
                const option = document.createElement('option');
                option.value = faculte.id;
                option.textContent = `${faculte.nom} - ${faculte.libelle}`;
                selectFacultes.appendChild(option);
            });
        }
        
        // Remplir les types de bac
        const container = document.getElementById('typesBacContainer');
        if (container) {
            container.innerHTML = '';
            typeBacs.forEach(typeBac => {
                const div = document.createElement('div');
                div.className = 'type-bac-checkbox';
                div.innerHTML = `
                    <input type="checkbox" id="typeBac_${typeBac.id}" value="${typeBac.id}" name="typeBac">
                    <label for="typeBac_${typeBac.id}">${typeBac.libelle} (${typeBac.nom})</label>
                `;
                container.appendChild(div);
            });
        }
        
        console.log('✅ Données chargées avec succès');
        
    } catch (error) {
        console.error('❌ Erreur:', error);
        UIHelpers.showError('Erreur lors du chargement: ' + error.message);
    } finally {
        UIHelpers.showLoading(false);
    }
}

async function chargerDonneesDiplomeForm() {
    try {
        
        
        console.log('📄 Chargement des facultés...');
        
        // Charger les facultés - Utiliser la route admin
        const responseFacultes = await apiClient.getFacultes(); // Route admin
        console.log('✅ Facultés chargées:', responseFacultes);
        
        const selectFacultes = document.getElementById('diplomeFaculte');
        if (!selectFacultes) {
            console.error('❌ Élément diplomeFaculte introuvable');
            return;
        }
        
        selectFacultes.innerHTML = '<option value="">Sélectionner une faculté</option>';
        
        if (responseFacultes && responseFacultes.facultes && responseFacultes.facultes.length > 0) {
            responseFacultes.facultes.forEach(faculte => {
                const option = document.createElement('option');
                option.value = faculte.id;
                option.textContent = `${faculte.nom} - ${faculte.libelle}`;
                selectFacultes.appendChild(option);
            });
            console.log(`✅ ${responseFacultes.facultes.length} facultés ajoutées au select`);
        } else {
            console.warn('⚠️ Aucune faculté trouvée');
            selectFacultes.innerHTML = '<option value="">Aucune faculté disponible</option>';
        }
    
        
    } catch (error) {
        console.error('❌ Erreur chargement données diplome:', error);
        UIHelpers.showError('Erreur lors du chargement des données: ' + error.message);
        
        // Remplir les selects avec des messages d'erreur
        const selectFacultes = document.getElementById('filiereFaculte');
        if (selectFacultes) {
            selectFacultes.innerHTML = '<option value="">Erreur de chargement des facultés</option>';
        }
        
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Fonction pour sauvegarder une filière
// Fonction pour sauvegarder une filière - CORRIGÉE
async function sauvegarderFiliere(event) {
    event.preventDefault();
    
    try {
        
        
        console.log('💾 Début sauvegarde filière');
        
        // Récupérer les types de bac sélectionnés
        const typesBacIds = [];
        const selectedCheckboxes = document.querySelectorAll('#typesBacContainer input[type="checkbox"]:checked');
        
        console.log(`📋 ${selectedCheckboxes.length} types de bac sélectionnés`);
        
        selectedCheckboxes.forEach(checkbox => {
            const typeBacId = parseInt(checkbox.value);
            if (!isNaN(typeBacId)) {
                typesBacIds.push(typeBacId);
            }
        });
        
        console.log('🏷️ IDs des types de bac:', typesBacIds);
        
        // Validation des champs obligatoires
        const nom = document.getElementById('filiereNom').value?.trim();
        const libelle = document.getElementById('filiereLibelle').value?.trim();
        const faculteId = document.getElementById('filiereFaculte').value;
        
        if (!nom || !libelle || !faculteId) {
            throw new Error('Le nom, le libellé et la faculté sont obligatoires');
        }
        
        if (typesBacIds.length === 0) {
            throw new Error('Veuillez sélectionner au moins un type de bac autorisé');
        }
        
        const filiereData = {
            nom: nom.toUpperCase(),
            libelle: libelle,
            faculte_id: parseInt(faculteId),
            capacite_max: document.getElementById('filiereCapacite').value || null,
            description: document.getElementById('filiereDescription').value?.trim() || null,
            active: document.getElementById('filiereActive').checked,
            types_bac_ids: typesBacIds
        };
        
        const id = document.getElementById('filiereId').value;
        if (id) {
            filiereData.id = parseInt(id);
        }
        
        console.log('📤 Données à envoyer:', filiereData);
        
        // Sauvegarder via l'API
        await apiClient.saveFiliere(filiereData);
        
        console.log('✅ Filière sauvegardée avec succès');
        
        // Fermer le modal et recharger la liste
        closeModal('ajoutFiliereModal');
        await chargerFilieres();
        
        UIHelpers.showSuccess(`Filière ${id ? 'modifiée' : 'ajoutée'} avec succès`);
        
    } catch (error) {
        console.error('❌ Erreur sauvegarde filière:', error);
        UIHelpers.showError(error.message || 'Erreur lors de la sauvegarde');
    } finally {
        UIHelpers.showLoading(false);
    }
}
