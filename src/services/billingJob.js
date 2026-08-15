const { query } = require('../config/database');
const { getUsageReport } = require('./costService');

async function processDailyBilling() {
    console.log('📊 Starting daily billing job...');
    const tenants = await query('SELECT id FROM tenants');
    const results = [];

    for (const tenant of tenants.rows) {
        const report = await getUsageReport(tenant.id);
        results.push({
            tenantId: tenant.id,
            totalCost: report.usage.total_cost,
            apiCalls: report.usage.api_calls,
            aiTokens: report.usage.ai_tokens,
        });
        console.log(`✅ Processed tenant ${tenant.id}`);
    }

    console.log('📊 Daily billing job complete.');
    return results;
}

module.exports = { processDailyBilling };
