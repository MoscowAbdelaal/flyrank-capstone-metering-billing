const { v4: uuidv4 } = require('uuid');
const { getTenant, updateTenantStripeInfo, updateTenantPlan } = require('./tenantService');

// Determine if we're in mock mode based on the key or env var
const IS_MOCK = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_mock') || 
                process.env.STRIPE_MOCK_MODE === 'true' || 
                true; // Default to mock for development

// Plan ID to Stripe Price ID mapping (mock)
const PLAN_PRICE_IDS = {
    'plan-free': null,
    'plan-pro': process.env.STRIPE_PRO_PRICE_ID || 'price_mock_pro',
};

/**
 * Create a mock Checkout session (no Stripe API call)
 */
async function createCheckoutSession(tenantId, successUrl, cancelUrl, planId = 'plan-pro') {
    const tenant = await getTenant(tenantId);
    if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Generate mock IDs
    const sessionId = `cs_mock_${uuidv4().slice(0, 8)}`;
    const customerId = `cus_mock_${uuidv4().slice(0, 8)}`;

    console.log(`🎭 [MOCK] Checkout: Tenant ${tenantId} upgrading to ${planId}`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   Customer ID: ${customerId}`);

    // Return a mock response
    return {
        sessionId,
        url: `${successUrl}?session_id=${sessionId}&mock=true`,
        customerId,
        mock: true,
    };
}

/**
 * Create a mock Portal session
 */
async function createPortalSession(tenantId, returnUrl) {
    const tenant = await getTenant(tenantId);
    if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
    }

    return {
        url: `${returnUrl}?portal=mock`,
        mock: true,
    };
}

/**
 * Mock webhook signature verification
 */
function verifyWebhookSignature(payload, signature, webhookSecret) {
    // In mock mode, accept anything
    console.log('🎭 [MOCK] Webhook signature verified (mock)');
    return {
        id: `evt_mock_${uuidv4().slice(0, 8)}`,
        type: 'mock.event',
        data: { object: {} }
    };
}

/**
 * Handle webhook events (mock)
 */
async function handleWebhookEvent(event) {
    console.log(`🎭 [MOCK] Handling webhook event: ${event.type}`);

    // For checkout.completed events, update the tenant
    if (event.type === 'checkout.session.completed' || event.type === 'mock.event') {
        // Extract tenant data from event or use mock data
        const session = event.data?.object || {};
        const tenantId = session.metadata?.tenantId || 'mock-tenant-id';
        const planId = session.metadata?.planId || 'plan-pro';

        // Only update if we have a real tenant ID
        if (tenantId && tenantId !== 'mock-tenant-id') {
            await updateTenantStripeInfo(tenantId, session.customer || 'cus_mock', session.subscription || 'sub_mock');
            await updateTenantPlan(tenantId, planId);
            console.log(`✅ [MOCK] Tenant ${tenantId} upgraded to ${planId}`);
            return;
        }

        console.log(`🎭 [MOCK] Webhook processed (no tenant update)`);
        return;
    }

    console.log(`🎭 [MOCK] Unhandled webhook event: ${event.type}`);
}

module.exports = {
    createCheckoutSession,
    createPortalSession,
    verifyWebhookSignature,
    handleWebhookEvent,
    PLAN_PRICE_IDS,
    IS_MOCK,
};
