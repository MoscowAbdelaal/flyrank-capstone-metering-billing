const express = require('express');
const { createCheckoutSession, createPortalSession } = require('../services/stripeService');
const { getTenant } = require('../services/tenantService');

const router = express.Router();

/**
 * POST /checkout/create
 * Create a Stripe Checkout session
 */
router.post('/create', async (req, res) => {
    try {
        const { tenantId, planId = 'plan-pro', successUrl, cancelUrl } = req.body;

        // Validate required fields
        if (!tenantId) {
            return res.status(400).json({
                error: 'Missing required field: tenantId'
            });
        }

        // Check if tenant exists
        const tenant = await getTenant(tenantId);
        if (!tenant) {
            return res.status(404).json({
                error: `Tenant not found: ${tenantId}`
            });
        }

        // Check if tenant is already on the requested plan
        if (tenant.plan_id === planId) {
            return res.status(400).json({
                error: `Tenant is already on the ${planId} plan`
            });
        }

        // Create checkout session
        const result = await createCheckoutSession(
            tenantId,
            successUrl || `${req.protocol}://${req.get('host')}/checkout/success`,
            cancelUrl || `${req.protocol}://${req.get('host')}/checkout/cancel`,
            planId
        );

        res.json({
            success: true,
            sessionId: result.sessionId,
            url: result.url,
            customerId: result.customerId,
        });

    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({
            error: 'Failed to create checkout session',
            details: error.message
        });
    }
});

/**
 * GET /checkout/success
 * Checkout success page (redirect)
 */
router.get('/success', (req, res) => {
    res.json({
        message: '🎉 Checkout successful! Your subscription has been upgraded.',
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /checkout/cancel
 * Checkout cancel page (redirect)
 */
router.get('/cancel', (req, res) => {
    res.json({
        message: 'Checkout cancelled. You can try again anytime.',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
