let currentCharts = {};
let currentStatistics = {};

// Configuration des couleurs pour les graphiques
const COLORS = {
    primary: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'],
    success: ['#28a745', '#20c997', '#17a2b8', '#6f42c1', '#e83e8c', '#fd7e14'],
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
};

// =================== GESTION DES ONGLETS STATISTIQUES ===================
function ouvrirOngletStats(event, ongletNom) {
    // Masquer tous les contenus d'onglets
    document.querySelectorAll('.stats-tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Retirer la classe active de tous les boutons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Afficher l'onglet sélectionné
    document.getElementById(`stats-${ongletNom}`).classList.add('active');
    event.target.classList.add('active');
    
    // Charger les données de l'onglet
    switch(ongletNom) {
        case 'tableau-bord':
            chargerTableauBordStats();
            break;
        case 'genre':
            chargerStatsGenreAvancees();
            break;
        case 'type-bac':
            chargerStatsTypeBacAvancees();
            break;
        case 'facultes':
            chargerStatsFacultesAvancees();
            break;
        case 'filieres':
            chargerStatsFilieresAvancees();
            break;
        case 'temporelles':
            chargerStatsTemporellesAvancees();
            break;
        case 'avancees':
            chargerAnalysesAvancees();
            break;
    }
}
// Aller sur la page statistiques
navigateTo('statistiques');

// Attendre 1 seconde puis tester
setTimeout(() => debugStats(), 1000);

// Charger manuellement
chargerTableauBordStats();
// =================== FONCTIONS UTILITAIRES POUR LES GRAPHIQUES ===================

// Fonction pour détruire un graphique existant
function destroyChart(chartId) {
    if (currentCharts[chartId]) {
        currentCharts[chartId].destroy();
        delete currentCharts[chartId];
    }
}

// Graphique en secteurs (camembert)
function createPieChart(canvasId, data, options = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    destroyChart(canvasId);

    const config = {
        type: 'pie',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            ...options
        }
    };

    const chart = new Chart(ctx, config);
    currentCharts[canvasId] = chart;
    return chart;
}

// Fonction globale pour l'export Excel des approuvés
async function exporterApprouvesExcel() {
    try {
        console.log('📊 Lancement export Excel approuvés...');
        
        
        await apiClient.exportApprouvesExcel();
        
        UIHelpers.showSuccess('Export Excel téléchargé avec succès !');
        
    } catch (error) {
        console.error('❌ Erreur export Excel approuvés:', error);
        UIHelpers.showError('Erreur lors de l\'export Excel: ' + error.message);
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Graphique en barres
function createBarChart(canvasId, data, options = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    destroyChart(canvasId);

    const config = {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            ...options
        }
    };

    const chart = new Chart(ctx, config);
    currentCharts[canvasId] = chart;
    return chart;
}

// Graphique en barres horizontales
function createHorizontalBarChart(canvasId, data, options = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    destroyChart(canvasId);

    const config = {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            ...options
        }
    };

    const chart = new Chart(ctx, config);
    currentCharts[canvasId] = chart;
    return chart;
}

// Graphique linéaire
function createLineChart(canvasId, data, options = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    destroyChart(canvasId);

    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            ...options
        }
    };

    const chart = new Chart(ctx, config);
    currentCharts[canvasId] = chart;
    return chart;
}

// Graphique en anneau (doughnut)
function createDoughnutChart(canvasId, data, options = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    destroyChart(canvasId);

    const config = {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            ...options
        }
    };

    const chart = new Chart(ctx, config);
    currentCharts[canvasId] = chart;
    return chart;
}

// Graphique mixte (barres + ligne)
function createMixedChart(canvasId, data, options = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    destroyChart(canvasId);

    const config = {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            ...options
        }
    };

    const chart = new Chart(ctx, config);
    currentCharts[canvasId] = chart;
    return chart;
}

// =================== FONCTIONS D'EXPORT ET IMPRESSION ===================

