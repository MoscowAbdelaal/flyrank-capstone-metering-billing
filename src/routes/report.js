const express = require('express');
const { getUsageReport, calculateMonthlyCost, calculateTokenCost } = require('../services/costService');

const router = express.Router();

/**
 * GET /report/usage/:tenantId
 * Get detailed usage report for a tenant
 */
router.get('/usage/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const report = await getUsageReport(tenantId, limit);

        if (!report.tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        res.json(report);

    } catch (error) {
        console.error('Error generating usage report:', error);
        res.status(500).json({
            error: 'Failed to generate usage report',
            details: error.message,
        });
    }
});

/**
 * GET /report/cost/:tenantId
 * Get cost breakdown for a tenant
 */
router.get('/cost/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const cost = await calculateMonthlyCost(tenantId);

        if (!cost) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        res.json(cost);

    } catch (error) {
        console.error('Error calculating cost:', error);
        res.status(500).json({
            error: 'Failed to calculate cost',
            details: error.message,
        });
    }
});

/**
 * POST /report/token-cost
 * Calculate token cost with AI pricing rules
 */
router.post('/token-cost', (req, res) => {
    try {
        const { input, cachedInput, output, reasoning } = req.body;

        if (input === undefined && cachedInput === undefined && output === undefined && reasoning === undefined) {
            return res.status(400).json({
                error: 'At least one token type is required',
                usage: 'POST /report/token-cost with { input, cachedInput, output, reasoning }',
            });
        }

        const result = calculateTokenCost({ input, cachedInput, output, reasoning });

        res.json(result);

    } catch (error) {
        console.error('Error calculating token cost:', error);
        res.status(500).json({
            error: 'Failed to calculate token cost',
            details: error.message,
        });
    }
});

module.exports = router;
