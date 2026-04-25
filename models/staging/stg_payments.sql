-- Staging Payments
-- No owner assigned — governance risk
SELECT
    payment_id,
    order_id,
    amount,
    payment_date,
    provider
FROM raw.payments
