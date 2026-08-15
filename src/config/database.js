const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'metering_billing',
});

async function initDatabase() {
    const client = await pool.connect();
    try {
        // Create plans table
        await client.query(`
            CREATE TABLE IF NOT EXISTS plans (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                api_calls_limit INTEGER DEFAULT 1000,
                ai_tokens_limit INTEGER DEFAULT 100000,
                price_per_month INTEGER NOT NULL,
                stripe_price_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create tenants table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tenants (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                plan_id VARCHAR(50) REFERENCES plans(id),
                stripe_customer_id VARCHAR(255),
                stripe_subscription_id VARCHAR(255),
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create usage_events table
        await client.query(`
            CREATE TABLE IF NOT EXISTS usage_events (
                id UUID PRIMARY KEY,
                tenant_id UUID REFERENCES tenants(id),
                event_type VARCHAR(50) NOT NULL,
                quantity INTEGER NOT NULL,
                idempotency_key VARCHAR(255) UNIQUE NOT NULL,
                cost DECIMAL(10, 6) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create subscriptions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id UUID PRIMARY KEY,
                tenant_id UUID REFERENCES tenants(id),
                stripe_subscription_id VARCHAR(255) UNIQUE,
                plan_id VARCHAR(50) REFERENCES plans(id),
                status VARCHAR(50) DEFAULT 'active',
                current_period_start TIMESTAMP,
                current_period_end TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create webhook_events table (for deduplication)
        await client.query(`
            CREATE TABLE IF NOT EXISTS webhook_events (
                id UUID PRIMARY KEY,
                stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
                event_type VARCHAR(100) NOT NULL,
                processed BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Database tables created');
    } finally {
        client.release();
    }
}

async function query(text, params) {
    try {
        const result = await pool.query(text, params);
        return result;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

module.exports = {
    pool,
    query,
    initDatabase
};
