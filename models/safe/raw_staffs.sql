-- Raw Staffs (safe low-risk entity)
-- Maps to: postgres_aws_harsh.TESTDB.sales._airbyte_raw_staffs
-- No PII, no sensitive tags, has owner → score 0/100
SELECT
    staff_id,
    first_name,
    last_name,
    store_id,
    manager_id,
    hire_date,          -- ADDED
    department,         -- ADDED
    active
FROM raw.staffs
