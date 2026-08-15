const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

async function createTenant(name, planId = 'plan-free') {
    const id = uuidv4();
    const result = await query(
        `INSERT INTO tenants (id, name, plan_id, status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, name, planId, 'active']
    );
    return result.rows[0];
}

async function getTenant(id) {
    const result = await query('SELECT * FROM tenants WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function getTenantByStripeCustomerId(stripeCustomerId) {
    const result = await query('SELECT * FROM tenants WHERE stripe_customer_id = $1', [stripeCustomerId]);
    return result.rows[0] || null;
}

async function getTenantWithPlan(id) {
    const result = await query(
        `SELECT t.*, p.name as plan_name, p.api_calls_limit, p.ai_tokens_limit, p.price_per_month
         FROM tenants t
         LEFT JOIN plans p ON t.plan_id = p.id
         WHERE t.id = $1`,
        [id]
    );
    return result.rows[0] || null;
}

async function updateTenantPlan(tenantId, planId) {
    const result = await query(
        `UPDATE tenants 
         SET plan_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [planId, tenantId]
    );
    return result.rows[0] || null;
}

async function updateTenantStripeInfo(tenantId, stripeCustomerId, stripeSubscriptionId) {
    const result = await query(
        `UPDATE tenants 
         SET stripe_customer_id = $1, stripe_subscription_id = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [stripeCustomerId, stripeSubscriptionId, tenantId]
    );
    return result.rows[0] || null;
}

async function getAllTenants() {
    const result = await query('SELECT * FROM tenants ORDER BY created_at DESC');
    return result.rows;
}

// Get or create a test tenant
async function getOrCreateTestTenant() {
    const result = await query("SELECT * FROM tenants WHERE name = 'Test Tenant 1'");
    if (result.rows.length > 0) {
        return result.rows[0];
    }
    return await createTenant('Test Tenant 1', 'plan-free');
}

async function seedTenants() {
    const count = await query('SELECT COUNT(*) FROM tenants');
    if (parseInt(count.rows[0].count) > 0) {
        console.log('📊 Tenants already seeded');
        return;
    }

    // Create a test tenant
    await createTenant('Test Tenant 1', 'plan-free');
    console.log('🌱 Seeded test tenant');
}

module.exports = {
    createTenant,
    getTenant,
    getTenantByStripeCustomerId,
    getTenantWithPlan,
    updateTenantPlan,
    updateTenantStripeInfo,
    getAllTenants,
    getOrCreateTestTenant,
    seedTenants
};
