// =================== GESTION SIDEBAR ===================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    // Sauvegarder l'état dans localStorage
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed);
}

// Restaurer l'état de la sidebar au chargement
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const wasCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    
    if (wasCollapsed) {
        sidebar.classList.add('collapsed');
    }
});

// =================== NAVIGATION ===================

function navigateTo(pageId) {
    console.log('Navigation vers:', pageId);
    
    // Masquer toutes les pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Afficher la page demandée
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        
        // Mettre à jour le titre de la page
        updatePageTitle(pageId);
        
        // Mettre à jour le menu actif
        updateActiveMenu(pageId);
        
        // Charger les données de la page
        loadPageData(pageId);
    }
}

function updatePageTitle(pageId) {
    const titles = {
        'dashboard': 'Tableau de Bord',
        'statistiques': 'Statistiques',
        'gestionEtudiants': 'Gestion des Étudiants',
        'gestionDossiers': 'Gestion des Dossiers',
        'gestionUtilisateurs': 'Gestion des Utilisateurs',
        'gestionFormations': 'Gestion des Formations',
        'configInscription': 'Configuration des Inscriptions',
        'importExport': 'Import/Export',
        'profil': 'Mon Profil'
    };
    
    const titleElement = document.getElementById('pageTitle');
    if (titleElement) {
        titleElement.textContent = titles[pageId] || 'Tableau de Bord';
    }
}

function updateActiveMenu(pageId) {
    // Retirer la classe active de tous les items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Ajouter la classe active à l'item correspondant
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        const onclick = item.getAttribute('onclick');
        if (onclick && onclick.includes(`'${pageId}'`)) {
            item.classList.add('active');
        }
    });
}

// =================== CHARGEMENT DES DONNÉES ===================

async function loadPageData(pageId) {
    try {
        switch(pageId) {
            case 'dashboard':
                await loadDashboardData();
                break;
            case 'statistiques':
                if (typeof chargerTableauBordStats === 'function') {
                    await chargerTableauBordStats();
                }
                break;
            case 'gestionEtudiants':
                if (typeof chargerEtudiants === 'function') {
                    await chargerEtudiants();
                }
                break;
            case 'gestionDossiers':
                if (typeof chargerDossiersAdmin === 'function') {
                    await chargerDossiersAdmin();
                }
                break;
            case 'gestionUtilisateurs':
                if (typeof chargerUtilisateurs === 'function') {
                    await chargerUtilisateurs();
                }
                break;
            case 'gestionFormations':
                if (typeof chargerFacultes === 'function') {
                    await chargerFacultes();
                }
                break;
            case 'configInscription':
                if (typeof chargerConfigInscription === 'function') {
                    await chargerConfigInscription();
                }
                if (typeof chargerStatutGlobalInscriptions === 'function') {
                    await chargerStatutGlobalInscriptions();
                }
                break;
            case 'profil':
                if (typeof chargerProfil === 'function') {
                    await chargerProfil();
                }
                break;
        }
    } catch (error) {
        console.error('Erreur chargement données:', error);
    }
}

// =================== DASHBOARD ===================

async function loadDashboardData() {
    try {
        console.log('📊 Chargement tableau de bord...');
        
        if (!apiClient || !apiClient.token) {
            console.warn('⚠️ Non connecté');
            return;
        }
        
        // Charger les stats globales
        const response = await apiClient.getStatsDashboard();
        
        if (response && response.success) {
            const { general, topFilieres, repartitionBac, evolution } = response;
            
            // Mettre à jour les cartes statistiques
            updateStatCards(general);
            
            // Créer les graphiques
            createDashboardCharts(topFilieres, repartitionBac, evolution);
            
            // Charger le tableau des dernières candidatures
            await loadRecentCandidatures();
            
            // Mettre à jour les badges du menu
            updateMenuBadges(general);
        }
        
    } catch (error) {
        console.error('❌ Erreur chargement dashboard:', error);
    }
}

function updateStatCards(general) {
    const updates = {
        'totalEtudiants': general?.total_candidatures || 0,
        'totalCandidatures': general?.total_candidatures || 0,
        'totalApprouvees': general?.approuves || 0,
        'totalEnAttente': general?.en_attente || 0
    };
    
    Object.entries(updates).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            // Animation du compteur
            animateCounter(element, 0, value, 1000);
        }
    });
}

function animateCounter(element, start, end, duration) {
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
            current = end;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current);
    }, 16);
}

