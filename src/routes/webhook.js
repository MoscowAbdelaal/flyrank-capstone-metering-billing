const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { verifyWebhookSignature, handleWebhookEvent } = require('../services/stripeService');
const { query } = require('../config/database');

const router = express.Router();

/**
 * POST /webhook/stripe
 * Stripe webhook endpoint
 */
router.post('/stripe', async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // Verify webhook signature
    if (!signature) {
        console.error('❌ Missing stripe-signature header');
        return res.status(400).json({ error: 'Missing signature' });
    }

    if (!webhookSecret) {
        console.error('❌ STRIPE_WEBHOOK_SECRET not configured');
        return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    try {
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
            details: error.message
        });
    }
});

module.exports = router;