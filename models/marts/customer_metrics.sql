-- Customer Metrics
-- Maps to: acme_nexus_analytics.ANALYTICS.METRICS.customer_metrics
-- Tier: Tier1 | Tags: PII, Confidential, Highly Confidential
-- Owner: shailesh.parmar
SELECT
    customer_id,
    email,           -- PII column being modified
    total_orders,
    lifetime_value,
    churn_score,     -- ML model feature
    segment
FROM {{ ref('dim_customers') }}
