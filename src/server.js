const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const schedule = require('node-schedule');
const { initDatabase } = require('./config/database');
const { seedPlans } = require('./services/planService');
const { seedTenants, getOrCreateTestTenant } = require('./services/tenantService');
const { processDailyBilling } = require('./services/billingJob');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: Raw body for webhook verification (must come BEFORE express.json())
// This captures the raw body for Stripe webhook verification
app.use('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res, next) => {
    // Store raw body for later use
    req.rawBody = req.body;
    next();
});

// Regular middleware (only for non-webhook routes)
app.use((req, res, next) => {
    if (req.path === '/webhook/stripe') {
        return next();
    }
    express.json()(req, res, next);
});

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));

// Routes
const meterRoutes = require('./routes/meter');
const checkoutRoutes = require('./routes/checkout');
const webhookRoutes = require('./routes/webhook');
const reportRoutes = require('./routes/report');
const tenantRoutes = require('./routes/tenants');

app.use('/meter', meterRoutes);
app.use('/checkout', checkoutRoutes);
app.use('/webhook', webhookRoutes);
app.use('/report', reportRoutes);
app.use('/tenants', tenantRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manual trigger for billing job
app.post('/billing/run', async (req, res) => {
    try {
        const results = await processDailyBilling();
        res.json({
            success: true,
            tenants: results.length,
            results,
        });
    } catch (error) {
        console.error('Error running billing job:', error);
        res.status(500).json({
            error: 'Failed to run billing job',
            details: error.message,
        });
    }
});

// Initialize database and start server
async function startServer() {
    try {
        await initDatabase();
        await seedPlans();
        await seedTenants();

        const tenant = await getOrCreateTestTenant();
        console.log(`\n📊 Test Tenant ID: ${tenant.id}`);

        // Schedule daily billing job at midnight
        schedule.scheduleJob('0 0 * * *', async function() {
            console.log('\n⏰ Running scheduled daily billing job...');
            await processDailyBilling();
        });

        console.log('⏰ Scheduled daily billing job (midnight)');

        app.listen(PORT, () => {
            console.log(`\n🚀 Metering & Billing Engine running at http://localhost:${PORT}`);
            console.log(`📚 Health check: http://localhost:${PORT}/health`);
            console.log(`\n📋 Endpoints:`);
            console.log(`  POST  /meter                         - Record a billable action`);
            console.log(`  GET   /meter/usage/:tenantId         - Get current usage`);
            console.log(`  GET   /meter/history/:tenantId       - Get usage history`);
            console.log(`  POST  /checkout/create               - Create Stripe Checkout session`);
            console.log(`  POST  /webhook/mock                  - Mock Stripe webhook`);
            console.log(`  POST  /webhook/stripe                - Stripe webhook`);
            console.log(`  GET   /report/usage/:tenantId        - Get detailed usage report`);
            console.log(`  GET   /report/cost/:tenantId         - Get cost breakdown`);
            console.log(`  POST  /report/token-cost             - Calculate token cost with AI pricing`);
            console.log(`  POST  /tenants                       - Create a new tenant`);
            console.log(`  GET   /tenants                       - List all tenants`);
            console.log(`  GET   /tenants/:id                   - Get a tenant`);
            console.log(`  POST  /billing/run                   - Manually run daily billing job`);
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