// Exporter toutes les statistiques en PDF
async function exporterToutesStatistiques() {
    try {
        
        
        // Créer un PDF complet avec jsPDF
        const doc = new window.jsPDF('p', 'mm', 'a4');
        
        // Configuration
        let y = 20;
        const margin = 20;
        const pageWidth = doc.internal.pageSize.width;
        
        // En-tête
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('Rapport Statistiques Complet', pageWidth/2, y, { align: 'center' });
        y += 15;
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, pageWidth/2, y, { align: 'center' });
        y += 20;
        
        // Résumé général
        const general = currentStatistics.general || {};
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Résumé Général', margin, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total candidatures: ${general.total_candidatures || 0}`, margin, y);
        y += 6;
        doc.text(`Candidatures approuvées: ${general.approuves || 0}`, margin, y);
        y += 6;
        doc.text(`Répartition genre - Hommes: ${general.hommes || 0}, Femmes: ${general.femmes || 0}`, margin, y);
        y += 15;
        
        // Ajouter d'autres sections...
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Analyses Détaillées', margin, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('• Répartition par genre et performances', margin, y);
        y += 6;
        doc.text('• Analyse par type de baccalauréat', margin, y);
        y += 6;
        doc.text('• Répartition par faculté et filière', margin, y);
        y += 6;
        doc.text('• Évolution temporelle des candidatures', margin, y);
        y += 15;
        
        // Footer
        doc.setFontSize(8);
        doc.text(`Rapport généré par EduFile - ${new Date().toLocaleString('fr-FR')}`, 
                 pageWidth/2, doc.internal.pageSize.height - 10, { align: 'center' });
        
        // Sauvegarder
        doc.save(`Statistiques_EduFile_${new Date().toISOString().split('T')[0]}.pdf`);
        
        UIHelpers.showSuccess('Rapport PDF généré avec succès!');
        
    } catch (error) {
        console.error('Erreur export PDF:', error);
        UIHelpers.showError('Erreur lors de la génération du PDF');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Exporter les statistiques de la section actuelle
function exporterStatistiquesActuelles() {
    const activeTab = document.querySelector('.stats-tab-content.active');
    if (!activeTab) return;
    
    const tabId = activeTab.id.replace('stats-', '');
    
    try {
        // Export en CSV selon la section active
        let csvData = '';
        let filename = `Statistiques_${tabId}_${new Date().toISOString().split('T')[0]}.csv`;
        
        switch(tabId) {
            case 'genre':
                csvData = exporterCSVGenre();
                break;
            case 'type-bac':
                csvData = exporterCSVTypeBac();
                break;
            case 'filieres':
                csvData = exporterCSVFilieres();
                break;
            case 'facultes':
                csvData = exporterCSVFacultes();
                break;
            default:
                csvData = exporterCSVGeneral();
                filename = `Statistiques_General_${new Date().toISOString().split('T')[0]}.csv`;
        }
        
        // Télécharger le fichier CSV
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        UIHelpers.showSuccess('Export CSV généré avec succès!');
        
    } catch (error) {
        console.error('Erreur export CSV:', error);
        UIHelpers.showError('Erreur lors de l\'export CSV');
    }
}

// Fonctions d'export CSV spécifiques
function exporterCSVGenre() {
    const headers = ['Genre', 'Total_Candidatures', 'Approuvees', 'Rejetees', 'En_Attente', 'Taux_Approbation'];
    let csv = headers.join(',') + '\n';
    
    // Récupérer les données du tableau
    const rows = document.querySelectorAll('#detailsTableauGenre tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
            const rowData = Array.from(cells).map(cell => 
                cell.textContent.replace(/,/g, ';').trim()
            );
            csv += rowData.join(',') + '\n';
        }
    });
    
    return csv;
}

function exporterCSVTypeBac() {
    const headers = ['Type_Bac', 'Total_Candidatures', 'Approuvees', 'Taux_Approbation'];
    let csv = headers.join(',') + '\n';
    
    // Utiliser les données stockées en mémoire
    if (currentStatistics.typeBac) {
        currentStatistics.typeBac.forEach(stat => {
            const tauxApprobation = ((parseInt(stat.approuves) / parseInt(stat.nombre)) * 100).toFixed(1);
            csv += `${stat.type_bac},${stat.nombre},${stat.approuves},${tauxApprobation}%\n`;
        });
    }
    
    return csv;
}

function exporterCSVFilieres() {
    const headers = ['Filiere', 'Total_Candidatures', 'Approuvees', 'Taux_Approbation'];
    let csv = headers.join(',') + '\n';
    
    if (currentStatistics.filieres) {
        currentStatistics.filieres.forEach(stat => {
            const tauxApprobation = ((parseInt(stat.approuves) / parseInt(stat.nombre)) * 100).toFixed(1);
            csv += `${stat.filiere},${stat.nombre},${stat.approuves},${tauxApprobation}%\n`;
        });
    }
    
    return csv;
}

function exporterCSVFacultes() {
    const headers = ['Faculte', 'Premier_Choix', 'Deuxieme_Choix', 'Troisieme_Choix', 'Total'];
    let csv = headers.join(',') + '\n';
    
    if (currentStatistics.facultes) {
        currentStatistics.facultes.forEach(stat => {
            const total = parseInt(stat.premier_choix) + parseInt(stat.deuxieme_choix) + parseInt(stat.troisieme_choix);
            csv += `${stat.faculte},${stat.premier_choix},${stat.deuxieme_choix},${stat.troisieme_choix},${total}\n`;
        });
    }
    
    return csv;
}

function exporterCSVGeneral() {
    const headers = ['Indicateur', 'Valeur'];
    let csv = headers.join(',') + '\n';
    
    const general = currentStatistics.general || {};
    csv += `Total_Candidatures,${general.total_candidatures || 0}\n`;
    csv += `Candidatures_Approuvees,${general.approuves || 0}\n`;
    csv += `Hommes,${general.hommes || 0}\n`;
    csv += `Femmes,${general.femmes || 0}\n`;
    csv += `Taux_Approbation,${general.total_candidatures > 0 ? ((general.approuves / general.total_candidatures) * 100).toFixed(1) : 0}%\n`;
    
    return csv;
}

