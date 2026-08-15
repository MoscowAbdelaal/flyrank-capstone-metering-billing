const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { getTenantWithPlan } = require('./tenantService');

// Pricing constants (in cents)
const PRICING = {
    api_call: 1, // $0.01 per API call
    ai_input_token: 0.001, // $0.00001 per input token
    ai_cached_input_token: 0.0005, // $0.000005 per cached input token
    ai_output_token: 0.002, // $0.00002 per output token
    ai_reasoning_token: 0.003, // $0.00003 per reasoning token
};

async function recordUsage({ tenantId, eventType, quantity, idempotencyKey, metadata = {} }) {
    // Check idempotency - prevent double counting
    if (idempotencyKey) {
        const existing = await query(
            'SELECT * FROM usage_events WHERE idempotency_key = $1',
            [idempotencyKey]
        );
        if (existing.rows.length > 0) {
            console.log(`🔄 Idempotency hit: ${idempotencyKey}`);
            return existing.rows[0];
        }
    }

    // Get tenant with plan
    const tenant = await getTenantWithPlan(tenantId);
    if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Calculate cost based on event type
    let cost = 0;
    let effectiveQuantity = quantity;

    switch (eventType) {
        case 'api_call':
            cost = quantity * PRICING.api_call;
            break;
        case 'ai_input_token':
            cost = quantity * PRICING.ai_input_token;
            break;
        case 'ai_cached_input_token':
            cost = quantity * PRICING.ai_cached_input_token;
            break;
        case 'ai_output_token':
            cost = quantity * PRICING.ai_output_token;
            break;
        case 'ai_reasoning_token':
            cost = quantity * PRICING.ai_reasoning_token;
            break;
        case 'mixed_tokens':
            // For mixed tokens, metadata contains breakdown
            const { input, cachedInput, output, reasoning } = metadata;
            cost = (input || 0) * PRICING.ai_input_token +
                   (cachedInput || 0) * PRICING.ai_cached_input_token +
                   (output || 0) * PRICING.ai_output_token +
                   (reasoning || 0) * PRICING.ai_reasoning_token;
            break;
        default:
            throw new Error(`Unknown event type: ${eventType}`);
    }

    // Round to 6 decimal places
    cost = Math.round(cost * 1000000) / 1000000;

    // Insert usage event
    const id = uuidv4();
    const result = await query(
        `INSERT INTO usage_events (id, tenant_id, event_type, quantity, idempotency_key, cost)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, tenantId, eventType, effectiveQuantity, idempotencyKey || null, cost]
    );

    return result.rows[0];
}

async function checkQuota(tenantId, eventType, requestedQuantity = 1) {
    const tenant = await getTenantWithPlan(tenantId);
    if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Get current usage for this tenant
    const usage = await getCurrentUsage(tenantId);

    // Check API calls limit
    if (eventType === 'api_call') {
        const used = usage.api_calls || 0;
        const limit = tenant.api_calls_limit || 1000;
        if (used + requestedQuantity > limit) {
            return {
                allowed: false,
                used,
                limit,
                remaining: limit - used,
                exceeded: true,
                message: `API call limit exceeded. Used ${used}/${limit}`
            };
        }
        return {
            allowed: true,
            used,
            limit,
            remaining: limit - used,
            exceeded: false
        };
    }

    // Check AI tokens limit
    if (['ai_input_token', 'ai_cached_input_token', 'ai_output_token', 'ai_reasoning_token', 'mixed_tokens'].includes(eventType)) {
        const used = usage.ai_tokens || 0;
        const limit = tenant.ai_tokens_limit || 100000;
        if (used + requestedQuantity > limit) {
            return {
                allowed: false,
                used,
                limit,
                remaining: limit - used,
                exceeded: true,
                message: `AI token limit exceeded. Used ${used}/${limit} tokens`
            };
        }
        return {
            allowed: true,
            used,
            limit,
            remaining: limit - used,
            exceeded: false
        };
    }

    return { allowed: true, used: 0, limit: 0, remaining: 0, exceeded: false };
}

async function getCurrentUsage(tenantId) {
    const result = await query(
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
    );

    return {
        api_calls: parseInt(result.rows[0].api_calls) || 0,
        ai_tokens: parseInt(result.rows[0].ai_tokens) || 0,
        total_cost: parseFloat(result.rows[0].total_cost) || 0
    };
}

async function getUsageHistory(tenantId, limit = 30) {
    const result = await query(
        `SELECT * FROM usage_events 
         WHERE tenant_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [tenantId, limit]
    );
    return result.rows;
}

module.exports = {
    recordUsage,
    checkQuota,
    getCurrentUsage,
    getUsageHistory,
    PRICING
};
