# flyrank-capstone-metering-billing

Usage Metering & Billing Engine — how much has this customer used, what does it cost, and have they hit their limit?

## Quick Start

```bash
# Clone
git clone https://github.com/MoscowAbdelaal/flyrank-capstone-metering-billing.git
cd flyrank-capstone-metering-billing

# Install
npm install

# Set up environment
cp .env.example .env

# Start PostgreSQL
docker run -d --name metering-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=metering_billing -p 5432:5432 postgres:15-alpine

# Start Redis
docker run -d -p 6379:6379 redis

# Start the app
npm run dev
Architecture

text
Client → Billable API → MeterService.record(tenant, type, qty, idempotencyKey)
                       → duplicate key → return original result
                       → store usage_event
                       → Quota Check → allowed → 200 / limit exceeded → 429

GET /usage → rollup(usage_events) → { used, limit, cost }

Stripe Checkout → subscription created
Stripe Webhook → verify signature → deduplicate → update tenant plan/status
Tech Stack

Node.js + Express
PostgreSQL
Stripe (Test Mode)
BullMQ + Redis
Jest
License

MIT
