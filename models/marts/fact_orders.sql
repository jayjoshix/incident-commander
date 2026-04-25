-- Fact Orders
-- Tier: Tier1, Owner: data-platform-team, Tags: PII, GDPR
SELECT
    order_id,
    customer_id,
    order_date,
    total_amount,
    payment_method,
    status
FROM {{ ref('stg_orders') }}
LEFT JOIN {{ ref('dim_customer') }} USING (customer_id)
