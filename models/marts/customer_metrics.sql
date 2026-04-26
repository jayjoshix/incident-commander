-- Customer Metrics
-- Maps to: acme_nexus_analytics.ANALYTICS.METRICS.customer_metrics
-- Tier: Tier1 | Tags: PII, Confidential, Highly Confidential
SELECT
    customer_id,
    contact_email,       -- RENAMED from email (breaking downstream change)
    phone_number,        -- ADDED new PII column
    total_orders,
    lifetime_value,
    churn_score,
    retention_score,     -- ADDED new ML feature
    segment
FROM {{ ref('dim_customers') }}
