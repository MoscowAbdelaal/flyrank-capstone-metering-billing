const Stripe = require('stripe');
const { PLANS } = require('./planService');
const { getTenant, updateTenantStripeInfo, updateTenantPlan } = require('./tenantService');

// Initialize Stripe with test mode key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
});

// Plan ID to Stripe Price ID mapping (to be set in Stripe Dashboard)
// For testing, we'll use the plan IDs directly
const PLAN_PRICE_IDS = {
    'plan-free': null, // Free plan doesn't need a price
    'plan-pro': process.env.STRIPE_PRO_PRICE_ID || 'price_pro_test', // Set in .env
};

/**
 * Create a Stripe Checkout session for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} successUrl - URL to redirect on success
 * @param {string} cancelUrl - URL to redirect on cancel
 * @param {string} planId - Plan ID to upgrade to
 * @returns {Promise<Object>} - Checkout session
 */
async function createCheckoutSession(tenantId, successUrl, cancelUrl, planId = 'plan-pro') {
    const tenant = await getTenant(tenantId);
    if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
    }

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
    };
}

/**
 * Create a billing portal session for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} returnUrl - URL to redirect after portal
 * @returns {Promise<Object>} - Portal session
 */
async function createPortalSession(tenantId, returnUrl) {
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

    return {
        url: session.url,
    };
}

/**
 * Verify Stripe webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @param {string} webhookSecret - Webhook signing secret
 * @returns {Object} - Stripe event
 */
function verifyWebhookSignature(payload, signature, webhookSecret) {
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
 * Handle Stripe webhook events
 * @param {Object} event - Stripe event
 * @returns {Promise<void>}
 */
async function handleWebhookEvent(event) {
    const { type, data } = event;

    switch (type) {
        case 'checkout.session.completed': {
            const session = data.object;
            const tenantId = session.metadata?.tenantId;
            const planId = session.metadata?.planId || 'plan-pro';

            if (tenantId) {
                // Update tenant's Stripe info
                await updateTenantStripeInfo(
                    tenantId,
                    session.customer,
                    session.subscription
                );
                // Update tenant's plan
                await updateTenantPlan(tenantId, planId);
                console.log(`✅ Tenant ${tenantId} upgraded to ${planId}`);
            }
            break;
        }

        case 'customer.subscription.updated': {
            const subscription = data.object;
            const customerId = subscription.customer;

            // Find tenant by Stripe customer ID
            const tenant = await getTenantByStripeCustomerId(customerId);
            if (tenant) {
                // Update subscription status
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
                // Downgrade to Free plan
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
};