function createDashboardCharts(topFilieres, repartitionBac, evolution) {
    // Graphique d'évolution
    const ctxEvolution = document.getElementById('chartEvolutionCandidatures');
    if (ctxEvolution && evolution && evolution.length > 0) {
        new Chart(ctxEvolution, {
            type: 'line',
            data: {
                labels: evolution.map(e => {
                    const date = new Date(e.mois);
                    return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
                }),
                datasets: [{
                    label: 'Candidatures',
                    data: evolution.map(e => e.candidatures),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
    
    // Graphique de répartition par filière
    const ctxFilieres = document.getElementById('chartRepartitionFilieres');
    if (ctxFilieres && topFilieres && topFilieres.length > 0) {
        new Chart(ctxFilieres, {
            type: 'doughnut',
            data: {
                labels: topFilieres.map(f => f.filiere),
                datasets: [{
                    data: topFilieres.map(f => f.nombre),
                    backgroundColor: [
                        '#667eea',
                        '#764ba2',
                        '#f093fb',
                        '#f5576c',
                        '#4facfe'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

async function loadRecentCandidatures() {
    try {
        const response = await apiClient.getAllApplications({ limit: 10 });
        const applications = response.applications || [];
        
        const tbody = document.getElementById('recentCandidaturesTable');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (applications.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #999;">Aucune candidature récente</td></tr>';
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
                <td><strong>${app.prenom} ${app.nom}</strong></td>
                <td>${app.premier_choix}</td>
                <td><span class="status-badge ${statutClass}">${statutText}</span></td>
                <td>
                    <button class="btn btn-icon btn-secondary" onclick="voirDossier(${app.id})" title="Voir détails">👁️</button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
    } catch (error) {
        console.error('Erreur chargement candidatures:', error);
    }
}

function updateMenuBadges(general) {
    const badgeEtudiants = document.getElementById('badgeEtudiants');
    const badgeDossiers = document.getElementById('badgeDossiers');
    
    if (badgeEtudiants) {
        badgeEtudiants.textContent = general?.total_candidatures || 0;
    }
    
    if (badgeDossiers) {
        badgeDossiers.textContent = general?.en_attente || 0;
    }
}

// =================== RECHERCHE GLOBALE ===================

let searchTimeout;
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('globalSearch');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performGlobalSearch(e.target.value);
            }, 500);
        });
    }
});

async function performGlobalSearch(query) {
    if (!query || query.length < 3) return;
    
    console.log('🔍 Recherche globale:', query);
    
    try {
        const response = await apiClient.searchApplications(query);
        // Afficher les résultats dans un dropdown ou rediriger
        console.log('Résultats:', response);
    } catch (error) {
        console.error('Erreur recherche:', error);
    }
}

// =================== INITIALISATION ===================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initialisation application...');
    
    // Vérifier l'authentification
    if (!apiClient || !apiClient.token) {
        console.warn('⚠️ Non authentifié - redirection');
        window.location.href = 'index.html';
        return;
    }
    
    // Mettre à jour les infos utilisateur dans la sidebar
    if (apiClient.currentUser) {
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        const userRole = document.getElementById('userRole');
        
        if (userAvatar) {
            userAvatar.textContent = apiClient.currentUser.nom.charAt(0).toUpperCase();
        }
        
        if (userName) {
            userName.textContent = apiClient.currentUser.nom;
        }
        
        if (userRole) {
            userRole.textContent = apiClient.currentUser.role === 'admin' ? 'Administrateur' : 'Utilisateur';
        }
    }
    
    // Charger le dashboard par défaut
    await loadDashboardData();
    
    // Actualiser les données toutes les 5 minutes
    setInterval(() => {
        const activePage = document.querySelector('.page.active');
        if (activePage && activePage.id === 'dashboard') {
            loadDashboardData();
        }
    }, 5 * 60 * 1000);
    
    console.log('✅ Application initialisée');
});

// =================== RESPONSIVE ===================

// Fermer la sidebar sur mobile après navigation
if (window.innerWidth <= 1024) {
    const originalNavigateTo = navigateTo;
    navigateTo = function(pageId) {
        originalNavigateTo(pageId);
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('collapsed')) {
            sidebar.classList.add('collapsed');
        }
    };
}

// Gérer le redimensionnement de la fenêtre
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const sidebar = document.getElementById('sidebar');
        if (window.innerWidth > 1024) {
            sidebar.classList.remove('open');
        }
    }, 250);
});

// =================== UTILITAIRES ===================

// Fonction pour afficher un loader
function showLoader(show = true) {
    let loader = document.getElementById('globalLoader');
    
    if (show && !loader) {
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
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;
        loader.innerHTML = `
            <div style="background: white; padding: 30px; border-radius: 15px; text-align: center;">
                <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px;"></div>
                <p style="margin: 0; color: #333; font-weight: 600;">Chargement...</p>
            </div>
        `;
        document.body.appendChild(loader);
        
        // Ajouter l'animation de rotation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    } else if (!show && loader) {
        loader.remove();
    }
}

// Exporter les fonctions globalement
window.navigateTo = navigateTo;
window.toggleSidebar = toggleSidebar;
window.loadDashboardData = loadDashboardData;
window.showLoader = showLoader;

console.log('✅ Module sidebar chargé');