const { query } = require('../config/database');

// Plan definitions
const PLANS = {
    FREE: {
        id: 'plan-free',
        name: 'Free',
        api_calls_limit: 1000,
        ai_tokens_limit: 100000,
        price_per_month: 0,
        stripe_price_id: null
    },
    PRO: {
        id: 'plan-pro',
        name: 'Pro',
        api_calls_limit: 10000,
        ai_tokens_limit: 1000000,
        price_per_month: 2900, // $29.00
        stripe_price_id: null
    }
};

async function createPlan(planData) {
    const result = await query(
        `INSERT INTO plans (id, name, api_calls_limit, ai_tokens_limit, price_per_month, stripe_price_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [planData.id, planData.name, planData.api_calls_limit, planData.ai_tokens_limit, planData.price_per_month, planData.stripe_price_id]
    );
    return result.rows[0];
}

async function getPlan(id) {
    const result = await query('SELECT * FROM plans WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function getPlanByStripePriceId(stripePriceId) {
    const result = await query('SELECT * FROM plans WHERE stripe_price_id = $1', [stripePriceId]);
    return result.rows[0] || null;
}

async function getAllPlans() {
    const result = await query('SELECT * FROM plans ORDER BY price_per_month ASC');
    return result.rows;
}

async function seedPlans() {
    // Check if plans already exist
    const result = await query('SELECT COUNT(*) FROM plans');
    if (parseInt(result.rows[0].count) > 0) {
        console.log('📊 Plans already seeded');
        return;
    }

    // Create Free plan
    await createPlan(PLANS.FREE);
    await createPlan(PLANS.PRO);
    console.log('🌱 Seeded plans (Free, Pro)');
}

module.exports = {
    PLANS,
    createPlan,
    getPlan,
    getPlanByStripePriceId,
    getAllPlans,
    seedPlans
};
