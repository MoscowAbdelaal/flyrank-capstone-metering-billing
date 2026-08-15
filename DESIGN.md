# Usage Metering & Billing Engine — Design Doc

## Problem Statement
SaaS products must answer: How much has this customer used? How much should they pay? Have they reached their plan limits?

## Solution Overview
A service that meters usage, enforces quotas, calculates costs, and integrates with Stripe for subscription management.

## Data Model

### tenants
```sql
id UUID PRIMARY KEY
name VARCHAR(255) NOT NULL
plan_id UUID REFERENCES plans(id)
stripe_customer_id VARCHAR(255)
stripe_subscription_id VARCHAR(255)
status VARCHAR(50) DEFAULT 'active'
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
plans

sql
id UUID PRIMARY KEY
name VARCHAR(255) NOT NULL
api_calls_limit INTEGER DEFAULT 1000
ai_tokens_limit INTEGER DEFAULT 100000
price_per_month INTEGER NOT NULL -- cents
stripe_price_id VARCHAR(255)
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
usage_events

sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
event_type VARCHAR(50) NOT NULL
quantity INTEGER NOT NULL
idempotency_key VARCHAR(255) UNIQUE NOT NULL
cost INTEGER -- cents
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
Pricing Rules

API Calls

Free plan: 1,000 calls/month
Pro plan: 10,000 calls/month
AI Tokens (simulated)

Input tokens: $0.00001 per token
Cached input tokens: $0.000005 per token
Output tokens: $0.00002 per token
Reasoning tokens: $0.00003 per token
API Endpoints

Method	Endpoint	Description
POST	/meter	Record a billable action
GET	/usage	Get current usage
POST	/checkout	Create Stripe Checkout session
POST	/webhook/stripe	Stripe webhook handler
Idempotency Strategy

Each request includes Idempotency-Key header
Key stored with usage event
Duplicate key → return original result
Non-Goals

No invoicing
No proration
No overage billing
