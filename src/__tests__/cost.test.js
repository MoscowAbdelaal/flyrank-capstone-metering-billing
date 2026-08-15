const { calculateMonthlyCost, calculateTokenCost, getUsageReport } = require('../services/costService');
const { query } = require('../config/database');

jest.mock('../config/database', () => ({
    query: jest.fn(),
    pool: {},
    initDatabase: jest.fn().mockResolvedValue()
}));

describe('Cost Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('calculateTokenCost handles all token types', () => {
        const result = calculateTokenCost({
            input: 500,
            cachedInput: 200,
            output: 100,
            reasoning: 50
        });

        expect(result.total.tokens).toBe(850);
        // Using toBeCloseTo for floating point comparisons
        expect(result.total.cost).toBeCloseTo(0.00095, 6);
        expect(result.input.tokens).toBe(500);
        expect(result.cachedInput.cost).toBeCloseTo(0.0001, 6);
        expect(result.output.tokens).toBe(100);
        expect(result.reasoning.tokens).toBe(50);
    });

    test('calculateTokenCost handles missing token types', () => {
        const result = calculateTokenCost({
            input: 100,
            output: 50
        });

        expect(result.total.tokens).toBe(150);
        expect(result.cachedInput.tokens).toBe(0);
        expect(result.reasoning.cost).toBe(0);
    });

    test('calculateTokenCost returns correct pricing rates', () => {
        const result = calculateTokenCost({ input: 1000 });

        // Using toBeCloseTo for floating point comparisons
        expect(result.input.rate).toBeCloseTo(0.000001, 6);
        expect(result.cachedInput.rate).toBeCloseTo(0.0000005, 6);
        expect(result.output.rate).toBeCloseTo(0.000002, 6);
        expect(result.reasoning.rate).toBeCloseTo(0.000003, 6);
    });

    test('calculateMonthlyCost aggregates usage by event type', async () => {
        const mockRows = [
            { event_type: 'api_call', total_quantity: '100', total_cost: '0.1' },
            { event_type: 'ai_output_token', total_quantity: '500', total_cost: '0.001' }
        ];

        query.mockResolvedValueOnce({ rows: mockRows });

        const result = await calculateMonthlyCost('test-tenant');

        expect(result.breakdown.api_call).toBeDefined();
        expect(result.breakdown.api_call.quantity).toBe(100);
        expect(result.breakdown.ai_output_token.quantity).toBe(500);
        expect(result.total_cost).toBeCloseTo(0.101, 6);
    });
});
