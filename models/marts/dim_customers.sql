-- Dimension Customers
-- Maps to: acme_nexus_analytics.ANALYTICS.MARTS.dim_customers
-- Tier: Tier1 | Tags: PII, Confidential, Marketing
-- Owner: Prajwal Pandit
SELECT
    customer_id,
    email,
    full_name,
    phone,
    address,
    country
FROM {{ ref('stg_customers') }}
