const axios = require('axios');

class PaymentService {
    constructor() {
        this.operators = {
            'moov': {
                name: 'Moov Money',
                numero: process.env.MOOV_MERCHANT_NUMBER || '+227 90 00 00 00',
                api_url: process.env.MOOV_API_URL,
                api_key: process.env.MOOV_API_KEY
            },
            'airtel': {
                name: 'Airtel Money',
                numero: process.env.AIRTEL_MERCHANT_NUMBER || '+227 96 01 90 07',
                api_url: process.env.AIRTEL_API_URL,
                api_key: process.env.AIRTEL_API_KEY
            },
            'orange': {
                name: 'Orange Money',
                numero: process.env.ORANGE_MERCHANT_NUMBER || '+227 92 00 00 00',
                api_url: process.env.ORANGE_API_URL,
                api_key: process.env.ORANGE_API_KEY
            },
            'zamani': {
                name: 'Zamani Money',
                numero: process.env.ZAMANI_MERCHANT_NUMBER || '+227 93 00 00 00',
                api_url: process.env.ZAMANI_API_URL,
                api_key: process.env.ZAMANI_API_KEY
            }
        };
    }

    // Obtenir les infos d'un opérateur
    getInfosPaiement(operateur) {
        const op = this.operators[operateur.toLowerCase()];
        if (!op) {
            throw new Error('Opérateur non supporté');
        }
        return {
            name: op.name,
            numero: op.numero
        };
    }

    // Générer un ID de transaction unique
    generateTransactionId() {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000);
        return `UDH${timestamp}${random}`;
    }

    // Initier un paiement
    async initierPaiement(data) {
        try {
            const { operateur, telephone, montant, etudiant_id, etudiant_nom, etudiant_prenom } = data;
            
            const op = this.operators[operateur.toLowerCase()];
            if (!op) {
                return {
                    success: false,
                    error: 'Opérateur non supporté'
                };
            }

            const transactionId = this.generateTransactionId();
            
            // MODE SIMULATION pour développement
            if (process.env.PAYMENT_MODE === 'simulation') {
                console.log('MODE SIMULATION - Paiement simulé');
                return {
                    success: true,
                    transactionId: transactionId,
                    statut: 'en-cours',
                    message: `Paiement simulé pour ${operateur}`,
                    data: {
                        operator: operateur,
                        amount: montant,
                        phone: telephone,
                        simulation: true
                    }
                };
            }

            // MODE PRODUCTION - Appel API réel
            if (op.api_url && op.api_key) {
                try {
                    const response = await axios.post(
                        `${op.api_url}/initiate`,
                        {
                            transaction_id: transactionId,
                            amount: montant,
                            phone: telephone,
                            customer_name: `${etudiant_prenom} ${etudiant_nom}`,
                            description: 'Frais inscription université'
                        },
                        {
                            headers: {
                                'Authorization': `Bearer ${op.api_key}`,
                                'Content-Type': 'application/json'
                            },
                            timeout: 30000
                        }
                    );

                    return {
                        success: true,
                        transactionId: transactionId,
                        statut: response.data.status || 'en-cours',
                        message: response.data.message || 'Paiement initié',
                        data: response.data
                    };
                } catch (apiError) {
                    console.error(`Erreur API ${operateur}:`, apiError.message);
                    
                    return {
                        success: false,
                        error: 'Erreur de communication avec l\'opérateur',
                        details: apiError.message
                    };
                }
            }

            // Fallback si pas d'API configurée
            return {
                success: true,
                transactionId: transactionId,
                statut: 'en-attente',
                message: `Veuillez composer le code USSD pour valider le paiement de ${montant} FCFA`,
                data: {
                    operator: operateur,
                    merchant_number: op.numero
                }
            };

        } catch (error) {
            console.error('Erreur initiation paiement:', error);
            return {
                success: false,
                error: 'Erreur lors de l\'initiation du paiement',
                details: error.message
            };
        }
    }

    // Vérifier le statut d'un paiement
    async verifierStatut(transactionId, operateur) {
        try {
            const op = this.operators[operateur.toLowerCase()];
            if (!op) {
                return {
                    success: false,
                    error: 'Opérateur non supporté'
                };
            }

            // MODE SIMULATION
            if (process.env.PAYMENT_MODE === 'simulation') {
                // Simuler des statuts aléatoires pour test
                const statuts = ['PENDING', 'SUCCESS', 'FAILED'];
                const randomStatut = statuts[Math.floor(Math.random() * statuts.length)];
                
                return {
                    success: true,
                    statut: randomStatut,
                    data: {
                        transaction_id: transactionId,
                        status: randomStatut,
                        simulation: true
                    }
                };
            }

            // MODE PRODUCTION
            if (op.api_url && op.api_key) {
                const response = await axios.get(
                    `${op.api_url}/status/${transactionId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${op.api_key}`
                        },
                        timeout: 15000
                    }
                );

                return {
                    success: true,
                    statut: response.data.status,
                    data: response.data
                };
            }

            // Fallback
            return {
                success: true,
                statut: 'PENDING',
                data: { message: 'Vérification manuelle requise' }
            };

        } catch (error) {
            console.error('Erreur vérification statut:', error);
            return {
                success: false,
                error: 'Erreur lors de la vérification du statut',
                details: error.message
            };
        }
    }

    // Annuler un paiement
    async annulerPaiement(transactionId, operateur) {
        try {
            const op = this.operators[operateur.toLowerCase()];
            if (!op) {
                return {
                    success: false,
                    error: 'Opérateur non supporté'
                };
            }

            if (op.api_url && op.api_key) {
                const response = await axios.post(
                    `${op.api_url}/cancel/${transactionId}`,
                    {},
                    {
                        headers: {
                            'Authorization': `Bearer ${op.api_key}`
                        }
                    }
                );

                return {
                    success: true,
                    message: 'Paiement annulé',
                    data: response.data
                };
            }

            return {
                success: true,
                message: 'Annulation enregistrée'
            };

        } catch (error) {
            console.error('Erreur annulation paiement:', error);
            return {
                success: false,
                error: 'Erreur lors de l\'annulation'
            };
        }
    }
}

module.exports = new PaymentService();