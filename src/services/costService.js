const { query } = require('../config/database');
const { PRICING } = require('./usageService');

/**
 * Calculate total cost for a tenant for the current month
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} - Cost breakdown
 */
async function calculateMonthlyCost(tenantId) {
    const result = await query(
        `SELECT 
            event_type,
            SUM(quantity) as total_quantity,
            SUM(cost) as total_cost
         FROM usage_events
         WHERE tenant_id = $1
         AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
         GROUP BY event_type`,
        [tenantId]
    );

    const breakdown = {};
    let totalCost = 0;

    for (const row of result.rows) {
        breakdown[row.event_type] = {
            quantity: parseInt(row.total_quantity),
            cost: parseFloat(row.total_cost),
        };
        totalCost += parseFloat(row.total_cost);
    }

    return {
        tenantId,
        period: {
            start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
            end: new Date().toISOString(),
        },
        breakdown,
        total_cost: totalCost,
        formatted: `$${totalCost.toFixed(6)}`,
    };
}

/**
 * Calculate AI token cost with proper pricing rules
 * @param {Object} tokenUsage - Token usage breakdown
 * @param {number} tokenUsage.input - Input tokens
 * @param {number} tokenUsage.cachedInput - Cached input tokens
 * @param {number} tokenUsage.output - Output tokens
 * @param {number} tokenUsage.reasoning - Reasoning tokens
 * @returns {Object} - Cost breakdown
 */
function calculateTokenCost({ input = 0, cachedInput = 0, output = 0, reasoning = 0 }) {
    const inputCost = input * PRICING.ai_input_token;
    const cachedInputCost = cachedInput * PRICING.ai_cached_input_token;
    const outputCost = output * PRICING.ai_output_token;
    const reasoningCost = reasoning * PRICING.ai_reasoning_token;

    return {
        input: {
            tokens: input,
            cost: inputCost,
            rate: PRICING.ai_input_token,
        },
        cachedInput: {
            tokens: cachedInput,
            cost: cachedInputCost,
            rate: PRICING.ai_cached_input_token,
        },
        output: {
            tokens: output,
            cost: outputCost,
            rate: PRICING.ai_output_token,
        },
        reasoning: {
            tokens: reasoning,
            cost: reasoningCost,
            rate: PRICING.ai_reasoning_token,
        },
        total: {
            tokens: input + cachedInput + output + reasoning,
            cost: inputCost + cachedInputCost + outputCost + reasoningCost,
        },
    };
}

/**
 * Get detailed usage report for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Number of records to return
 * @returns {Promise<Object>} - Usage report
 */
async function getUsageReport(tenantId, limit = 50) {
    const [tenant, usage, events, monthlyCost] = await Promise.all([
        query('SELECT id, name, plan_id FROM tenants WHERE id = $1', [tenantId]),
        query(
            `SELECT 
                SUM(CASE WHEN event_type = 'api_call' THEN quantity ELSE 0 END) as api_calls,
                SUM(CASE 
                    WHEN event_type IN ('ai_input_token', 'ai_cached_input_token', 'ai_output_token', 'ai_reasoning_token', 'mixed_tokens') 
                    THEN quantity 
                    ELSE 0 
                END) as ai_tokens,
                SUM(cost) as total_cost
             FROM usage_events
             WHERE tenant_id = $1
             AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
            [tenantId]
        ),
        query(
            `SELECT * FROM usage_events 
             WHERE tenant_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2`,
            [tenantId, limit]
        ),
        calculateMonthlyCost(tenantId),
    ]);

    // Get plan details
    const planResult = await query(
        'SELECT * FROM plans WHERE id = $1',
        [tenant.rows[0]?.plan_id || 'plan-free']
    );
    const plan = planResult.rows[0] || { api_calls_limit: 1000, ai_tokens_limit: 100000 };

    const usageData = usage.rows[0] || { api_calls: 0, ai_tokens: 0, total_cost: 0 };

    return {
        tenant: tenant.rows[0] || null,
        plan: {
            name: plan.name,
            api_calls_limit: plan.api_calls_limit,
            ai_tokens_limit: plan.ai_tokens_limit,
        },
        current_period: {
            start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
            end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString(),
        },
        usage: {
            api_calls: parseInt(usageData.api_calls) || 0,
            api_calls_limit: plan.api_calls_limit,
            api_calls_remaining: Math.max(0, plan.api_calls_limit - (parseInt(usageData.api_calls) || 0)),
            ai_tokens: parseInt(usageData.ai_tokens) || 0,
            ai_tokens_limit: plan.ai_tokens_limit,
            ai_tokens_remaining: Math.max(0, plan.ai_tokens_limit - (parseInt(usageData.ai_tokens) || 0)),
            total_cost: parseFloat(usageData.total_cost) || 0,
            formatted_cost: `$${(parseFloat(usageData.total_cost) || 0).toFixed(6)}`,
        },
        breakdown: monthlyCost.breakdown,
        recent_events: events.rows,
    };
}

module.exports = {
    calculateMonthlyCost,
    calculateTokenCost,
    getUsageReport,
};
