-- Clickstream Events
-- Maps to: acme_nexus_raw_data.acme_raw.analytics.clickstream
-- Tier: Tier1 | Tags: BusinessDomain.Finance (no PII, no sensitive tags)
SELECT
    event_id,
    session_id,
    user_id,
    event_type,
    page_url,
    referrer_url,       -- ADDED: referrer tracking (non-PII)
    device_type,        -- ADDED: device category (non-PII)
    browser,            -- ADDED: browser info (non-PII)
    timestamp,
    duration_seconds    -- ADDED: session duration metric
FROM raw.clickstream_events
