const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { handleWebhookEvent, IS_MOCK } = require('../services/stripeService');
const { query } = require('../config/database');

const router = express.Router();

/**
 * POST /webhook/mock
 * Mock webhook endpoint for testing without Stripe
 */
router.post('/mock', async (req, res) => {
    try {
        const { tenantId, planId = 'plan-pro' } = req.body;

        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId is required' });
        }

        // Check if tenant exists
        const tenantResult = await query('SELECT plan_id, name FROM tenants WHERE id = $1', [tenantId]);
        if (tenantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        const currentPlan = tenantResult.rows[0].plan_id;

        // Check if already on this plan
        if (currentPlan === planId) {
            return res.status(400).json({
                success: false,
                error: `Tenant already on plan: ${planId}`,
                currentPlan,
            });
        }

        console.log(`🎭 [MOCK] Webhook: Tenant ${tenantId} upgrading from ${currentPlan} to ${planId}`);

        // Create a mock event
        const eventId = `evt_mock_${uuidv4().slice(0, 8)}`;

        // Check for duplicate webhook event
        const existing = await query(
            'SELECT * FROM webhook_events WHERE stripe_event_id = $1',
            [eventId]
        );

        if (existing.rows.length > 0) {
            return res.status(200).json({
                success: true,
                duplicate: true,
                message: 'Duplicate webhook ignored',
            });
        }

        // Store the webhook event
        const id = uuidv4();
        await query(
            `INSERT INTO webhook_events (id, stripe_event_id, event_type, processed)
             VALUES ($1, $2, $3, $4)`,
            [id, eventId, 'checkout.session.completed', true]
        );

        // Update tenant plan
        const result = await query(
            `UPDATE tenants 
             SET plan_id = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING id, name, plan_id`,
            [planId, tenantId]
        );

        res.json({
            success: true,
            eventId,
            type: 'checkout.session.completed',
            tenantId,
            planId,
            tenant: result.rows[0],
            message: `Tenant ${tenantId} upgraded to ${planId} (mock)`,
        });

    } catch (error) {
        console.error('Mock webhook error:', error);
        res.status(500).json({
            error: 'Mock webhook failed',
            details: error.message,
        });
    }
});

/**
 * POST /webhook/stripe
 * Real Stripe webhook endpoint (falls back to mock in dev)
 */
router.post('/stripe', async (req, res) => {
    // In mock mode, return a success response
    if (IS_MOCK) {
        console.log('🎭 [MOCK] Stripe webhook endpoint called (mock mode)');
        return res.status(200).json({
            received: true,
            mock: true,
            message: 'Mock mode - webhook received',
        });
    }

    // Real Stripe webhook logic (not used in mock mode)
    try {
        const signature = req.headers['stripe-signature'];
        if (!signature) {
            return res.status(400).json({ error: 'Missing signature' });
        }

        // This would use the real Stripe SDK
        const { verifyWebhookSignature } = require('../services/stripeService');
        const event = verifyWebhookSignature(req.rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
        await handleWebhookEvent(event);

        res.json({ received: true, eventId: event.id });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
