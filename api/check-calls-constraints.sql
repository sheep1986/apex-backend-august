-- Check column data types and constraints for the calls table
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'calls'
AND character_maximum_length = 50
ORDER BY ordinal_position;