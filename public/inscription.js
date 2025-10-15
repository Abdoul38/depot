// =================== GESTION DES ÉTUDIANTS ===================
function afficherIndicateurRechargement(element) {
    if (!element) return;
    
    const indicator = document.createElement('div');
    indicator.className = 'reload-indicator';
    indicator.innerHTML = '🔄 Rechargement...';
    indicator.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: #667eea;
        color: white;
        padding: 8px 15px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        z-index: 1000;
        animation: pulse 1s infinite;
    `;
    
    // Ajouter l'animation
    if (!document.getElementById('pulseAnimation')) {
        const style = document.createElement('style');
        style.id = 'pulseAnimation';
        style.textContent = `
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
        `;
        document.head.appendChild(style);
    }
    
    element.style.position = 'relative';
    element.appendChild(indicator);
    
    // Retirer après 2 secondes
    setTimeout(() => {
        if (indicator.parentNode) {
            indicator.remove();
        }
    }, 2000);
}

// Charger la liste des étudiants
async function chargerEtudiants(filters = {}) {
    try {
        console.log('📚 Chargement étudiants...');
        
        const tableau = document.getElementById('tableauEtudiants');
        if (tableau) {
            afficherIndicateurRechargement(tableau.parentElement);
        }
        
        const response = await apiClient.getEtudiants(filters);
        const etudiants = response.etudiants || [];
        
        console.log(`✅ ${etudiants.length} étudiants`);
        
        const tbody = document.getElementById('tableauEtudiants');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (etudiants.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;">Aucun étudiant</td></tr>';
            return;
        }
        
        // ✅ Insertion rapide
        const fragment = document.createDocumentFragment();
        
        etudiants.forEach(etudiant => {
            const row = document.createElement('tr');
            
            const statutClass = etudiant.statut === 'actif' ? 'status-approved' : 
                              etudiant.statut === 'inactif' ? 'status-pending' : 'status-rejected';
            
            let statutInscriptionClass = 'status-pending';
            let statutInscriptionText = 'Aucune';
            
            if (etudiant.statut_inscription) {
                switch(etudiant.statut_inscription) {
                    case 'validee':
                        statutInscriptionClass = 'status-approved';
                        statutInscriptionText = 'Validée';
                        break;
                    case 'en-attente':
                        statutInscriptionClass = 'status-pending';
                        statutInscriptionText = 'En attente';
                        break;
                    case 'annulee':
                        statutInscriptionClass = 'status-rejected';
                        statutInscriptionText = 'Annulée';
                        break;
                }
            }
            
            const filiereNiveau = etudiant.filiere_libelle 
                ? `${etudiant.filiere_libelle}<br><small>${etudiant.niveau || ''}</small>`
                : '<em style="color:#999;">Non défini</em>';
            
            row.innerHTML = `
                <td>
                    ${etudiant.matricule ? `<strong style="color:#667eea;">${etudiant.matricule}</strong>` : '<small style="color:#999;">Aucun</small>'}
                    <br><small style="color:#666;">${etudiant.numero_dossier}</small>
                </td>
                <td><strong>${etudiant.prenom} ${etudiant.nom}</strong></td>
                <td>
                    <div style="font-size:11px;">
                        <div>${etudiant.email}</div>
                        <div style="color:#666;">${etudiant.telephone}</div>
                    </div>
                </td>
                <td>${filiereNiveau}</td>
                <td><span class="status-badge ${statutInscriptionClass}" style="font-size:10px;padding:3px 6px;">${statutInscriptionText}</span></td>
                <td><span class="status-badge ${statutClass}" style="font-size:11px;padding:3px 8px;">${etudiant.statut}</span></td>
                <td style="text-align:center;">
                    <label class="switch" style="transform:scale(0.8);">
                        <input type="checkbox" ${etudiant.peut_inscrire ? 'checked' : ''} 
                               onchange="toggleInscriptionEtudiant(${etudiant.id})">
                        <span class="slider"></span>
                    </label>
                </td>
                <td>
                    <div style="display:flex;gap:3px;flex-wrap:wrap;">
                        <button class="btn btn-primary" style="padding:4px 8px;font-size:11px;" onclick="ouvrirModalInscriptionAdmin(${etudiant.id})" title="Inscrire">✏️</button>
                        <button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="modifierEtudiant(${etudiant.id})" title="Modifier">✏️</button>
                        ${etudiant.statut_inscription === 'validee' ? `
                        <button class="btn btn-success" style="padding:4px 8px;font-size:11px;" 
                                onclick="telechargerRecuEtudiant(${etudiant.id})"
                                title="Télécharger le reçu">📄</button>` : ''}
                        ${!etudiant.matricule ? `<button class="btn btn-primary" style="padding:4px 8px;font-size:11px;" onclick="genererMatricule(${etudiant.id})" title="Générer matricule">🎓</button>` : ''}
                        <button class="btn" style="padding:4px 8px;font-size:11px;background:#dc3545;color:white;" onclick="supprimerEtudiant(${etudiant.id})" title="Supprimer">🗑️</button>
                    </div>
                </td>
            `;
            
            fragment.appendChild(row);
        });
        
        tbody.appendChild(fragment);
        
    } catch (error) {
        console.error('❌ Erreur:', error);
        UIHelpers.showError('Erreur chargement');
    }
}

console.log('🚀 Optimisations de vitesse appliquées !');

// ========== GÉNÉRATION DU REÇU D'INSCRIPTION ==========

async function genererRecuInscription(inscription) {
  console.log('Début génération reçu inscription pour:', inscription);
  
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
    // Logo université (à gauche) - Réduit
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

    // Texte en-tête (centré) - Compacté
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 51, 102);
    doc.text("RÉPUBLIQUE DU NIGER", 105, 12, { align: "center" });
    
    doc.setFontSize(7.5);
    doc.text("MINISTÈRE DE L'ENSEIGNEMENT SUPÉRIEUR DE LA RECHERCHE", 105, 16, { align: "center" });
    doc.text("ET DE L'INNOVATION TECHNOLOGIQUE", 105, 19, { align: "center" });
    doc.text("UNIVERSITÉ DJIBO HAMANI", 105, 22, { align: "center" });
    doc.text("SERVICE CENTRAL DE LA SCOLARITÉ (SCScol)", 105, 25, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Tel: 86 15 67 79 | BP: 237 Tahoua / Niger | Email: scscol.udh@gmail.com", 105, 29, { align: "center" });

    // Ligne de séparation décorative
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.5);
    doc.line(15, 32, 195, 32);

    // ========== TITRE DU REÇU (OPTIMISÉ) ==========
    let y = 40;
    
    // Encadré coloré pour le titre - Plus compact
    doc.setFillColor(0, 51, 102);
    doc.rect(35, y, 140, 10, 'F');
    
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("REÇU D'INSCRIPTION", 105, y + 6.5, { align: "center" });
    
    y += 14;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 51, 102);
    doc.text(`Année académique ${inscription.annee_universitaire || "2025-2026"}`, 105, y, { align: "center" });

    y += 8;

    // ========== INFORMATIONS ÉTUDIANT (OPTIMISÉ) ==========
    // Cadre principal - Plus compact
    doc.setDrawColor(28, 167, 69);
    doc.setLineWidth(0.5);
    doc.rect(15, y, 180, 32);

    y += 6;

    // Titre section
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 51, 102);
    doc.text("INFORMATIONS DE L'ÉTUDIANT", 20, y);
    
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);

    const infosEtudiant = [
      `Nom et Prénom: ${inscription.prenom} ${inscription.nom}`,
      `Date de naissance: ${inscription.date_naissance ? new Date(inscription.date_naissance).toLocaleDateString('fr-FR') : ""}`,
      `Email: ${inscription.email || ""}`,
      `Téléphone: ${inscription.telephone || ""}`
    ];

    infosEtudiant.forEach(info => {
      doc.text(info, 20, y);
      y += 4.5;
    });

    // ========== QR CODE (OPTIMISÉ) ==========
    const qrX = 158;
    const qrY = 68;
    const qrSize = 24;

    try {
      const qrData = JSON.stringify({
        type: "inscription",
        numero_dossier: inscription.numero_dossier,
        nom: inscription.nom,
        prenom: inscription.prenom,
        annee: inscription.annee_universitaire,
        date_inscription: inscription.date_inscription
      });

      const qrContainer = document.createElement('div');
      qrContainer.style.display = 'none';
      document.body.appendChild(qrContainer);

      const qrCode = new QRCode(qrContainer, {
        text: qrData,
        width: 120,
        height: 120,
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
        
        doc.setFontSize(6);
        doc.setTextColor(0, 0, 0);
        doc.text('Vérification', qrX + qrSize/2, qrY + qrSize + 3, { align: 'center' });
        
        console.log('✅ QR Code ajouté');
      }

      document.body.removeChild(qrContainer);

    } catch (error) {
      console.warn('Erreur QR Code:', error);
    }

    y += 6;

    // ========== FORMATION (OPTIMISÉ) ==========
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 51, 102);
    doc.text("FORMATION INSCRITE", 20, y);
    doc.line(20, y + 1, 195, y + 1);

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);

    doc.text(`Filière: ${inscription.filiere_libelle || inscription.filiere || ""}`, 20, y);
    y += 4.5;
    doc.text(`Niveau: ${inscription.niveau || ""}`, 20, y);
    y += 4.5;
    doc.text(`Faculté: ${inscription.faculte_libelle || inscription.faculte || ""}`, 20, y);
    y += 4.5;
    doc.text(`Statut d'inscription: ${inscription.statut_inscription || "validee"}`, 20, y);

    y += 8;

    // ========== DÉTAILS INSCRIPTION (OPTIMISÉ) ==========
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 51, 102);
    doc.text("DÉTAILS DE L'INSCRIPTION", 20, y);
    doc.line(20, y + 1, 195, y + 1);

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);

    const dateInscription = new Date(inscription.date_inscription || inscription.created_at);
    doc.text(`Date d'inscription: ${dateInscription.toLocaleDateString('fr-FR')} à ${dateInscription.toLocaleTimeString('fr-FR')}`, 20, y);
    y += 4.5;
    doc.text(`Numéro de dossier: ${inscription.numero_dossier || ""}`, 20, y);
    y += 4.5;
    doc.text(`Année universitaire: ${inscription.annee_universitaire || "2025-2026"}`, 20, y);
    y += 4.5;
    
    // MONTANT
    y += 2;
    const montant = inscription.montant || 10000;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    
    const montantFormate = montant.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    doc.text(`Montant payé: ${montantFormate} FCFA`, 20, y);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);

    y += 8;

    // ========== NOTE IMPORTANTE (OPTIMISÉ) ==========
    doc.setDrawColor(255, 193, 7);
    doc.setFillColor(255, 243, 205);
    doc.rect(20, y, 175, 18, 'FD');

    y += 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(133, 100, 4);
    doc.text("⚠️ IMPORTANT", 25, y);
    
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const textImportant = "Ce reçu confirme votre inscription administrative. Veuillez le présenter à la " +
                         "Scolarité centrale pour finaliser votre inscription académique. Conservez-le précieusement.";
    doc.text(textImportant, 25, y, { maxWidth: 165, align: "justify" });

    y += 12;

    // ========== SIGNATURES (OPTIMISÉ) ==========
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    
    const today = new Date().toLocaleDateString("fr-FR", { 
      weekday: "long", 
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    });
    
    doc.text(`Fait à Tahoua, le ${today}`, 20, y);
    
    y += 12;
    
    doc.setFont("helvetica", "italic");
    doc.text("L'étudiant(e)", 35, y);
    doc.text("Le Service Central de la Scolarité", 130, y);
    
    y += 10;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("(Signature)", 35, y);
    doc.text("(Cachet et signature)", 130, y);

    // ========== PIED DE PAGE ==========
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 51, 102);
    doc.text("Université Djibo Hamani - Service Central de la Scolarité", 105, 280, { align: "center" });

    // Numéro de reçu
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    const numeroRecu = `RECU-${inscription.numero_dossier || inscription.matricule}-${Date.now()}`;
    doc.text(`N° ${numeroRecu}`, 105, 285, { align: "center" });

    // Sauvegarde
    const nomFichier = `Recu_Inscription_${(inscription.nom || "").replace(/\s+/g, "_")}_${(inscription.prenom || "").replace(/\s+/g, "_")}.pdf`;
    doc.save(nomFichier);
    
    console.log('✅ Reçu d\'inscription généré avec succès');
    UIHelpers.showSuccess('Reçu d\'inscription téléchargé avec succès !');

  } catch (error) {
    console.error("Erreur génération reçu:", error);
    UIHelpers.showError('Erreur lors de la génération du reçu');
    throw error;
  }
}