// Imprimer le rapport
function imprimerRapport() {
    const activeTab = document.querySelector('.stats-tab-content.active');
    if (!activeTab) return;
    
    // Créer une nouvelle fenêtre pour l'impression
    const printWindow = window.open('', '_blank');
    
    // HTML pour l'impression
    const printHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Rapport Statistiques EduFile</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    margin: 20px; 
                    line-height: 1.6;
                }
                h1, h2, h3 { 
                    color: #667eea; 
                    page-break-after: avoid;
                }
                table { 
                    border-collapse: collapse; 
                    width: 100%; 
                    margin: 20px 0;
                }
                th, td { 
                    border: 1px solid #ddd; 
                    padding: 8px; 
                    text-align: left;
                }
                th { 
                    background-color: #667eea; 
                    color: white;
                }
                .no-print { 
                    display: none;
                }
                .print-header {
                    text-align: center;
                    border-bottom: 2px solid #667eea;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .stat-summary {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 15px 0;
                }
                @media print {
                    body { margin: 0; }
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <h1>Université Djibo Hamani de Tahoua</h1>
                <h2>Rapport Statistiques EduFile</h2>
                <p>Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</p>
            </div>
            
            <div class="stat-summary">
                <h3>Résumé Général</h3>
                <p><strong>Total candidatures:</strong> ${document.getElementById('statTotalCandidatures')?.textContent || 0}</p>
                <p><strong>Candidatures approuvées:</strong> ${document.getElementById('statApprouvees')?.textContent || 0}</p>
                <p><strong>Répartition genre:</strong> ${document.getElementById('statHommes')?.textContent || 0} hommes, ${document.getElementById('statFemmes')?.textContent || 0} femmes</p>
            </div>
            
            ${activeTab.innerHTML.replace(/canvas/g, 'div').replace(/onclick="[^"]*"/g, '')}
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #666;">
                <p>Rapport généré automatiquement par le système EduFile</p>
                <p>Université Djibo Hamani de Tahoua - Service Central de la Scolarité</p>
            </div>
        </body>
        </html>
    `;
    
    printWindow.document.write(printHTML);
    printWindow.document.close();
    
    // Attendre le chargement puis imprimer
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 1000);
}

// =================== FONCTIONS D'INITIALISATION ===================

// Initialiser les statistiques au chargement de la page
function initialiserStatistiques() {
    console.log('🚀 Initialisation module statistiques...');
    
    // Vérifier les dépendances
    if (typeof Chart === 'undefined') {
        console.error('❌ Chart.js non chargé');
        UIHelpers.showError('Erreur: Chart.js non chargé');
        return false;
    }
    
    if (typeof apiClient === 'undefined') {
        console.error('❌ ApiClient non disponible');
        return false;
    }
    
    // Configuration Chart.js
    Chart.defaults.font.family = 'Arial, sans-serif';
    Chart.defaults.color = '#666';
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
    
    console.log('✅ Module statistiques initialisé');
    return true;
}

// Auto-initialisation avec retry
let initRetries = 0;
const maxRetries = 5;

function tentativeInitialisation() {
    if (initialiserStatistiques()) {
        console.log('✅ Initialisation réussie');
        
        // Si on est sur la page stats et connecté en admin
        if (window.location.hash === '#statistiques' && 
            apiClient?.currentUser?.role === 'admin') {
            setTimeout(() => {
                console.log('📊 Chargement automatique du tableau de bord');
                chargerTableauBordStats();
            }, 1000);
        }
    } else {
        initRetries++;
        if (initRetries < maxRetries) {
            console.log(`🔄 Nouvelle tentative (${initRetries}/${maxRetries}) dans 2s...`);
            setTimeout(tentativeInitialisation, 2000);
        } else {
            console.error('❌ Échec initialisation après', maxRetries, 'tentatives');
        }
    }
}

// Démarrer l'initialisation
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(tentativeInitialisation, 1000);
    });
} else {
    setTimeout(tentativeInitialisation, 1000);
}

console.log('📊 Module statistiques chargé');
// Nettoyer tous les graphiques
function nettoyerTousLesGraphiques() {
    Object.keys(currentCharts).forEach(chartId => {
        destroyChart(chartId);
    });
    currentStatistics = {};
    console.log('Tous les graphiques ont été nettoyés');
}

// Sauvegarder les statistiques en cache pour l'export

// Dans la fonction exporterStatistiquesActuelles()
async function exporterStatistiquesActuelles() {
    const activeTab = document.querySelector('.stats-tab-content.active');
    if (!activeTab) return;
    
    const tabId = activeTab.id.replace('stats-', '');
    
    try {
        
        
        switch(tabId) {
            case 'facultes':
                // Export avec toutes les infos pour cette section
                await apiClient.exportBySection('par-faculte');
                break;
            case 'genre':
                await apiClient.exportBySection('par-genre');
                break;
            default:
                await apiClient.exportStatistics(tabId);
        }
        
        UIHelpers.showSuccess('Export téléchargé avec succès!');
    } catch (error) {
        console.error('Erreur export:', error);
        UIHelpers.showError('Erreur lors de l\'export');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Nouvelle fonction pour export complet
async function exporterToutesLesCandidatures() {
    try {
        
        await apiClient.exportCandidaturesComplete();
        UIHelpers.showSuccess('Export complet téléchargé!');
    } catch (error) {
        console.error('Erreur:', error);
        UIHelpers.showError('Erreur lors de l\'export complet');
    } finally {
        UIHelpers.showLoading(false);
    }
}
// =================== MISE À JOUR DE LA FONCTION PRINCIPALE ===================

// Modifier la fonction chargerStatistiques existante
const originalChargerStatistiques = window.chargerStatistiques;
window.chargerStatistiques = function() {
    // Appeler l'ancienne fonction pour la compatibilité
    if (originalChargerStatistiques) {
        originalChargerStatistiques.call(this);
    }
    
    // Initialiser les nouvelles statistiques
    setTimeout(() => {
        chargerTableauBordStats();
    }, 100);
};

// Auto-initialisation
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        initialiserStatistiques();
    }, 1000);
});

// Export pour utilisation globale
window.statistiquesAvancees = {
    chargerTableauBordStats,
    chargerStatsGenreAvancees,
    chargerStatsTypeBacAvancees,
    chargerStatsFacultesAvancees,
    chargerStatsFilieresAvancees,
    chargerStatsTemporellesAvancees,
    chargerAnalysesAvancees,
    ouvrirOngletStats,
    exporterToutesStatistiques,
    exporterStatistiquesActuelles,
    imprimerRapport,
    nettoyerTousLesGraphiques
};

console.log('✅ Module statistiques avancées chargé avec succès');

// =================== TABLEAU DE BORD PRINCIPAL ===================
async function chargerTableauBordStats() {
    try {
        console.log('🎯 Chargement tableau de bord...');
        
        if (!apiClient.currentUser || apiClient.currentUser.role !== 'admin') {
            return;
        }
        
        
        
        // ✅ Une seule requête au lieu de plusieurs
        const dashboardData = await apiClient.getStatsDashboard();
        
        if (!dashboardData?.success) {
            throw new Error('Réponse invalide');
        }
        
        const { general, topFilieres, repartitionBac, evolution } = dashboardData;
        
        // ✅ Mise à jour batch des éléments
        const updates = {
            'statTotalCandidatures': general?.total_candidatures || 0,
            'statApprouvees': general?.approuves || 0,
            'statHommes': general?.hommes || 0,
            'statFemmes': general?.femmes || 0
        };
        
        Object.entries(updates).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
        
        // ✅ Créer les graphiques uniquement si les canvas existent
        const graphiques = [
            {
                id: 'chartTopFiliere',
                type: 'pie',
                data: topFilieres,
                prepare: (data) => ({
                    labels: data.map(f => f.filiere),
                    datasets: [{
                        data: data.map(f => f.nombre),
                        backgroundColor: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'],
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                })
            },
            {
                id: 'chartRepartitionBacs',
                type: 'bar',
                data: repartitionBac,
                prepare: (data) => ({
                    labels: data.map(b => b.type_bac),
                    datasets: [{
                        label: 'Candidatures',
                        data: data.map(b => b.nombre),
                        backgroundColor: '#28a745'
                    }]
                })
            },
            {
                id: 'chartEvolution',
                type: 'line',
                data: evolution,
                prepare: (data) => ({
                    labels: data.map(e => e.mois),
                    datasets: [{
                        label: 'Candidatures',
                        data: data.map(e => e.candidatures),
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                })
            }
        ];
        
        graphiques.forEach(({ id, type, data, prepare }) => {
            if (data && data.length > 0) {
                const canvas = document.getElementById(id);
                if (canvas) {
                    if (currentCharts[id]) {
                        currentCharts[id].destroy();
                    }
                    currentCharts[id] = new Chart(canvas, {
                        type: type,
                        data: prepare(data),
                        options: {
                            responsive: true,
                            maintainAspectRatio: false
                        }
                    });
                }
            }
        });
        
        console.log('✅ Tableau de bord chargé');
        
    } catch (error) {
        console.error('❌ Erreur:', error);
    } finally {
        UIHelpers.showLoading(false);
    }
}



window.exporterParFaculte = async function() {
    try {
        
        await apiClient.exporterParFaculte();
        UIHelpers.showSuccess('Export par faculté téléchargé !');
    } catch (error) {
        console.error('Erreur:', error);
        UIHelpers.showError('Erreur lors de l\'export par faculté');
    } finally {
        UIHelpers.showLoading(false);
    }
};

window.exporterParGenre = async function() {
    try {
        
        await apiClient.exporterParGenre();
        UIHelpers.showSuccess('Export par genre téléchargé !');
    } catch (error) {
        console.error('Erreur:', error);
        UIHelpers.showError('Erreur lors de l\'export par genre');
    } finally {
        UIHelpers.showLoading(false);
    }
};

window.exporterParStatut = async function() {
    try {
        
        await apiClient.exporterParStatut('en-attente'); // Par défaut en-attente
        UIHelpers.showSuccess('Export par statut téléchargé !');
    } catch (error) {
        console.error('Erreur:', error);
        UIHelpers.showError('Erreur lors de l\'export par statut');
    } finally {
        UIHelpers.showLoading(false);
    }
};

console.log('✅ Corrections pour les exports par section appliquées');

function tentativeInitialisation() {
    if (initialiserStatistiques()) {
        console.log('✅ Initialisation réussie');
        
        // Si on est sur la page stats et connecté en admin
        if (window.location.hash === '#statistiques' && 
            apiClient?.currentUser?.role === 'admin') {
            setTimeout(() => {
                console.log('📊 Chargement automatique du tableau de bord');
                chargerTableauBordStats();
            }, 1000);
        }
    } else {
        initRetries++;
        if (initRetries < maxRetries) {
            console.log(`🔄 Nouvelle tentative (${initRetries}/${maxRetries}) dans 2s...`);
            setTimeout(tentativeInitialisation, 2000);
        } else {
            console.error('❌ Échec initialisation après', maxRetries, 'tentatives');
        }
    }
}

// Démarrer l'initialisation
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(tentativeInitialisation, 1000);
    });
} else {
    setTimeout(tentativeInitialisation, 1000);
}

console.log('📊 Module statistiques chargé');
// Nettoyer tous les graphiques
function nettoyerTousLesGraphiques() {
    Object.keys(currentCharts).forEach(chartId => {
        destroyChart(chartId);
    });
    currentStatistics = {};
    console.log('Tous les graphiques ont été nettoyés');
}

// Sauvegarder les statistiques en cache pour l'export
// Fonction pour sauvegarder les statistiques en cache
function sauvegarderStatistiques(type, data) {
    if (!currentStatistics) {
        currentStatistics = {};
    }
    currentStatistics[type] = data;
    console.log(`💾 Stats ${type} sauvegardées`, data);
}

// =================== NOUVELLES MÉTHODES API POUR LES STATISTIQUES ===================

// Ajouter ces méthodes à la classe ApiClient existante
if (typeof apiClient !== 'undefined') {
    // Statistiques par genre
    apiClient.getStatsByGenre = async function() {
        const data = await this.request('/admin/stats/genre');
        sauvegarderStatistiques('genre', data.stats);
        return data;
    };

    // Statistiques par filières
    apiClient.getStatsByFilieres = async function() {
        const data = await this.request('/admin/stats/filieres');
        sauvegarderStatistiques('filieres', data.stats);
        return data;
    };

    // Statistiques par facultés
    apiClient.getStatsByFacultes = async function() {
        const data = await this.request('/admin/stats/facultes-candidatures');
        sauvegarderStatistiques('facultes', data.stats);
        return data;
    };

    // Statistiques par type de bac
    apiClient.getStatsByTypeBac = async function() {
        const data = await this.request('/admin/stats/type-bac');
        sauvegarderStatistiques('typeBac', data.stats);
        return data;
    };

    // Statistiques par lieu d'obtention
    apiClient.getStatsByLieuObtention = async function() {
        return this.request('/admin/stats/lieu-obtention');
    };

    // Statistiques temporelles
    apiClient.getStatsTemporelles = async function() {
        return this.request('/admin/stats/temporelles');
    };

    // Statistiques croisées genre × type de bac
    apiClient.getStatsGenreBac = async function() {
        return this.request('/admin/stats/genre-bac');
    };

    // Statistiques mentions par filières
    apiClient.getStatsMentionsFilieres = async function() {
        return this.request('/admin/stats/mentions-filieres');
    };

    // Tableau de bord complet
    apiClient.getStatsDashboard = async function() {
        const data = await this.request('/admin/stats/dashboard');
        sauvegarderStatistiques('general', data.general);
        return data;
    };

    // Export des statistiques
    apiClient.exportStatistics = async function(type) {
        const response = await fetch(`${API_BASE_URL}/admin/export/statistiques/${type}`, {
            headers: {
                Authorization: `Bearer ${this.token}`
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
    };
}
// =================== STATISTIQUES PAR GENRE AVANCÉES ===================
async function chargerStatsGenreAvancees() {
    try {
        
        
        const response = await apiClient.getStatsByGenre();
        const stats = response.stats || [];
        
        if (stats.length === 0) {
            document.getElementById('stats-genre').innerHTML = '<p class="text-center">Aucune donnée disponible</p>';
            return;
        }
        
        // Graphique principal par genre
        const dataGenre = {
            labels: stats.map(s => s.genre === 'masculin' ? 'Hommes' : 'Femmes'),
            datasets: [{
                data: stats.map(s => parseInt(s.nombre)),
                backgroundColor: ['#36A2EB', '#FF6384'],
                borderColor: '#fff',
                borderWidth: 3
            }]
        };
        
        createPieChart('chartGenre', dataGenre, {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 20 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} (${percentage}%)`;
                        }
                    }
                }
            }
        });
        
        // Graphique taux d'approbation par genre
        const dataApprobation = {
            labels: stats.map(s => s.genre === 'masculin' ? 'Hommes' : 'Femmes'),
            datasets: [{
                label: 'Taux d\'approbation (%)',
                data: stats.map(s => ((parseInt(s.approuves) / parseInt(s.nombre)) * 100).toFixed(1)),
                backgroundColor: COLORS.success,
                borderColor: '#fff',
                borderWidth: 2
            }]
        };
        
        createBarChart('chartGenreApprobation', dataApprobation, {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        });
        
        // Tableau détaillé
        const tableauBody = document.getElementById('detailsTableauGenre');
        tableauBody.innerHTML = '';
        
        stats.forEach(stat => {
            const total = parseInt(stat.nombre);
            const approuves = parseInt(stat.approuves);
            const rejetes = parseInt(stat.rejetes || 0);
            const enAttente = parseInt(stat.en_attente || 0);
            const tauxApprobation = ((approuves / total) * 100).toFixed(1);
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${stat.genre === 'masculin' ? 'Hommes' : 'Femmes'}</strong></td>
                <td>${total}</td>
                <td><span class="status-badge status-approved">${approuves}</span></td>
                <td><span class="status-badge status-rejected">${rejetes}</span></td>
                <td><span class="status-badge status-pending">${enAttente}</span></td>
                <td><strong>${tauxApprobation}%</strong></td>
            `;
            tableauBody.appendChild(row);
        });
        
        // Insights pour les détails
        const detailsDiv = document.getElementById('detailsGenre');
        const hommes = stats.find(s => s.genre === 'masculin') || {};
        const femmes = stats.find(s => s.genre === 'feminin') || {};
        
        detailsDiv.innerHTML = `
            <div class="stat-detail">
                <h4>Analyse Comparative</h4>
                <p><strong>Genre dominant:</strong> ${parseInt(hommes.nombre || 0) > parseInt(femmes.nombre || 0) ? 'Masculin' : 'Féminin'}</p>
                <p><strong>Écart:</strong> ${Math.abs(parseInt(hommes.nombre || 0) - parseInt(femmes.nombre || 0))} candidatures</p>
                <p><strong>Taux de parité:</strong> ${((Math.min(parseInt(hommes.nombre || 0), parseInt(femmes.nombre || 0)) / Math.max(parseInt(hommes.nombre || 0), parseInt(femmes.nombre || 0))) * 100).toFixed(1)}%</p>
            </div>
        `;
        
    } catch (error) {
        console.error('Erreur chargement stats genre:', error);
        UIHelpers.showError('Erreur lors du chargement des statistiques par genre');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// =================== STATISTIQUES PAR TYPE DE BAC AVANCÉES ===================
async function chargerStatsTypeBacAvancees() {
    try {
        
        
        const response = await apiClient.getStatsByTypeBac();
        const stats = response.stats || [];
        
        if (stats.length === 0) return;
        
        // Distribution par type de bac
        const dataTypeBac = {
            labels: stats.map(s => s.type_bac),
            datasets: [{
                data: stats.map(s => parseInt(s.nombre)),
                backgroundColor: COLORS.primary,
                borderColor: '#fff',
                borderWidth: 2
            }]
        };
        
        createPieChart('chartTypeBac', dataTypeBac, {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 15 }
                }
            }
        });
        
        // Performance par type de bac
        const dataPerformance = {
            labels: stats.map(s => s.type_bac),
            datasets: [{
                label: 'Total candidatures',
                data: stats.map(s => parseInt(s.nombre)),
                backgroundColor: COLORS.primary[0],
                yAxisID: 'y'
            }, {
                label: 'Taux d\'approbation (%)',
                data: stats.map(s => ((parseInt(s.approuves) / parseInt(s.nombre)) * 100).toFixed(1)),
                backgroundColor: COLORS.success[0],
                yAxisID: 'y1',
                type: 'line',
                borderColor: COLORS.success[0],
                tension: 0.3
            }]
        };
        
        createMixedChart('chartTypeBacPerformance', dataPerformance, {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    max: 100,
                    grid: {
                        drawOnChartArea: false,
                    },
                }
            }
        });
        
    } catch (error) {
        console.error('Erreur chargement stats type bac:', error);
        UIHelpers.showError('Erreur lors du chargement des statistiques par type de bac');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// =================== STATISTIQUES PAR FACULTÉ AVANCÉES ===================
async function chargerStatsFacultesAvancees() {
    try {
        
        
        const response = await apiClient.getStatsByFacultes();
        const stats = response.stats || [];
        
        if (stats.length === 0) return;
        
        // Graphique principal des facultés
        const dataFacultes = {
            labels: stats.map(s => s.faculte),
            datasets: [{
                label: '1er choix',
                data: stats.map(s => parseInt(s.premier_choix)),
                backgroundColor: COLORS.primary[0],
            }, {
                label: '2ème choix',
                data: stats.map(s => parseInt(s.deuxieme_choix)),
                backgroundColor: COLORS.primary[1],
            }, {
                label: '3ème choix',
                data: stats.map(s => parseInt(s.troisieme_choix)),
                backgroundColor: COLORS.primary[2],
            }]
        };
        
        createBarChart('chartFacultes', dataFacultes, {
            responsive: true,
            plugins: {
                legend: { 
                    position: 'top',
                    labels: { padding: 20 }
                }
            },
            scales: {
                x: { stacked: true },
                y: { 
                    stacked: true,
                    beginAtZero: true
                }
            }
        });
        
        // Graphique des préférences de choix
        const totalChoix = stats.reduce((acc, s) => {
            acc.premier += parseInt(s.premier_choix);
            acc.deuxieme += parseInt(s.deuxieme_choix);
            acc.troisieme += parseInt(s.troisieme_choix);
            return acc;
        }, { premier: 0, deuxieme: 0, troisieme: 0 });
        
        const dataChoix = {
            labels: ['1er Choix', '2ème Choix', '3ème Choix'],
            datasets: [{
                data: [totalChoix.premier, totalChoix.deuxieme, totalChoix.troisieme],
                backgroundColor: ['#28a745', '#ffc107', '#dc3545'],
                borderColor: '#fff',
                borderWidth: 3
            }]
        };
        
        createDoughnutChart('chartChoixFacultes', dataChoix, {
            responsive: true,
            cutout: '50%',
            plugins: {
                legend: { position: 'bottom' }
            }
        });
        
        // Détails par faculté
        const detailsDiv = document.getElementById('detailsFacultes');
        let detailsHtml = '<div class="stat-detail-grid">';
        
        stats.forEach(stat => {
            const total = parseInt(stat.premier_choix) + parseInt(stat.deuxieme_choix) + parseInt(stat.troisieme_choix);
            const tauxPremierChoix = ((parseInt(stat.premier_choix) / total) * 100).toFixed(1);
            
            detailsHtml += `
                <div class="stat-detail">
                    <h4>${stat.faculte}</h4>
                    <p><strong>Total candidatures:</strong> ${total}</p>
                    <p><strong>Attractivité (1er choix):</strong> ${tauxPremierChoix}%</p>
                    <p><strong>Approuvées:</strong> ${stat.approuves || 0}</p>
                </div>
            `;
        });
        
        detailsHtml += '</div>';
        detailsDiv.innerHTML = detailsHtml;
        
    } catch (error) {
        console.error('Erreur chargement stats facultés:', error);
        UIHelpers.showError('Erreur lors du chargement des statistiques par faculté');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// =================== STATISTIQUES PAR FILIÈRE AVANCÉES ===================
async function chargerStatsFilieresAvancees() {
    try {
        
        
        const response = await apiClient.getStatsByFilieres();
        const stats = response.stats || [];
        
        if (stats.length === 0) return;
        
        // Graphique horizontal des filières
        const dataFilieres = {
            labels: stats.map(s => s.filiere.charAt(0).toUpperCase() + s.filiere.slice(1).toLowerCase()),
            datasets: [{
                label: 'Candidatures totales',
                data: stats.map(s => parseInt(s.nombre)),
                backgroundColor: COLORS.primary[0],
                borderColor: COLORS.primary[1],
                borderWidth: 1
            }, {
                label: 'Candidatures approuvées',
                data: stats.map(s => parseInt(s.approuves)),
                backgroundColor: COLORS.success[0],
                borderColor: COLORS.success[1],
                borderWidth: 1
            }]
        };
        
        createHorizontalBarChart('chartFilieres', dataFilieres, {
            responsive: true,
            indexAxis: 'y',
            plugins: {
                legend: { 
                    position: 'top',
                    labels: { padding: 20 }
                }
            },
            scales: {
                x: { beginAtZero: true }
            }
        });
        
        // Tableau détaillé
        const tableauBody = document.getElementById('detailsFilieres');
        tableauBody.innerHTML = '';
        
        stats.forEach((stat, index) => {
            const total = parseInt(stat.nombre);
            const approuves = parseInt(stat.approuves);
            const tauxApprobation = ((approuves / total) * 100).toFixed(1);
            const popularite = Math.min(5, Math.ceil((total / stats[0].nombre) * 5)); // Étoiles de popularité
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${stat.filiere}</strong></td>
                <td><span class="stat-badge primary">${total}</span></td>
                <td><span class="stat-badge success">${approuves}</span></td>
                <td><strong>${tauxApprobation}%</strong></td>
                <td>${'⭐'.repeat(popularite)}</td>
            `;
            tableauBody.appendChild(row);
        });
        
    } catch (error) {
        console.error('Erreur chargement stats filières:', error);
        UIHelpers.showError('Erreur lors du chargement des statistiques par filière');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// =================== STATISTIQUES TEMPORELLES AVANCÉES ===================
async function chargerStatsTemporellesAvancees() {
    try {
        
        
        const response = await apiClient.getStatsTemporelles();
        const stats = response.stats || [];
        
        if (stats.length === 0) return;
        
        // Graphique d'évolution principale
        const dataTemporel = {
            labels: stats.map(s => {
                const date = new Date(s.mois);
                return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
            }),
            datasets: [{
                label: 'Candidatures',
                data: stats.map(s => parseInt(s.nombre_candidatures)),
                borderColor: COLORS.primary[0],
                backgroundColor: COLORS.primary[0] + '20',
                fill: true,
                tension: 0.4
            }, {
                label: 'Approuvées',
                data: stats.map(s => parseInt(s.approuves)),
                borderColor: COLORS.success[0],
                backgroundColor: COLORS.success[0] + '20',
                fill: true,
                tension: 0.4
            }]
        };
        
        createLineChart('chartTemporel', dataTemporel, {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: { beginAtZero: true }
            }
        });
        
        // Tendances mensuelles (barres)
        const dataTendances = {
            labels: stats.map(s => {
                const date = new Date(s.mois);
                return date.toLocaleDateString('fr-FR', { month: 'long' });
            }),
            datasets: [{
                label: 'Hommes',
                data: stats.map(s => parseInt(s.hommes || 0)),
                backgroundColor: '#36A2EB'
            }, {
                label: 'Femmes',
                data: stats.map(s => parseInt(s.femmes || 0)),
                backgroundColor: '#FF6384'
            }]
        };
        
        createBarChart('chartTendances', dataTendances, {
            responsive: true,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true }
            }
        });
        
        // Analyse d'activité
        const totalCandidatures = stats.reduce((sum, s) => sum + parseInt(s.nombre_candidatures), 0);
        const moyenneMensuelle = (totalCandidatures / stats.length).toFixed(1);
        const picActivite = stats.reduce((max, s) => 
            parseInt(s.nombre_candidatures) > parseInt(max.nombre_candidatures) ? s : max
        );
        
        const analyseDiv = document.getElementById('analyseActivite');
        analyseDiv.innerHTML = `
            <div class="stat-detail">
                <h4>Pic d'Activité</h4>
                <p><strong>Mois le plus actif:</strong> ${new Date(picActivite.mois).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
                <p><strong>Candidatures:</strong> ${picActivite.nombre_candidatures}</p>
                <p><strong>Moyenne mensuelle:</strong> ${moyenneMensuelle}</p>
            </div>
        `;
        
    } catch (error) {
        console.error('Erreur chargement stats temporelles:', error);
        UIHelpers.showError('Erreur lors du chargement des statistiques temporelles');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// =================== ANALYSES AVANCÉES ===================
async function chargerAnalysesAvancees() {
    try {
        
        
        // Charger toutes les analyses avancées en parallèle
        const [
            responseGenreBac,
            responseMentions,
            responseLieux,
            responseGeneral
        ] = await Promise.all([
            apiClient.getStatsGenreBac(),
            apiClient.getStatsMentionsFilieres(),
            apiClient.getStatsByLieuObtention(),
            apiClient.getStatsDashboard()
        ]);
        
        // Graphique Genre × Type de Bac
        const statsGenreBac = responseGenreBac.stats || [];
        if (statsGenreBac.length > 0) {
            const genreLabels = [...new Set(statsGenreBac.map(s => s.genre))];
            const typeBacLabels = [...new Set(statsGenreBac.map(s => s.type_bac))];
            
            const datasets = genreLabels.map((genre, index) => ({
                label: genre === 'masculin' ? 'Hommes' : 'Femmes',
                data: typeBacLabels.map(typeBac => {
                    const stat = statsGenreBac.find(s => s.genre === genre && s.type_bac === typeBac);
                    return stat ? parseInt(stat.nombre) : 0;
                }),
                backgroundColor: index === 0 ? '#36A2EB' : '#FF6384',
                borderColor: '#fff',
                borderWidth: 1
            }));
            
            createBarChart('chartGenreBac', {
                labels: typeBacLabels,
                datasets: datasets
            }, {
                responsive: true,
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: { beginAtZero: true }
                }
            });
        }
        
        // Graphique Mentions par Filière
        const statsMentions = responseMentions.stats || [];
        if (statsMentions.length > 0) {
            const filieresMentions = statsMentions.slice(0, 8); // Top 8
            const mentionTypes = [...new Set(filieresMentions.map(s => s.mention))];
            
            const datasets = mentionTypes.map((mention, index) => ({
                label: mention,
                data: [...new Set(filieresMentions.map(s => s.filiere))].map(filiere => {
                    const stat = filieresMentions.find(s => s.filiere === filiere && s.mention === mention);
                    return stat ? parseInt(stat.nombre) : 0;
                }),
                backgroundColor: COLORS.primary[index % COLORS.primary.length],
                borderColor: '#fff',
                borderWidth: 1
            }));
            
            createBarChart('chartMentionsFilieres', {
                labels: [...new Set(filieresMentions.map(s => s.filiere))],
                datasets: datasets
            }, {
                responsive: true,
                plugins: { legend: { position: 'top' } },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true }
                }
            });
        }
        
        // Graphique Répartition Géographique
        const statsLieux = responseLieux.stats || [];
        if (statsLieux.length > 0) {
            createPieChart('chartLieuObtention', {
                labels: statsLieux.map(s => s.lieu_obtention),
                datasets: [{
                    data: statsLieux.map(s => parseInt(s.nombre)),
                    backgroundColor: COLORS.success,
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            }, {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            });
        }
        
        // Indices de Performance
        const general = responseGeneral.general || {};
        const totalCandidatures = parseInt(general.total_candidatures || 0);
        const approuves = parseInt(general.approuves || 0);
        const tauxGlobal = totalCandidatures > 0 ? ((approuves / totalCandidatures) * 100).toFixed(1) : 0;
        
        document.getElementById('tauxGlobalApprobation').textContent = tauxGlobal + '%';
        
        // Filière la plus demandée
        const topFilieres = responseGeneral.topFilieres || [];
        if (topFilieres.length > 0) {
            document.getElementById('filierePlusDemanndee').textContent = topFilieres[0].filiere;
        }
        
        // Diversité des profils
        const diversite = `${statsLieux.length} régions, ${statsMentions.length > 0 ? [...new Set(statsMentions.map(s => s.mention))].length : 2} types de mentions`;
        document.getElementById('diversiteProfils').textContent = diversite;
        
        // Insights automatiques
        genererInsightsAutomatiques({
            general,
            statsLieux,
            statsMentions,
            topFilieres
        });
        
    } catch (error) {
        console.error('Erreur chargement analyses avancées:', error);
        UIHelpers.showError('Erreur lors du chargement des analyses avancées');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// =================== GÉNÉRATION D'INSIGHTS AUTOMATIQUES ===================
function genererInsightsAutomatiques(data) {
    const insights = [];
    const { general, statsLieux, topFilieres } = data;
    
    // Insight sur le taux d'approbation
    const tauxApprobation = (parseInt(general.approuves || 0) / parseInt(general.total_candidatures || 1)) * 100;
    if (tauxApprobation > 70) {
        insights.push(`🎉 Excellent taux d'approbation de ${tauxApprobation.toFixed(1)}% - Performance élevée du processus de sélection`);
    } else if (tauxApprobation < 30) {
        insights.push(`⚠️ Taux d'approbation faible (${tauxApprobation.toFixed(1)}%) - Opportunité d'amélioration du processus`);
    }
    
    // Insight sur la parité
    const hommes = parseInt(general.hommes || 0);
    const femmes = parseInt(general.femmes || 0);
    const total = hommes + femmes;
    if (total > 0) {
        const parite = Math.min(hommes, femmes) / Math.max(hommes, femmes);
        if (parite > 0.8) {
            insights.push(`⚖️ Excellente parité homme-femme (${((Math.min(hommes, femmes) / total) * 100).toFixed(1)}%)`);
        } else {
            const dominant = hommes > femmes ? 'masculin' : 'féminin';
            insights.push(`📊 Déséquilibre genre avec dominance ${dominant} (${((Math.max(hommes, femmes) / total) * 100).toFixed(1)}%)`);
        }
    }
    
    // Insight sur la diversité géographique
    if (statsLieux && statsLieux.length > 0) {
        if (statsLieux.length >= 6) {
            insights.push(`🌍 Excellente représentativité géographique avec ${statsLieux.length} régions`);
        }
        
        const regionDominante = statsLieux[0];
        if (regionDominante && parseInt(regionDominante.nombre) > (parseInt(general.total_candidatures || 0) * 0.5)) {
            insights.push(`📍 Forte concentration régionale : ${regionDominante.lieu_obtention} (${((parseInt(regionDominante.nombre) / parseInt(general.total_candidatures || 1)) * 100).toFixed(1)}%)`);
        }
    }
    
    // Insight sur la concentration des filières
    if (topFilieres && topFilieres.length > 0) {
        const top3 = topFilieres.slice(0, 3).reduce((sum, f) => sum + parseInt(f.nombre), 0);
        const concentrationTop3 = (top3 / parseInt(general.total_candidatures || 1)) * 100;
        if (concentrationTop3 > 60) {
            insights.push(`🔥 Forte concentration sur 3 filières (${concentrationTop3.toFixed(1)}% des candidatures)`);
        }
    }
    
    // Afficher les insights
    const insightsDiv = document.getElementById('insightsAutomatiques');
    if (insights.length > 0) {
        insightsDiv.innerHTML = insights.map(insight => 
            `<div class="stat-detail" style="margin: 10px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #667eea;">
                ${insight}
            </div>`
        ).join('');
    } else {
        insightsDiv.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #666;">
                <div style="font-size: 48px; margin-bottom: 10px;">🤔</div>
                <p>Aucun insight particulier détecté avec les données actuelles.</p>
            </div>
        `;
    }
}
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
