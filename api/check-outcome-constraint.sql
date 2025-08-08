-- Check the outcome constraint on the calls table
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'calls'::regclass
AND conname LIKE '%outcome%';