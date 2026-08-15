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

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const meterRoutes = require('./routes/meter');

app.use('/meter', meterRoutes);

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

        // Get the test tenant ID for demo
        const tenant = await getOrCreateTestTenant();
        console.log(`\n📊 Test Tenant ID: ${tenant.id}`);

        app.listen(PORT, () => {
            console.log(`\n🚀 Metering & Billing Engine running at http://localhost:${PORT}`);
            console.log(`📚 Health check: http://localhost:${PORT}/health`);
            console.log(`\n📋 Endpoints:`);
            console.log(`  POST  /meter                    - Record a billable action`);
            console.log(`  GET   /meter/usage/:tenantId    - Get current usage`);
            console.log(`  GET   /meter/history/:tenantId  - Get usage history`);
            console.log(`  GET   /health                   - Health check`);
            console.log(`\n📊 Test Tenant ID: ${tenant.id}`);
            console.log(`💡 Try: curl http://localhost:3000/meter/usage/${tenant.id}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
