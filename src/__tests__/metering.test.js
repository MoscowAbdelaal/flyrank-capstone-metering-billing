const { recordUsage, checkQuota, getCurrentUsage } = require('../services/usageService');
const { createTenant, getTenant } = require('../services/tenantService');
const { seedPlans } = require('../services/planService');
const { initDatabase, query } = require('../config/database');

// Mock the database
jest.mock('../config/database', () => ({
    query: jest.fn(),
    pool: {},
    initDatabase: jest.fn().mockResolvedValue()
}));

jest.mock('../services/tenantService', () => ({
    createTenant: jest.fn(),
    getTenant: jest.fn(),
    getTenantWithPlan: jest.fn(),
    updateTenantPlan: jest.fn(),
    updateTenantStripeInfo: jest.fn(),
}));

jest.mock('../services/planService', () => ({
    seedPlans: jest.fn(),
    PLANS: {
        FREE: { id: 'plan-free', api_calls_limit: 1000, ai_tokens_limit: 100000 },
        PRO: { id: 'plan-pro', api_calls_limit: 10000, ai_tokens_limit: 1000000 }
    }
}));

describe('Metering Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('recordUsage creates a usage event', async () => {
        const mockTenant = {
            id: 'test-tenant',
            plan_id: 'plan-free',
            api_calls_limit: 1000,
            ai_tokens_limit: 100000
        };

        require('../services/tenantService').getTenantWithPlan.mockResolvedValue(mockTenant);
        require('../config/database').query.mockResolvedValueOnce({ rows: [] }); // Check idempotency
        require('../config/database').query.mockResolvedValueOnce({ rows: [{ id: 'event-1', event_type: 'api_call', quantity: 5, cost: 0.005 }] });

        const result = await recordUsage({
            tenantId: 'test-tenant',
            eventType: 'api_call',
            quantity: 5,
            idempotencyKey: 'test-key-1'
        });

        expect(result).toBeDefined();
        expect(result.event_type).toBe('api_call');
        expect(result.quantity).toBe(5);
    });

    test('checkQuota returns allowed when under limit', async () => {
        const mockTenant = {
            id: 'test-tenant',
            plan_id: 'plan-free',
            api_calls_limit: 1000,
            ai_tokens_limit: 100000
        };

        require('../services/tenantService').getTenantWithPlan.mockResolvedValue(mockTenant);
        // Mock current usage: 100 API calls used, 900 remaining
        require('../config/database').query.mockResolvedValueOnce({ rows: [{ api_calls: 100, ai_tokens: 0, total_cost: 0 }] });

        const result = await checkQuota('test-tenant', 'api_call', 10);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(890); // 1000 - 100 - 10 = 890
    });

    test('checkQuota returns exceeded when over limit', async () => {
        const mockTenant = {
            id: 'test-tenant',
            plan_id: 'plan-free',
            api_calls_limit: 1000,
            ai_tokens_limit: 100000
        };

        require('../services/tenantService').getTenantWithPlan.mockResolvedValue(mockTenant);
        require('../config/database').query.mockResolvedValueOnce({ rows: [{ api_calls: 995, ai_tokens: 0, total_cost: 0 }] });

        const result = await checkQuota('test-tenant', 'api_call', 10);

        expect(result.allowed).toBe(false);
        expect(result.exceeded).toBe(true);
    });

    test('getCurrentUsage returns usage totals', async () => {
        const mockUsage = { api_calls: '50', ai_tokens: '1000', total_cost: '0.015' };
        require('../config/database').query.mockResolvedValueOnce({ rows: [mockUsage] });

        const result = await getCurrentUsage('test-tenant');

        expect(result.api_calls).toBe(50);
        expect(result.ai_tokens).toBe(1000);
        expect(result.total_cost).toBe(0.015);
    });
});
