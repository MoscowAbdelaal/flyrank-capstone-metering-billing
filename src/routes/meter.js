const express = require('express');
const { recordUsage, checkQuota, getCurrentUsage, getUsageHistory } = require('../services/usageService');

const router = express.Router();

// POST /meter - Record a billable action
router.post('/', async (req, res) => {
    try {
        const { tenantId, eventType, quantity = 1, metadata = {} } = req.body;
        const idempotencyKey = req.headers['idempotency-key'];

        // Validate required fields
        if (!tenantId) {
            return res.status(400).json({
                error: 'Missing required field: tenantId'
            });
        }

        if (!eventType) {
            return res.status(400).json({
                error: 'Missing required field: eventType'
            });
        }

        // Check quota first
        const quota = await checkQuota(tenantId, eventType, quantity);
        if (!quota.allowed) {
            return res.status(429).json({
                error: 'Quota exceeded',
                message: quota.message,
                used: quota.used,
                limit: quota.limit,
                remaining: quota.remaining
            });
        }

        // Record usage
        const usage = await recordUsage({
            tenantId,
            eventType,
            quantity,
            idempotencyKey,
            metadata
        });

        // Get updated usage
        const currentUsage = await getCurrentUsage(tenantId);

        res.status(201).json({
            success: true,
            usage,
            current: currentUsage,
            remaining: {
                api_calls: quota.limit - currentUsage.api_calls,
                ai_tokens: quota.limit - currentUsage.ai_tokens
            }
        });

    } catch (error) {
        console.error('Error recording usage:', error);
        res.status(500).json({
            error: 'Failed to record usage',
            details: error.message
        });
    }
});

// GET /meter/usage/:tenantId - Get current usage
router.get('/usage/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const usage = await getCurrentUsage(tenantId);
        res.json(usage);
    } catch (error) {
        console.error('Error getting usage:', error);
        res.status(500).json({
            error: 'Failed to get usage',
            details: error.message
        });
    }
});

// GET /meter/history/:tenantId - Get usage history
router.get('/history/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const limit = parseInt(req.query.limit) || 30;
        const history = await getUsageHistory(tenantId, limit);
        res.json({ history });
    } catch (error) {
        console.error('Error getting history:', error);
        res.status(500).json({
            error: 'Failed to get history',
            details: error.message
        });
    }
});

module.exports = router;
