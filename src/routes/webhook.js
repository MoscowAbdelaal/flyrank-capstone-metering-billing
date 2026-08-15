const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { verifyWebhookSignature, handleWebhookEvent, IS_MOCK } = require('../services/stripeService');
const { query } = require('../config/database');

const router = express.Router();

/**
 * POST /webhook/stripe
 * Real Stripe webhook endpoint
 */
router.post('/stripe', async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    console.log('📨 Webhook received');
    console.log(`  Signature: ${signature ? signature.substring(0, 20) + '...' : 'missing'}`);
    console.log(`  Body length: ${req.rawBody ? req.rawBody.length : 0} bytes`);

    // In mock mode, accept any request
    if (IS_MOCK) {
        console.log('🎭 [MOCK] Stripe webhook endpoint called');
        return res.status(200).json({
            received: true,
            mock: true,
            message: 'Mock mode - webhook received',
        });
    }

    // Real Stripe webhook processing
    try {
        if (!signature) {
            console.error('❌ Missing stripe-signature header');
            return res.status(400).json({ error: 'Missing signature' });
        }

        if (!webhookSecret) {
            console.error('❌ STRIPE_WEBHOOK_SECRET not configured');
            return res.status(500).json({ error: 'Webhook secret not configured' });
        }

        if (!req.rawBody || req.rawBody.length === 0) {
            console.error('❌ Empty webhook payload');
            return res.status(400).json({ error: 'Empty payload' });
        }

        // Verify the webhook signature
        const event = verifyWebhookSignature(req.rawBody, signature, webhookSecret);

        // Check for duplicate webhook event (idempotency)
        const existingEvent = await query(
            'SELECT * FROM webhook_events WHERE stripe_event_id = $1',
            [event.id]
        );

        if (existingEvent.rows.length > 0) {
            console.log(`🔄 Duplicate webhook event: ${event.id} (${event.type})`);
            return res.status(200).json({
                received: true,
                duplicate: true,
                message: 'Duplicate webhook ignored'
            });
        }

        // Store the webhook event
        const eventId = uuidv4();
        await query(
            `INSERT INTO webhook_events (id, stripe_event_id, event_type, processed)
             VALUES ($1, $2, $3, $4)`,
            [eventId, event.id, event.type, true]
        );

        // Process the webhook event
        await handleWebhookEvent(event);

        console.log(`✅ Webhook processed: ${event.id} (${event.type})`);

        res.status(200).json({
            received: true,
            eventId: event.id,
            type: event.type,
            processed: true,
        });

    } catch (error) {
        console.error('❌ Webhook error:', error.message);
        res.status(400).json({
            error: 'Webhook verification failed',
            details: error.message,
        });
    }
});

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

        const tenantResult = await query('SELECT plan_id, name FROM tenants WHERE id = $1', [tenantId]);
        if (tenantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        const currentPlan = tenantResult.rows[0].plan_id;

        if (currentPlan === planId) {
            return res.status(400).json({
                success: false,
                error: `Tenant already on plan: ${planId}`,
                currentPlan,
            });
        }

        console.log(`🎭 [MOCK] Webhook: Tenant ${tenantId} upgrading from ${currentPlan} to ${planId}`);

        const eventId = `evt_mock_${uuidv4().slice(0, 8)}`;

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

        const id = uuidv4();
        await query(
            `INSERT INTO webhook_events (id, stripe_event_id, event_type, processed)
             VALUES ($1, $2, $3, $4)`,
            [id, eventId, 'checkout.session.completed', true]
        );

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
            message: `Tenant ${tenantId} upgraded to ${planId}`,
        });

    } catch (error) {
        console.error('Mock webhook error:', error);
        res.status(500).json({
            error: 'Mock webhook failed',
            details: error.message,
        });
    }
});

module.exports = router;