// ========== TÉLÉCHARGER LE REÇU DEPUIS LE TABLEAU DES ÉTUDIANTS ==========

async function telechargerRecuEtudiant(etudiantId) {
  try {
    
    
    console.log('📄 Récupération inscription pour étudiant:', etudiantId);
    
    // ✅ CORRECTION: Utiliser la bonne route
    const response = await apiClient.request(`/admin/etudiants/${etudiantId}/derniere-inscription`);
    
    if (!response.success || !response.inscription) {
      UIHelpers.showError('Aucune inscription validée trouvée pour cet étudiant');
      return;
    }
    
    const inscription = response.inscription;
    
    console.log('✅ Inscription trouvée:', inscription);
    
    // Vérifier que l'inscription est validée
    if (inscription.statut_inscription !== 'validee') {
      UIHelpers.showError('L\'inscription doit être validée pour générer un reçu');
      return;
    }
    
    // Générer le reçu
    await genererRecuInscription(inscription);
    
  } catch (error) {
    console.error('❌ Erreur téléchargement reçu:', error);
    UIHelpers.showError('Erreur lors du téléchargement du reçu: ' + error.message);
  } finally {
    UIHelpers.showLoading(false);
  }
}

// Rechercher les étudiants
function rechercherEtudiants() {
    const filters = {
        search: document.getElementById('searchEtudiant')?.value || '',
        statut: document.getElementById('filtreStatutEtudiant')?.value || ''
    };
    
    console.log('🔍 Recherche avec filtres:', filters);
    
    // ✅ Vider le cache avant la recherche
    viderCacheApresModification('etudiant');
    
    chargerEtudiants(filters);
}

