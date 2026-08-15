# Evidence — Usage Metering & Billing Engine

## Core Checklist

### Metering
- [ ] Billable action creates exactly one usage event
- [ ] Idempotency prevents double-counting

### Quotas
- [ ] Usage checked against tenant's plan
- [ ] 429 returned when limit exceeded

### Cost Calculation
- [ ] Monthly usage rollup
- [ ] AI token pricing rules correct

### Stripe Integration
- [ ] Checkout flow works
- [ ] Webhooks verify signatures
- [ ] Duplicate webhooks ignored

### Tests
- [ ] Duplicate usage prevention
- [ ] Quota boundary cases
- [ ] Cost calculations

## Probes Evidence
(To be filled as each probe passes)
