const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { initDatabase } = require('./config/database');
const { seedPlans } = require('./services/planService');
const { seedTenants, getOrCreateTestTenant } = require('./services/tenantService');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: Raw body for webhook verification (must come BEFORE express.json())
app.use('/webhook/stripe', express.raw({ type: 'application/json' }));

// Regular middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const meterRoutes = require('./routes/meter');
const checkoutRoutes = require('./routes/checkout');
const webhookRoutes = require('./routes/webhook');
const reportRoutes = require('./routes/report');

app.use('/meter', meterRoutes);
app.use('/checkout', checkoutRoutes);
app.use('/webhook', webhookRoutes);
app.use('/report', reportRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database and start server
async function startServer() {
    try {
        await initDatabase();
        await seedPlans();
        await seedTenants();

        const tenant = await getOrCreateTestTenant();
        console.log(`\n📊 Test Tenant ID: ${tenant.id}`);

        app.listen(PORT, () => {
            console.log(`\n🚀 Metering & Billing Engine running at http://localhost:${PORT}`);
            console.log(`📚 Health check: http://localhost:${PORT}/health`);
            console.log(`\n📋 Endpoints:`);
            console.log(`  POST  /meter                         - Record a billable action`);
            console.log(`  GET   /meter/usage/:tenantId         - Get current usage`);
            console.log(`  GET   /meter/history/:tenantId       - Get usage history`);
            console.log(`  POST  /checkout/create               - Create Stripe Checkout session (mock)`);
            console.log(`  POST  /webhook/mock                  - Mock Stripe webhook`);
            console.log(`  POST  /webhook/stripe                - Stripe webhook (mock mode)`);
            console.log(`  GET   /report/usage/:tenantId        - Get detailed usage report`);
            console.log(`  GET   /report/cost/:tenantId         - Get cost breakdown`);
            console.log(`  POST  /report/token-cost             - Calculate token cost with AI pricing`);
            console.log(`  GET   /health                        - Health check`);
            console.log(`\n📊 Test Tenant ID: ${tenant.id}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
