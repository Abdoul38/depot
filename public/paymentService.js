// paymentService.js - Version avec mode simulation
const axios = require('axios');
const crypto = require('crypto');

class PaymentService {
  constructor() {
    // Mode simulation pour développement
    this.simulationMode = process.env.PAYMENT_SIMULATION === 'false';
    
    this.numerosMarchands = {
      airtel: '+227 96 01 90 07',
      moov: '+227 94 11 82 84',
      orange: '+227 91 91 26 29'
    };

    this.config = {
      airtel: {
        apiUrl: process.env.AIRTEL_API_URL || 'https://api.airtel.ne/v1',
        merchantId: process.env.AIRTEL_MERCHANT_ID,
        secretKey: process.env.AIRTEL_SECRET_KEY,
        enabled: process.env.AIRTEL_ENABLED === 'true'
      },
      moov: {
        apiUrl: process.env.MOOV_API_URL || 'https://api.moov.ne/v1',
        merchantId: process.env.MOOV_MERCHANT_ID,
        secretKey: process.env.MOOV_SECRET_KEY,
        enabled: process.env.MOOV_ENABLED === 'true'
      },
      orange: {
        apiUrl: process.env.ORANGE_API_URL || 'https://api.orange.ne/v1',
        merchantId: process.env.ORANGE_MERCHANT_ID,
        secretKey: process.env.ORANGE_SECRET_KEY,
        enabled: process.env.ORANGE_ENABLED === 'true'
      }
    };

    console.log('💳 Service Paiement initialisé');
    console.log('Mode simulation:', this.simulationMode);
    console.log('Opérateurs activés:', this.getOperateursDisponibles());
  }

  getInfosPaiement(operateur) {
    return {
      numero: this.numerosMarchands[operateur] || 'Non configuré',
      nom: 'Université Djibo Hamani',
      reference: 'UDH-INSCRIPTION'
    };
  }

  /**
   * Initier un paiement mobile
   */
  async initierPaiement(params) {
    const {
      operateur,
      telephone,
      montant,
      inscription_id,
      etudiant_nom,
      etudiant_prenom
    } = params;

    // Validation
    if (!this.isOperateurDisponible(operateur)) {
      throw new Error(`Opérateur ${operateur} non disponible ou non configuré`);
    }

    // Générer un ID de transaction unique
    const transactionId = this.genererTransactionId(inscription_id);

    // Préparer les données de paiement
    const paymentData = {
      transactionId,
      telephone: this.normaliserTelephone(telephone),
      montant,
      description: `Inscription ${etudiant_prenom} ${etudiant_nom}`,
      reference: `INS-${inscription_id}`,
      callbackUrl: `${process.env.BASE_URL}/api/payment/callback`
    };

    try {
      let result;
      
      // MODE SIMULATION
      if (this.simulationMode) {
        console.log('⚠️ MODE SIMULATION - Paiement simulé');
        result = await this.simulerPaiement(paymentData, operateur);
      } else {
        // MODE PRODUCTION
        switch(operateur) {
          case 'airtel':
            result = await this.initierAirtelMoney(paymentData);
            break;
          case 'moov':
            result = await this.initierMoovFlooz(paymentData);
            break;
          case 'orange':
            result = await this.initierOrangeMoney(paymentData);
            break;
          default:
            throw new Error('Opérateur non supporté');
        }
      }

      return {
        success: true,
        transactionId,
        operateur,
        statut: result.statut,
        message: result.message,
        data: result.data
      };

    } catch (error) {
      console.error(`Erreur paiement ${operateur}:`, error);
      return {
        success: false,
        error: error.message,
        transactionId
      };
    }
  }

