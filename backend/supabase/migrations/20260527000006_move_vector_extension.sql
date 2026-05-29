-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move the vector extension from public to extensions schema
ALTER EXTENSION vector SET SCHEMA extensions;
