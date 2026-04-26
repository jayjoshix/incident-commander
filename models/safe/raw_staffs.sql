-- Raw Staffs
-- Maps to: postgres_aws_harsh.TESTDB.sales._airbyte_raw_staffs
-- No PII, no sensitive tags, has owner
SELECT
    staff_id,
    first_name,
    last_name,
    store_id,
    manager_id,
    hire_date,          -- ADDED: non-sensitive field
    department,         -- ADDED: non-sensitive field
    active
FROM raw.staffs
