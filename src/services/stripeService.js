const Stripe = require('stripe');
const { v4: uuidv4 } = require('uuid');
const { getTenant, updateTenantStripeInfo, updateTenantPlan, getTenantByStripeCustomerId } = require('./tenantService');
const { query } = require('../config/database');

// Check if we're in mock mode
const IS_MOCK = process.env.STRIPE_MOCK_MODE === 'true' || 
                process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_mock') ||
                !process.env.STRIPE_SECRET_KEY;

// Initialize Stripe client only if not in mock mode
let stripe = null;
if (!IS_MOCK && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2025-02-24.acacia',
    });
    console.log('✅ Stripe client initialized (real mode)');
} else {
    console.log('🎭 Stripe running in MOCK mode');
}

const PLAN_PRICE_IDS = {
    'plan-free': null,
    'plan-pro': process.env.STRIPE_PRO_PRICE_ID || 'price_mock_pro',
};

/**
 * Create a real Stripe Checkout session
 */
async function createCheckoutSession(tenantId, successUrl, cancelUrl, planId = 'plan-pro') {
    const tenant = await getTenant(tenantId);
    if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
    }

    // If in mock mode, return mock response
    if (IS_MOCK || !stripe) {
        const sessionId = `cs_mock_${uuidv4().slice(0, 8)}`;
        const customerId = `cus_mock_${uuidv4().slice(0, 8)}`;
        console.log(`🎭 [MOCK] Checkout: Tenant ${tenantId} upgrading to ${planId}`);
        return {
            sessionId,
            url: `${successUrl}?session_id=${sessionId}`,
            customerId,
            mock: true,
        };
    }

    // Real Stripe integration
    // Get the Stripe price ID for the plan
    const priceId = PLAN_PRICE_IDS[planId];
    if (!priceId) {
        throw new Error(`No Stripe price ID found for plan: ${planId}`);
    }

    // Create or get Stripe customer
    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
        const customer = await stripe.customers.create({
            metadata: {
                tenantId: tenantId,
                tenantName: tenant.name,
            },
        });
        customerId = customer.id;
        await updateTenantStripeInfo(tenantId, customerId, null);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
            tenantId: tenantId,
            planId: planId,
        },
        client_reference_id: tenantId,
    });

    return {
        sessionId: session.id,
        url: session.url,
        customerId: customerId,
        mock: false,
    };
}

/**
 * Create a portal session
 */
async function createPortalSession(tenantId, returnUrl) {
    if (IS_MOCK || !stripe) {
        return { url: `${returnUrl}?portal=mock`, mock: true };
    }

    const tenant = await getTenant(tenantId);
    if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
    }

    if (!tenant.stripe_customer_id) {
        throw new Error('Tenant has no Stripe customer ID');
    }

    const session = await stripe.billingPortal.sessions.create({
        customer: tenant.stripe_customer_id,
        return_url: returnUrl,
    });

    return { url: session.url, mock: false };
}

/**
 * Verify Stripe webhook signature (real)
 */
function verifyWebhookSignature(payload, signature, webhookSecret) {
    if (IS_MOCK || !stripe) {
        console.log('🎭 [MOCK] Webhook signature verified (mock)');
        return {
            id: `evt_mock_${uuidv4().slice(0, 8)}`,
            type: 'mock.event',
            data: { object: {} }
        };
    }

    try {
        const event = stripe.webhooks.constructEvent(
            payload,
            signature,
            webhookSecret
        );
        return event;
    } catch (error) {
        console.error('Webhook signature verification failed:', error.message);
        throw error;
    }
}

/**
 * Handle Stripe webhook events (real)
 */
async function handleWebhookEvent(event) {
    const { type, data } = event;

    console.log(`📨 Processing webhook: ${type}`);

    switch (type) {
        case 'checkout.session.completed': {
            const session = data.object;
            const tenantId = session.metadata?.tenantId;
            const planId = session.metadata?.planId || 'plan-pro';

            if (tenantId) {
                await updateTenantStripeInfo(
                    tenantId,
                    session.customer,
                    session.subscription
                );
                await updateTenantPlan(tenantId, planId);
                console.log(`✅ Tenant ${tenantId} upgraded to ${planId}`);
            }
            break;
        }

        case 'customer.subscription.updated': {
            const subscription = data.object;
            const customerId = subscription.customer;

            const tenant = await getTenantByStripeCustomerId(customerId);
            if (tenant) {
                await query(
                    `UPDATE subscriptions 
                     SET status = $1, current_period_end = to_timestamp($2)
                     WHERE stripe_subscription_id = $3`,
                    [subscription.status, subscription.current_period_end, subscription.id]
                );
                console.log(`✅ Subscription updated for tenant ${tenant.id}`);
            }
            break;
        }

        case 'customer.subscription.deleted': {
            const subscription = data.object;
            const customerId = subscription.customer;

            const tenant = await getTenantByStripeCustomerId(customerId);
            if (tenant) {
                await updateTenantPlan(tenant.id, 'plan-free');
                console.log(`⬇️ Tenant ${tenant.id} downgraded to Free`);
            }
            break;
        }

        default:
            console.log(`⚠️ Unhandled webhook event: ${type}`);
    }
}

module.exports = {
    stripe,
    createCheckoutSession,
    createPortalSession,
    verifyWebhookSignature,
    handleWebhookEvent,
    PLAN_PRICE_IDS,
    IS_MOCK,
};