  /**
   * SIMULATION - Pour tests sans vraies APIs
   */
  /**
 * SIMULATION - Pour tests sans vraies APIs
 */
async simulerPaiement(paymentData, operateur) {
  console.log(`🎭 Simulation paiement ${operateur}:`, paymentData);
  
  // Simuler un délai réseau
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Simuler un succès aléatoire (90% de succès)
  const success = Math.random() > 0.1;
  
  if (success) {
    return {
      statut: 'en-cours',  // ✅ CORRECTION ICI
      message: `Paiement ${operateur} initié (SIMULATION)`,
      data: {
        transaction_id: paymentData.transactionId,
        status: 'PENDING',
        message: 'En attente de validation utilisateur',
        simulation: true
      }
    };
  } else {
    throw new Error(`Échec simulation paiement ${operateur}`);
  }
}

/**
 * SIMULATION - Vérifier statut
 */
async simulerVerificationStatut(transactionId) {
  console.log('🎭 Simulation vérification statut:', transactionId);
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 80% de succès
  const success = Math.random() > 0.2;
  
  return {
    success: true,
    statut: success ? 'SUCCESS' : 'PENDING',  // Laissez comme ça
    data: {
      transaction_id: transactionId,
      status: success ? 'SUCCESS' : 'PENDING',
      message: success ? 'Paiement validé (SIMULATION)' : 'En attente',
      simulation: true
    }
  };
}
  /**
   * Airtel Money
   */
  async initierAirtelMoney(paymentData) {
    const config = this.config.airtel;
    
    const payload = {
      merchant_id: config.merchantId,
      transaction_id: paymentData.transactionId,
      msisdn: paymentData.telephone,
      amount: paymentData.montant,
      currency: 'XOF',
      description: paymentData.description,
      callback_url: paymentData.callbackUrl
    };

    const signature = this.genererSignature(payload, config.secretKey);

    const response = await axios.post(
      `${config.apiUrl}/merchant/payment/initiate`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signature,
          'Authorization': `Bearer ${config.merchantId}`
        }
      }
    );

    return {
      statut: response.data.status,
      message: response.data.message,
      data: response.data
    };
  }

  /**
   * Moov Flooz
   */
  async initierMoovFlooz(paymentData) {
    const config = this.config.moov;
    
    const payload = {
      partner_id: config.merchantId,
      transaction_ref: paymentData.transactionId,
      phone_number: paymentData.telephone,
      amount: paymentData.montant,
      currency: 'XOF',
      description: paymentData.description,
      return_url: paymentData.callbackUrl
    };

    const token = this.genererTokenMoov(payload, config.secretKey);

    const response = await axios.post(
      `${config.apiUrl}/payment/request`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': token
        }
      }
    );

    return {
      statut: response.data.status,
      message: response.data.message,
      data: response.data
    };
  }

  /**
   * Orange Money
   */
  async initierOrangeMoney(paymentData) {
    const config = this.config.orange;
    
    const tokenResponse = await axios.post(
      `${config.apiUrl}/oauth/token`,
      { grant_type: 'client_credentials' },
      {
        auth: {
          username: config.merchantId,
          password: config.secretKey
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    const payload = {
      merchant_key: config.merchantId,
      order_id: paymentData.transactionId,
      amount: paymentData.montant,
      currency: 'XOF',
      customer_msisdn: paymentData.telephone,
      description: paymentData.description,
      notif_url: paymentData.callbackUrl,
      return_url: paymentData.callbackUrl
    };

    const response = await axios.post(
      `${config.apiUrl}/webpayment/payment`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      statut: response.data.status,
      message: response.data.message,
      data: response.data
    };
  }

  /**
   * Vérifier le statut d'une transaction
   */
  async verifierStatut(transactionId, operateur) {
    if (this.simulationMode) {
      return this.simulerVerificationStatut(transactionId);
    }

    const config = this.config[operateur];
    
    if (!config || !config.enabled) {
      throw new Error('Opérateur non disponible');
    }

    try {
      let response;
      
      switch(operateur) {
        case 'airtel':
          response = await axios.get(
            `${config.apiUrl}/merchant/payment/status/${transactionId}`,
            {
              headers: {
                'Authorization': `Bearer ${config.merchantId}`
              }
            }
          );
          break;
          
        case 'moov':
          response = await axios.get(
            `${config.apiUrl}/payment/status/${transactionId}`,
            {
              headers: {
                'X-Auth-Token': this.genererTokenMoov({ transaction_ref: transactionId }, config.secretKey)
              }
            }
          );
          break;
          
        case 'orange':
          const token = await this.getOrangeToken(operateur);
          response = await axios.get(
            `${config.apiUrl}/webpayment/transaction/${transactionId}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );
          break;
      }

      return {
        success: true,
        statut: response.data.status,
        data: response.data
      };

    } catch (error) {
      console.error('Erreur vérification statut:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * SIMULATION - Vérifier statut
   */
  async simulerVerificationStatut(transactionId) {
    console.log('🎭 Simulation vérification statut:', transactionId);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 80% de succès
    const success = Math.random() > 0.2;
    
    return {
      success: true,
      statut: success ? 'SUCCESS' : 'PENDING',
      data: {
        transaction_id: transactionId,
        status: success ? 'SUCCESS' : 'PENDING',
        message: success ? 'Paiement validé (SIMULATION)' : 'En attente',
        simulation: true
      }
    };
  }

  /**
   * Utilitaires
   */
  genererTransactionId(inscriptionId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `UDH-${inscriptionId}-${timestamp}-${random}`;
  }

  normaliserTelephone(telephone) {
    let tel = telephone.replace(/\s+/g, '');
    
    if (tel.startsWith('00227')) {
      tel = '+' + tel.substring(2);
    } else if (tel.startsWith('227')) {
      tel = '+' + tel;
    } else if (!tel.startsWith('+227')) {
      tel = '+227' + tel;
    }
    
    return tel;
  }

  genererSignature(data, secretKey) {
    const dataString = JSON.stringify(data);
    return crypto
      .createHmac('sha256', secretKey)
      .update(dataString)
      .digest('hex');
  }

  genererTokenMoov(data, secretKey) {
    const timestamp = Date.now();
    const payload = { ...data, timestamp };
    return this.genererSignature(payload, secretKey);
  }

  async getOrangeToken(operateur) {
    const config = this.config.orange;
    
    const response = await axios.post(
      `${config.apiUrl}/oauth/token`,
      { grant_type: 'client_credentials' },
      {
        auth: {
          username: config.merchantId,
          password: config.secretKey
        }
      }
    );
    
    return response.data.access_token;
  }

  isOperateurDisponible(operateur) {
    return this.config[operateur] && this.config[operateur].enabled;
  }

  getOperateursDisponibles() {
    return Object.keys(this.config).filter(op => this.config[op].enabled);
  }
}

module.exports = new PaymentService();