// Toggle inscription étudiant
async function toggleInscriptionEtudiant(id) {
    try {
        console.log('🔄 Toggle inscription pour étudiant:', id);
        await apiClient.toggleInscriptionEtudiant(id);
        
        // ✅ Vider le cache
        viderCacheApresModification('etudiant');
        
        UIHelpers.showSuccess('Statut d\'inscription modifié');
        
        // ✅ Pas besoin de recharger, le toggle est visuel
    } catch (error) {
        console.error('❌ Erreur toggle:', error);
        UIHelpers.showError('Erreur lors de la modification');
        rechercherEtudiants();
    }
}


// Modifier un étudiant
async function modifierEtudiant(id) {
    try {
        console.log('📝 Modification étudiant:', id);
        
        
        const response = await apiClient.getEtudiant(id);
        const etudiant = response.etudiant;
        
        if (!etudiant) {
            throw new Error('Étudiant non trouvé');
        }
        
        // Remplir le formulaire
        document.getElementById('editEtudiantId').value = etudiant.id;
        document.getElementById('editMatricule').value = etudiant.matricule || '';
        document.getElementById('editNumeroDossier').value = etudiant.numero_dossier;
        document.getElementById('editNom').value = etudiant.nom;
        document.getElementById('editPrenom').value = etudiant.prenom;
        document.getElementById('editDateNaissance').value = etudiant.date_naissance;
        document.getElementById('editLieuNaissance').value = etudiant.lieu_naissance;
        document.getElementById('editEmail').value = etudiant.email;
        document.getElementById('editTelephone').value = etudiant.telephone;
        document.getElementById('editStatut').value = etudiant.statut;
        document.getElementById('editPeutInscrire').checked = etudiant.peut_inscrire;
        
        openModal('modifierEtudiantModal');
        
    } catch (error) {
        console.error('❌ Erreur:', error);
        UIHelpers.showError('Erreur lors du chargement: ' + error.message);
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Sauvegarder les modifications d'un étudiant
async function sauvegarderEtudiant(event) {
    event.preventDefault();
    
    try {
        console.log('💾 Sauvegarde étudiant...');
        
        UIHelpers.showLoading(true);
        
        const id = document.getElementById('editEtudiantId').value;
        const data = {
            matricule: document.getElementById('editMatricule').value || null,
            nom: document.getElementById('editNom').value,
            prenom: document.getElementById('editPrenom').value,
            date_naissance: document.getElementById('editDateNaissance').value,
            lieu_naissance: document.getElementById('editLieuNaissance').value,
            nationalite: 'nigerienne',
            genre: 'masculin',
            adresse: 'Adresse',
            telephone: document.getElementById('editTelephone').value,
            email: document.getElementById('editEmail').value,
            type_bac: null,
            lieu_obtention: null,
            annee_obtention: null,
            mention: null,
            statut: document.getElementById('editStatut').value,
            peut_inscrire: document.getElementById('editPeutInscrire').checked
        };
        
        await apiClient.updateEtudiant(id, data);
        
        // ✅ Vider le cache
        viderCacheApresModification('etudiant');
        
        closeModal('modifierEtudiantModal');
        
        // ✅ Recharger la liste
        setTimeout(() => rechercherEtudiants(), 300);
        
        UIHelpers.showSuccess('Étudiant modifié avec succès');
        
    } catch (error) {
        console.error('❌ Erreur sauvegarde:', error);
        UIHelpers.showError('Erreur lors de la sauvegarde: ' + error.message);
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Générer un matricule
async function genererMatricule(id) {
    if (!confirm('Générer un matricule automatique pour cet étudiant ?')) return;
    
    try {
        console.log('🎓 Génération matricule pour:', id);
        
        UIHelpers.showLoading(true);
        
        await apiClient.genererMatricule(id);
        
        // ✅ Vider le cache
        viderCacheApresModification('etudiant');
        
        // ✅ Recharger la liste
        setTimeout(() => rechercherEtudiants(), 300);
        
        UIHelpers.showSuccess('Matricule généré avec succès');
    } catch (error) {
        console.error('❌ Erreur génération matricule:', error);
        UIHelpers.showError('Erreur lors de la génération: ' + error.message);
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Supprimer un étudiant
async function supprimerEtudiant(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet étudiant ? Cette action est irréversible.')) return;
    
    try {
        console.log('🗑️ Suppression étudiant:', id);
        
        UIHelpers.showLoading(true);
        
        await apiClient.supprimerEtudiant(id);
        
        // ✅ Vider le cache
        viderCacheApresModification('etudiant');
        
        // ✅ Recharger la liste
        setTimeout(() => rechercherEtudiants(), 300);
        
        UIHelpers.showSuccess('Étudiant supprimé');
    } catch (error) {
        console.error('❌ Erreur suppression:', error);
        UIHelpers.showError('Erreur lors de la suppression: ' + error.message);
    } finally {
        UIHelpers.showLoading(false);
    }
}

// =================== CONFIGURATION INSCRIPTION ===================

// Charger la configuration
async function chargerConfigInscription() {
    try {
        console.log('⚙️ Chargement configuration inscription...');
        const response = await apiClient.getConfigInscription();
        const config = response.config || {};
        
        document.getElementById('configActif').checked = config.actif || false;
        document.getElementById('configAnnee').value = config.annee_universitaire || '2024-2025';
        
        if (config.date_ouverture) {
            document.getElementById('configDateOuverture').value = 
                new Date(config.date_ouverture).toISOString().slice(0, 16);
        }
        
        if (config.date_fermeture) {
            document.getElementById('configDateFermeture').value = 
                new Date(config.date_fermeture).toISOString().slice(0, 16);
        }
        
        document.getElementById('configMessage').value = config.message_fermeture || '';
        
        console.log('✅ Configuration chargée');
        
    } catch (error) {
        console.error('❌ Erreur chargement config:', error);
        UIHelpers.showError('Erreur lors du chargement de la configuration');
    }
}

// Sauvegarder la configuration
async function sauvegarderConfigInscription(event) {
    event.preventDefault();
    
    try {
        console.log('💾 Sauvegarde configuration...');
        
        UIHelpers.showLoading(true);
        
        const config = {
            actif: document.getElementById('configActif').checked,
            annee_universitaire: document.getElementById('configAnnee').value,
            date_ouverture: document.getElementById('configDateOuverture').value || null,
            date_fermeture: document.getElementById('configDateFermeture').value || null,
            message_fermeture: document.getElementById('configMessage').value
        };
        
        await apiClient.updateConfigInscription(config);
        
        // ✅ Vider le cache
        viderCacheApresModification('config');
        
        UIHelpers.showSuccess('Configuration enregistrée');
        
    } catch (error) {
        console.error('❌ Erreur sauvegarde config:', error);
        UIHelpers.showError('Erreur lors de la sauvegarde: ' + error.message);
    } finally {
        UIHelpers.showLoading(false);
    }
}

// =================== RESTRICTIONS ===================

// Charger les restrictions
async function chargerRestrictions() {
    try {
        console.log('🚫 Chargement restrictions...');
        const response = await apiClient.getRestrictions();
        const restrictions = response.restrictions || [];
        
        const tbody = document.getElementById('tableauRestrictions');
        if (!tbody) {
            console.error('❌ Élément tableauRestrictions non trouvé');
            return;
        }
        
        tbody.innerHTML = '';
        
        if (restrictions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Aucune restriction</td></tr>';
            return;
        }
        
        restrictions.forEach(restriction => {
            const row = document.createElement('tr');
            
            let cible = '';
            switch(restriction.type) {
                case 'etudiant':
                    cible = `${restriction.etudiant_prenom} ${restriction.etudiant_nom} (${restriction.numero_dossier})`;
                    break;
                case 'filiere':
                    cible = restriction.filiere_libelle;
                    break;
                case 'niveau':
                    cible = `Niveau ${restriction.niveau}`;
                    break;
                case 'filiere_niveau':
                    cible = `${restriction.filiere_libelle} - ${restriction.niveau}`;
                    break;
            }
            
            row.innerHTML = `
                <td><span class="status-badge status-${restriction.type}">${restriction.type}</span></td>
                <td>${cible}</td>
                <td>${restriction.raison}</td>
                <td>
                    <label class="switch">
                        <input type="checkbox" ${restriction.actif ? 'checked' : ''} 
                               onchange="toggleRestriction(${restriction.id})">
                        <span class="slider"></span>
                    </label>
                </td>
                <td>
                    <button class="btn" style="padding: 5px 10px; background: #dc3545; color: white;" 
                            onclick="supprimerRestriction(${restriction.id})">Supprimer</button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        console.log(`✅ ${restrictions.length} restrictions chargées`);
        
    } catch (error) {
        console.error('❌ Erreur chargement restrictions:', error);
        UIHelpers.showError('Erreur lors du chargement des restrictions');
    }
}

// Préparer le formulaire de restriction
// Préparer le formulaire de restriction
async function prepareRestrictionForm() {
    try {
        console.log('📋 Préparation formulaire restriction...');
        
        // Charger les étudiants pour le select
        const etudiantsResponse = await apiClient.getEtudiants();
        const selectEtudiant = document.getElementById('restrictionEtudiant');
        
        if (selectEtudiant) {
            selectEtudiant.innerHTML = '<option value="">Sélectionner un étudiant...</option>';
            
            (etudiantsResponse.etudiants || []).forEach(e => {
                const option = document.createElement('option');
                option.value = e.id;
                option.textContent = `${e.prenom} ${e.nom} - ${e.numero_dossier}`;
                selectEtudiant.appendChild(option);
            });
            
            console.log(`✅ ${etudiantsResponse.etudiants?.length || 0} étudiants chargés`);
        }
        
        // Charger les filières
        const filieresResponse = await apiClient.getFilieres();
        const selectFiliere = document.getElementById('restrictionFiliere');
        
        if (selectFiliere) {
            selectFiliere.innerHTML = '<option value="">Sélectionner une filière...</option>';
            
            (filieresResponse.filieres || []).forEach(f => {
                const option = document.createElement('option');
                option.value = f.id;
                option.textContent = f.libelle;
                selectFiliere.appendChild(option);
            });
            
            console.log(`✅ ${filieresResponse.filieres?.length || 0} filières chargées`);
        }
        
        console.log('✅ Formulaire restriction préparé');
        
    } catch (error) {
        console.error('❌ Erreur préparation formulaire:', error);
        
        // Afficher un message d'erreur dans les selects
        const selectEtudiant = document.getElementById('restrictionEtudiant');
        const selectFiliere = document.getElementById('restrictionFiliere');
        
        if (selectEtudiant) {
            selectEtudiant.innerHTML = '<option value="">❌ Erreur chargement étudiants</option>';
        }
        if (selectFiliere) {
            selectFiliere.innerHTML = '<option value="">❌ Erreur chargement filières</option>';
        }
        
        throw error;
    }
}
// Export global
window.ouvrirModalRestriction = ouvrirModalRestriction;
window.prepareRestrictionForm = prepareRestrictionForm;

// Mettre à jour les champs selon le type
function updateRestrictionFields() {
    const type = document.getElementById('restrictionType').value;
    
    document.getElementById('restrictionEtudiantField').style.display = 'none';
    document.getElementById('restrictionFiliereField').style.display = 'none';
    document.getElementById('restrictionNiveauField').style.display = 'none';
    
    switch(type) {
        case 'etudiant':
            document.getElementById('restrictionEtudiantField').style.display = 'block';
            break;
        case 'filiere':
            document.getElementById('restrictionFiliereField').style.display = 'block';
            break;
        case 'niveau':
            document.getElementById('restrictionNiveauField').style.display = 'block';
            break;
        case 'filiere_niveau':
            document.getElementById('restrictionFiliereField').style.display = 'block';
            document.getElementById('restrictionNiveauField').style.display = 'block';
            break;
    }
}

// Sauvegarder une restriction
async function sauvegarderRestriction(event) {
    event.preventDefault();
    
    try {
        console.log('💾 Sauvegarde restriction...');
        
        UIHelpers.showLoading(true);
        
        const type = document.getElementById('restrictionType').value;
        const restriction = {
            type: type,
            raison: document.getElementById('restrictionRaison').value,
            filiere_id: null,
            niveau: null,
            etudiant_id: null
        };
        
        switch(type) {
            case 'etudiant':
                restriction.etudiant_id = document.getElementById('restrictionEtudiant').value;
                break;
            case 'filiere':
                restriction.filiere_id = document.getElementById('restrictionFiliere').value;
                break;
            case 'niveau':
                restriction.niveau = document.getElementById('restrictionNiveau').value;
                break;
            case 'filiere_niveau':
                restriction.filiere_id = document.getElementById('restrictionFiliere').value;
                restriction.niveau = document.getElementById('restrictionNiveau').value;
                break;
        }
        
        await apiClient.creerRestriction(restriction);
        
        // ✅ Vider le cache
        viderCacheApresModification('restriction');
        
        closeModal('ajoutRestrictionModal');
        
        // ✅ Recharger la liste
        setTimeout(() => chargerRestrictions(), 300);
        
        UIHelpers.showSuccess('Restriction créée');
        
    } catch (error) {
        console.error('❌ Erreur création restriction:', error);
        UIHelpers.showError('Erreur lors de la création: ' + error.message);
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Toggle une restriction
async function toggleRestriction(id) {
    try {
        console.log('🔄 Toggle restriction:', id);
        await apiClient.toggleRestriction(id);
        
        // ✅ Vider le cache
        viderCacheApresModification('restriction');
        
        UIHelpers.showSuccess('Restriction modifiée');
    } catch (error) {
        console.error('❌ Erreur toggle restriction:', error);
        UIHelpers.showError('Erreur lors de la modification');
        chargerRestrictions();
    }
}

// Supprimer une restriction
async function supprimerRestriction(id) {
    if (!confirm('Supprimer cette restriction ?')) return;
    
    try {
        UIHelpers.showLoading(true);
        
        await apiClient.supprimerRestriction(id);
        
        // ✅ Vider le cache
        viderCacheApresModification('restriction');
        
        // ✅ Recharger la liste
        setTimeout(() => chargerRestrictions(), 300);
        
        UIHelpers.showSuccess('Restriction supprimée');
    } catch (error) {
        console.error('Erreur suppression:', error);
        UIHelpers.showError('Erreur lors de la suppression');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// =================== IMPORT ÉTUDIANTS ===================

// ========== IMPORT AVEC RAFRAÎCHISSEMENT ==========

async function importerFichierEtudiants(fichier) {
    if (!fichier) return;
    
    try {
        UIHelpers.showLoading(true);
        
        const response = await apiClient.importerEtudiants(fichier);
        
        const resultDiv = document.getElementById('importResult');
        resultDiv.style.display = 'block';
        
        let html = `
            <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <strong>✅ Succès !</strong><br>
                ${response.imported} étudiants importés sur ${response.total}<br>
                ${response.inscrits} inscriptions créées
            </div>
        `;
        
        if (response.erreurs && response.erreurs.length > 0) {
            html += `
                <div style="background: #fff3cd; padding: 15px; border-radius: 8px;">
                    <strong>⚠️ Erreurs (${response.erreurs.length}):</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        ${response.erreurs.slice(0, 5).map(e => `<li>Ligne ${e.ligne || 'N/A'}: ${e.erreur}</li>`).join('')}
                        ${response.erreurs.length > 5 ? `<li>... et ${response.erreurs.length - 5} autres</li>` : ''}
                    </ul>
                </div>
            `;
        }
        
        resultDiv.innerHTML = html;
        
        // Réinitialiser l'input
        document.getElementById('importEtudiantsFile').value = '';
        
        // ✅ Vider le cache
        viderCacheApresModification('etudiant');
        viderCacheApresModification('stats');
        
        // ✅ Recharger la liste si on est sur la page étudiants
        if (document.getElementById('gestionEtudiants').classList.contains('active')) {
            setTimeout(() => rechercherEtudiants(), 1000);
        }
        
        UIHelpers.showSuccess(`✅ Import terminé: ${response.imported} étudiants ajoutés`);
        
    } catch (error) {
        console.error('Erreur import:', error);
        UIHelpers.showError('Erreur lors de l\'import: ' + error.message);
    } finally {
        UIHelpers.showLoading(false);
    }
}

// Ouvrir le modal d'inscription admin
// Remplacer la fonction existante par celle-ci :
async function ouvrirModalInscriptionAdmin(etudiantId) {
  try {
    console.log('🎓 Ouverture modal inscription pour étudiant:', etudiantId);
    
    
    const response = await apiClient.getEtudiant(etudiantId);
    
    if (!response.success) {
      throw new Error(response.error || 'Erreur lors de la récupération');
    }
    
    const etudiant = response.etudiant;
    
    if (!etudiant) {
      throw new Error('Étudiant non trouvé');
    }
    
    console.log('📋 Données étudiant:', etudiant);
    
    if (!etudiant.peut_inscrire) {
      UIHelpers.showError('Cet étudiant n\'est pas autorisé à s\'inscrire');
      return;
    }
    
    // Vérifier que l'étudiant a une filière et un niveau
    if (!etudiant.filiere_id || !etudiant.niveau) {
      UIHelpers.showError('Cet étudiant doit d\'abord avoir une filière et un niveau définis. Modifiez son profil d\'abord.');
      return;
    }
    
    // Afficher les informations complètes avec toutes les vérifications
    const infoHtml = `
      <h4 style="margin: 0 0 10px 0; color: #667eea;">👤 Étudiant</h4>
      <p style="margin: 5px 0;"><strong>Nom:</strong> ${etudiant.prenom || 'N/A'} ${etudiant.nom || 'N/A'}</p>
      <p style="margin: 5px 0;"><strong>N° Dossier:</strong> ${etudiant.numero_dossier || 'N/A'}</p>
      ${etudiant.matricule ? `<p style="margin: 5px 0;"><strong>Matricule:</strong> ${etudiant.matricule}</p>` : ''}
      <p style="margin: 5px 0;"><strong>Email:</strong> ${etudiant.email || 'N/A'}</p>
      <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #667eea;">
        <h5 style="margin: 0 0 10px 0; color: #28a745;">📚 Filière et Niveau</h5>
        <p style="margin: 5px 0;"><strong>Filière:</strong> ${etudiant.filiere_libelle || etudiant.filiere || 'Non définie'}</p>
        <p style="margin: 5px 0;"><strong>Niveau:</strong> ${etudiant.niveau || 'Non défini'}</p>
        <p style="margin: 5px 0;"><strong>Faculté:</strong> ${etudiant.faculte_libelle || etudiant.faculte || 'N/A'}</p>
      </div>
    `;
    
    document.getElementById('infoEtudiantInscription').innerHTML = infoHtml;
    document.getElementById('inscriptionEtudiantId').value = etudiantId;
    
    openModal('inscriptionAdminModal');
    
  } catch (error) {
    console.error('❌ Erreur ouverture modal inscription:', error);
    UIHelpers.showError('Erreur: ' + error.message);
  } finally {
    UIHelpers.showLoading(false);
  }
}


async function supprimerRestriction(id) {
    if (!confirm('Supprimer cette restriction ?')) return;
    
    try {
        UIHelpers.showLoading(true);
        
        await apiClient.supprimerRestriction(id);
        
        // ✅ Vider le cache
        viderCacheApresModification('restriction');
        
        // ✅ Recharger la liste
        setTimeout(() => chargerRestrictions(), 300);
        
        UIHelpers.showSuccess('Restriction supprimée');
    } catch (error) {
        console.error('Erreur suppression:', error);
        UIHelpers.showError('Erreur lors de la suppression');
    } finally {
        UIHelpers.showLoading(false);
    }
}

// ========== INSCRIPTION ADMIN ==========

// Modifier validerInscriptionAdmin
async function validerInscriptionAdmin(event) {
  event.preventDefault();
  
  try {
    console.log('💾 Validation inscription admin...');
    
    UIHelpers.showLoading(true);
    
    const data = {
      etudiant_id: parseInt(document.getElementById('inscriptionEtudiantId').value),
      annee_universitaire: document.getElementById('inscriptionAnnee').value,
      mode_paiement: document.getElementById('inscriptionModePaiement').value || null,
      montant: document.getElementById('inscriptionMontant').value || null,
      statut_paiement: document.getElementById('inscriptionStatutPaiement').value,
      statut_inscription: 'validee'
    };
    
    console.log('Données inscription:', data);
    
    const response = await apiClient.request('/admin/inscription/creer', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    // ✅ Vider le cache
    viderCacheApresModification('etudiant');
    viderCacheApresModification('stats');
    
    UIHelpers.showSuccess('Inscription créée avec succès');
    
    closeModal('inscriptionAdminModal');
    document.getElementById('inscriptionAdminForm').reset();
    
    // Proposer l'impression du reçu
    const imprimerRecu = confirm(
      '✅ Inscription validée avec succès!\n\n' +
      '📄 Voulez-vous générer et imprimer le reçu d\'inscription maintenant ?'
    );
    
    if (imprimerRecu && response.inscription) {
      console.log('📄 Génération du reçu...');
      
      const detailsResponse = await apiClient.getInscriptionDetails(response.inscription.id);
      
      if (detailsResponse.success) {
        await genererRecuInscription(detailsResponse.inscription);
        UIHelpers.showSuccess('Reçu téléchargé avec succès!');
      }
    }
    
    // ✅ Recharger la liste des étudiants
    setTimeout(() => rechercherEtudiants(), 300);
    
  } catch (error) {
    console.error('Erreur création inscription:', error);
    UIHelpers.showError('Erreur: ' + error.message);
  } finally {
    UIHelpers.showLoading(false);
  }
}
async function chargerStatutGlobalInscriptions() {
    try {
        const response = await apiClient.getStatutGlobalInscriptions();
        
        if (response.success) {
            const { config, statistiques } = response;
            
            // Mettre à jour le texte du statut
            const statutTexte = document.getElementById('statutGlobalTexte');
            const statsTexte = document.getElementById('statsGlobalesTexte');
            const btnToggle = document.getElementById('btnToggleGlobal');
            const messageContainer = document.getElementById('messageGlobalContainer');
            const messageInput = document.getElementById('messageGlobalRaison');
            
            if (config.actif) {
                statutTexte.textContent = '✅ Les inscriptions sont OUVERTES pour tous';
                statutTexte.style.color = '#d4edda';
                btnToggle.textContent = '🔒 BLOQUER toutes les inscriptions';
                btnToggle.style.background = '#dc3545';
                btnToggle.style.color = 'white';
                messageContainer.style.display = 'none';
            } else {
                statutTexte.textContent = '🚫 Les inscriptions sont BLOQUÉES pour tous';
                statutTexte.style.color = '#f8d7da';
                btnToggle.textContent = '✅ DÉBLOQUER toutes les inscriptions';
                btnToggle.style.background = '#28a745';
                btnToggle.style.color = 'white';
                messageContainer.style.display = 'block';
                messageInput.value = config.message_fermeture || '';
            }
            
            // Afficher les statistiques
            statsTexte.innerHTML = `
                📊 <strong>${statistiques.total_etudiants}</strong> étudiants au total | 
                ✅ <strong>${statistiques.etudiants_autorises}</strong> autorisés | 
                🚫 <strong>${statistiques.etudiants_bloques}</strong> bloqués
            `;
            
        }
    } catch (error) {
        console.error('❌ Erreur chargement statut global:', error);
        UIHelpers.showError('Erreur lors du chargement du statut');
    }
}

// 2. Toggle global des inscriptions
async function toggleInscriptionsGlobal() {
    try {
        const response = await apiClient.getStatutGlobalInscriptions();
        const actuelActif = response.config.actif;
        
        const action = actuelActif ? 'BLOQUER' : 'DÉBLOQUER';
        const message = actuelActif 
            ? '⚠️ Êtes-vous sûr de vouloir BLOQUER les inscriptions pour TOUS les étudiants ?\n\nCela empêchera toute nouvelle inscription jusqu\'à réactivation.'
            : '✅ Êtes-vous sûr de vouloir DÉBLOQUER les inscriptions pour TOUS les étudiants actifs ?\n\nLes étudiants pourront à nouveau s\'inscrire.';
        
        if (!confirm(message)) {
            return;
        }
        
        UIHelpers.showLoading(true);
        
        const raison = document.getElementById('messageGlobalRaison')?.value || null;
        
        const toggleResponse = await apiClient.toggleInscriptionsGlobal(!actuelActif, raison);
        
        if (toggleResponse.success) {
            // ✅ Vider le cache
            viderCacheApresModification('etudiant');
            viderCacheApresModification('config');
            
            UIHelpers.showSuccess(toggleResponse.message);
            
            const stats = toggleResponse.statistiques;
            UIHelpers.showMessage(
                `📊 Mise à jour effectuée :\n✅ ${stats.etudiants_autorises} autorisés\n🚫 ${stats.etudiants_bloques} bloqués`,
                'info'
            );
            
            // ✅ Recharger
            setTimeout(async () => {
                await chargerStatutGlobalInscriptions();
                if (typeof rechercherEtudiants === 'function') {
                    rechercherEtudiants();
                }
            }, 300);
        }
        
    } catch (error) {
        console.error('❌ Erreur toggle global:', error);
        UIHelpers.showError('Erreur lors du changement de statut: ' + error.message);
    } finally {
        UIHelpers.showLoading(false);
    }
}
// 3. Mettre à jour seulement le message
async function mettreAJourMessageGlobal() {
    try {
        
        
        const raison = document.getElementById('messageGlobalRaison').value;
        
        if (!raison || raison.trim() === '') {
            UIHelpers.showError('Veuillez saisir un message');
            return;
        }
        
        // Mettre à jour avec le statut actuel (false puisque le message n'est visible que quand bloqué)
        const response = await apiClient.toggleInscriptionsGlobal(false, raison);
        
        if (response.success) {
            UIHelpers.showSuccess('Message mis à jour avec succès');
        }
        
    } catch (error) {
        console.error('❌ Erreur mise à jour message:', error);
        UIHelpers.showError('Erreur lors de la mise à jour');
    } finally {
        UIHelpers.showLoading(false);
    }
}


// ========== FONCTIONS POUR CHARGER LES STATISTIQUES D'INSCRIPTION ==========
// À ajouter dans index.html ou dans un fichier JS séparé

async function chargerStatsInscriptions() {
    try {
        console.log('📊 Chargement stats inscriptions...');
        
        if (!apiClient || !apiClient.token) {
            console.log('⚠️ Non connecté');
            return;
        }
        
        // ✅ CORRECTION: Utiliser la bonne route
        const response = await apiClient.request('/inscription/stats', {
            skipCache: true // Forcer le rechargement
        });
        
        console.log('📥 Réponse stats:', response);
        
        if (!response.success) {
            throw new Error('Erreur récupération stats');
        }
        
        const { generales, evolutionJours, repartitionFiliere, repartitionNiveau, 
                repartitionGenre, repartitionPaiement, dernieres } = response.stats;
        
        // 1. Mettre à jour les cartes avec vérification
        const elementsStats = {
            'statEtudiantsAutorises': generales.etudiants_autorises,
            'statEtudiantsInscrits': generales.etudiants_inscrits,
            'statInscriptionsValidees': generales.inscriptions_validees
        };
        
        Object.entries(elementsStats).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            } else {
                console.warn(`⚠️ Élément ${id} non trouvé`);
            }
        });
        
        // Taux d'inscription
        const tauxElement = document.getElementById('statTauxInscription');
        if (tauxElement) {
            tauxElement.textContent = `${generales.taux_inscription}% du total`;
        }
        
        // Montant total
        const montantElement = document.getElementById('statMontantTotal');
        if (montantElement) {
            const montantFormate = parseInt(generales.montant_total).toLocaleString('fr-FR');
            montantElement.textContent = `${montantFormate} FCFA`;
        }
        
        // Montant moyen
        const moyenElement = document.getElementById('statMontantMoyen');
        if (moyenElement) {
            const montantMoyenFormate = parseInt(generales.montant_moyen).toLocaleString('fr-FR');
            moyenElement.textContent = `Moy: ${montantMoyenFormate} FCFA`;
        }
        
        // 2. Créer les graphiques
        console.log('📈 Création graphiques...');
        
        if (evolutionJours && evolutionJours.length > 0) {
            await creerGraphiqueEvolutionInscriptions(evolutionJours);
        } else {
            console.warn('⚠️ Pas de données évolution');
        }
        
        if (repartitionFiliere && repartitionFiliere.length > 0) {
            await creerGraphiqueFiliereInscriptions(repartitionFiliere);
        } else {
            console.warn('⚠️ Pas de données filières');
        }
        
        if (repartitionNiveau && repartitionNiveau.length > 0) {
            await creerGraphiqueNiveauInscriptions(repartitionNiveau);
        } else {
            console.warn('⚠️ Pas de données niveaux');
        }
        
        if (repartitionGenre && repartitionGenre.length > 0) {
            await creerGraphiqueGenreInscriptions(repartitionGenre);
        } else {
            console.warn('⚠️ Pas de données genre');
        }
        
        if (repartitionPaiement && repartitionPaiement.length > 0) {
            await creerGraphiquePaiementInscriptions(repartitionPaiement);
        } else {
            console.warn('⚠️ Pas de données paiement');
        }
        
        // 3. Afficher les dernières inscriptions
        if (dernieres && dernieres.length > 0) {
            afficherDernieresInscriptions(dernieres);
        }
        
        console.log('✅ Stats inscriptions chargées avec succès');
        
    } catch (error) {
        console.error('❌ Erreur stats inscriptions:', error);
        console.error('Stack:', error.stack);
        UIHelpers.showError('Erreur lors du chargement des statistiques: ' + error.message);
    }
}

// Graphique évolution par jour
async function creerGraphiqueEvolutionInscriptions(data) {
    const canvas = document.getElementById('chartEvolutionInscriptions');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (window.chartEvolutionInscriptionsInstance) {
        window.chartEvolutionInscriptionsInstance.destroy();
    }
    
    // Inverser les données pour afficher du plus ancien au plus récent
    const dataReversed = [...data].reverse();
    
    window.chartEvolutionInscriptionsInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dataReversed.map(d => {
                const date = new Date(d.jour);
                return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
            }),
            datasets: [
                {
                    label: 'Inscriptions',
                    data: dataReversed.map(d => d.nombre_inscriptions),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: 'Montant (FCFA)',
                    data: dataReversed.map(d => d.montant_jour),
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                if (context.datasetIndex === 1) {
                                    label += context.parsed.y.toLocaleString('fr-FR') + ' FCFA';
                                } else {
                                    label += context.parsed.y;
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Nombre d\'inscriptions'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Montant (FCFA)'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

// Graphique par filière
async function creerGraphiqueFiliereInscriptions(data) {
    const canvas = document.getElementById('chartFiliereInscriptions');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (window.chartFiliereInscriptionsInstance) {
        window.chartFiliereInscriptionsInstance.destroy();
    }
    
    const top5 = data.slice(0, 5);
    
    window.chartFiliereInscriptionsInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top5.map(d => d.filiere),
            datasets: [{
                label: 'Inscriptions',
                data: top5.map(d => d.nombre_inscriptions),
                backgroundColor: [
                    '#667eea',
                    '#764ba2',
                    '#f093fb',
                    '#4facfe',
                    '#00f2fe'
                ],
                borderWidth: 0,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const montant = top5[context.dataIndex].montant_total;
                            return 'Montant: ' + montant.toLocaleString('fr-FR') + ' FCFA';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Graphique par niveau
async function creerGraphiqueNiveauInscriptions(data) {
    const canvas = document.getElementById('chartNiveauInscriptions');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (window.chartNiveauInscriptionsInstance) {
        window.chartNiveauInscriptionsInstance.destroy();
    }
    
    window.chartNiveauInscriptionsInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.niveau),
            datasets: [{
                data: data.map(d => d.nombre_inscriptions),
                backgroundColor: [
                    '#667eea',
                    '#764ba2',
                    '#f093fb',
                    '#4facfe',
                    '#00f2fe'
                ],
                borderWidth: 3,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Graphique par genre
async function creerGraphiqueGenreInscriptions(data) {
    const canvas = document.getElementById('chartGenreInscriptions');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (window.chartGenreInscriptionsInstance) {
        window.chartGenreInscriptionsInstance.destroy();
    }
    
    window.chartGenreInscriptionsInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: data.map(d => d.genre === 'masculin' ? 'Hommes' : 'Femmes'),
            datasets: [{
                data: data.map(d => d.nombre_inscriptions),
                backgroundColor: ['#667eea', '#e83e8c'],
                borderWidth: 3,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Graphique modes de paiement
async function creerGraphiquePaiementInscriptions(data) {
    const canvas = document.getElementById('chartPaiementInscriptions');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (window.chartPaiementInscriptionsInstance) {
        window.chartPaiementInscriptionsInstance.destroy();
    }
    
    if (!data || data.length === 0) {
        ctx.font = '14px Arial';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'center';
        ctx.fillText('Aucune donnée disponible', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    window.chartPaiementInscriptionsInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.mode_paiement || 'Non défini'),
            datasets: [{
                label: 'Nombre',
                data: data.map(d => d.nombre),
                backgroundColor: '#28a745',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const montant = data[context.dataIndex].montant_total;
                            return 'Total: ' + montant.toLocaleString('fr-FR') + ' FCFA';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}
// Fonction pour ouvrir le modal de restriction avec préchargement
async function ouvrirModalRestriction() {
    try {
        console.log('📋 Ouverture modal restriction...');
        
        // Ouvrir le modal
        openModal('ajoutRestrictionModal');
        
        // Afficher un loader dans le modal
        const selectEtudiant = document.getElementById('restrictionEtudiant');
        const selectFiliere = document.getElementById('restrictionFiliere');
        
        if (selectEtudiant) {
            selectEtudiant.innerHTML = '<option value="">⏳ Chargement des étudiants...</option>';
        }
        if (selectFiliere) {
            selectFiliere.innerHTML = '<option value="">⏳ Chargement des filières...</option>';
        }
        
        // Charger les données
        await prepareRestrictionForm();
        
        console.log('✅ Modal restriction prêt');
        
    } catch (error) {
        console.error('❌ Erreur ouverture modal restriction:', error);
        UIHelpers.showError('Erreur lors du chargement des données');
    }
}

// Afficher les dernières inscriptions
function afficherDernieresInscriptions(inscriptions) {
    const tbody = document.getElementById('tableDernieresInscriptions');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (!inscriptions || inscriptions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #999;">Aucune inscription récente</td></tr>';
        return;
    }
    
    inscriptions.forEach(insc => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #f0f0f0';
        
        const dateFormatee = new Date(insc.date_inscription).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const montantFormate = insc.montant ? parseInt(insc.montant).toLocaleString('fr-FR') : '0';
        
        const statutClass = insc.statut_inscription === 'validee' ? '#28a745' : '#ffc107';
        const statutText = insc.statut_inscription === 'validee' ? 'Validée' : 'En attente';
        
        row.innerHTML = `
            <td style="padding: 12px; color: #666; font-size: 13px;">${dateFormatee}</td>
            <td style="padding: 12px;"><strong>${insc.prenom} ${insc.nom}</strong></td>
            <td style="padding: 12px; font-family: monospace;">${insc.matricule || 'N/A'}</td>
            <td style="padding: 12px;">${insc.filiere || 'N/A'}</td>
            <td style="padding: 12px; text-align: center;"><span style="padding: 4px 10px; background: #667eea; color: white; border-radius: 12px; font-size: 12px;">${insc.niveau || 'N/A'}</span></td>
            <td style="padding: 12px; text-align: right; font-weight: 600; color: #28a745;">${montantFormate} FCFA</td>
            <td style="padding: 12px; text-align: center;">
                <span style="padding: 4px 12px; background: ${statutClass}; color: white; border-radius: 15px; font-size: 12px;">
                    ${statutText}
                </span>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// ========== INTÉGRATION DANS LE DASHBOARD ==========

// Modifier la fonction chargerDashboard existante pour inclure les stats inscriptions
const originalChargerDashboard = window.chargerDashboard;

window.chargerDashboard = async function() {
    try {
        console.log('📊 DÉBUT CHARGEMENT DASHBOARD COMPLET');
        
        if (!apiClient || !apiClient.token) {
            console.log('⚠️ Non connecté - redirection');
            navigateTo('connexion');
            return;
        }

        const isAdmin = apiClient.currentUser?.role === 'admin';
        console.log('👤 Type utilisateur:', isAdmin ? 'Admin' : 'User');
        
        showLoader(true);
        
        // Charger les statistiques candidatures (existantes)
        if (typeof originalChargerDashboard === 'function') {
            await originalChargerDashboard();
        }
        
        // ✅ AJOUTER: Charger les statistiques inscriptions
        if (isAdmin) {
            console.log('📝 Chargement stats inscriptions...');
            await chargerStatsInscriptions();
        }
        
        console.log('✅ Dashboard complet chargé');
        
    } catch (error) {
        console.error('❌ Erreur dashboard:', error);
        showMessage('❌ Erreur lors du chargement du tableau de bord: ' + error.message, 'error');
    } finally {
        showLoader(false);
    }
};

// Export des fonctions
window.chargerStatsInscriptions = chargerStatsInscriptions;
window.creerGraphiqueEvolutionInscriptions = creerGraphiqueEvolutionInscriptions;
window.creerGraphiqueFiliereInscriptions = creerGraphiqueFiliereInscriptions;
window.creerGraphiqueNiveauInscriptions = creerGraphiqueNiveauInscriptions;
window.creerGraphiqueGenreInscriptions = creerGraphiqueGenreInscriptions;
window.creerGraphiquePaiementInscriptions = creerGraphiquePaiementInscriptions;
window.afficherDernieresInscriptions = afficherDernieresInscriptions;

console.log('✅ Module statistiques inscriptions chargé');
