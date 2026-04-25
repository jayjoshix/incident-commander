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

-- SCHEMA CHANGE: rename email → contact_email, add retention_score column
-- ALTER TABLE customer_metrics RENAME COLUMN email TO contact_email;
-- ALTER TABLE customer_metrics ADD COLUMN retention_score FLOAT;
