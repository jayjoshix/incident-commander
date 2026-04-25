-- Dimension Customer
-- Tier: Tier1, Tags: PII, Confidential
SELECT
    customer_id,
    email,
    name,
    phone,
    address,
    created_at
FROM {{ ref('stg_customers') }}
