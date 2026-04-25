-- Customer Metrics
-- Maps to: acme_nexus_analytics.ANALYTICS.METRICS.customer_metrics
-- Tier: Tier1 | Tags: PII, Confidential, Highly Confidential
-- Owner: shailesh.parmar

SELECT
    customer_id,
    contact_email,           -- RENAMED from email (breaking change for downstream)
    phone_number,            -- ADDED new PII column
    total_orders,
    lifetime_value,
    churn_score,
    retention_score,         -- ADDED new ML feature column
    segment,
    last_active_date
FROM {{ ref('dim_customers') }}
LEFT JOIN {{ ref('dim_customer_lifecycle') }} USING (customer_id)
