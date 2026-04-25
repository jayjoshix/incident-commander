-- Clickstream Events
-- Maps to: acme_nexus_raw_data.acme_raw.analytics.clickstream
-- Tier: Tier1 | Tags: BusinessDomain.Finance
-- Owner: Akash Jain
SELECT
    event_id,
    session_id,
    user_id,
    event_type,
    page_url,
    timestamp
FROM raw.clickstream_events
