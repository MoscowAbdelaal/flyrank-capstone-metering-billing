const { recordUsage } = require('../services/usageService');
const { getTenantWithPlan } = require('../services/tenantService');
const { query } = require('../config/database');

jest.mock('../config/database', () => ({
    query: jest.fn(),
    pool: {},
    initDatabase: jest.fn().mockResolvedValue()
}));

jest.mock('../services/tenantService', () => ({
    getTenantWithPlan: jest.fn(),
}));

describe('Idempotency', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('Same idempotency key returns existing event', async () => {
        const mockTenant = {
            id: 'test-tenant',
            plan_id: 'plan-free',
            api_calls_limit: 1000,
            ai_tokens_limit: 100000
        };

        const mockEvent = {
            id: 'existing-event',
            event_type: 'api_call',
            quantity: 5,
            idempotency_key: 'test-key-1'
        };

        getTenantWithPlan.mockResolvedValue(mockTenant);

        // First call: no existing event, then create
        query
            .mockResolvedValueOnce({ rows: [] }) // Check idempotency (no existing)
            .mockResolvedValueOnce({ rows: [mockEvent] }); // Return created event

        const result1 = await recordUsage({
            tenantId: 'test-tenant',
            eventType: 'api_call',
            quantity: 5,
            idempotencyKey: 'test-key-1'
        });

        expect(result1.idempotency_key).toBe('test-key-1');

        // Second call: existing event found
        query.mockResolvedValueOnce({ rows: [mockEvent] });

        const result2 = await recordUsage({
            tenantId: 'test-tenant',
            eventType: 'api_call',
            quantity: 10,
            idempotencyKey: 'test-key-1'
        });

        expect(result2.idempotency_key).toBe('test-key-1');
        expect(result2.quantity).toBe(5); // Same as original
    });

    test('Different idempotency keys create different events', async () => {
        const mockTenant = {
            id: 'test-tenant',
            plan_id: 'plan-free',
            api_calls_limit: 1000,
            ai_tokens_limit: 100000
        };

        const mockEvent1 = {
            id: 'event-1',
            event_type: 'api_call',
            quantity: 5,
            idempotency_key: 'test-key-1'
        };

        const mockEvent2 = {
            id: 'event-2',
            event_type: 'api_call',
            quantity: 10,
            idempotency_key: 'test-key-2'
        };

        getTenantWithPlan.mockResolvedValue(mockTenant);

        // First request
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [mockEvent1] });

        const result1 = await recordUsage({
            tenantId: 'test-tenant',
            eventType: 'api_call',
            quantity: 5,
            idempotencyKey: 'test-key-1'
        });

        // Second request
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [mockEvent2] });

        const result2 = await recordUsage({
            tenantId: 'test-tenant',
            eventType: 'api_call',
            quantity: 10,
            idempotencyKey: 'test-key-2'
        });

        expect(result1.id).not.toBe(result2.id);
        expect(result1.quantity).toBe(5);
        expect(result2.quantity).toBe(10);
    });
});
