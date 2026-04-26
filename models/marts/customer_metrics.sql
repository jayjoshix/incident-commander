-- Customer Metrics (high-risk Tier1 PII entity)
-- Maps to: acme_nexus_analytics.ANALYTICS.METRICS.customer_metrics
-- Tier1 + PII + Confidential + Highly Confidential → FAILS
SELECT
    customer_id,
    contact_email,       -- RENAMED from email (breaking change)
    phone_number,        -- ADDED new PII column
    total_orders,
    lifetime_value,
    churn_score,
    retention_score,     -- ADDED
    segment
FROM {{ ref('dim_customers') }}
