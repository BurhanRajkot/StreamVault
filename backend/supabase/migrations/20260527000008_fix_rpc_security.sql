-- Switch the function to SECURITY INVOKER to prevent privilege escalation
ALTER FUNCTION public.get_user_profile_data(TEXT) SECURITY INVOKER;

-- Revoke execute permissions from public roles to ensure it's only callable
-- by the service_role (e.g., from the backend API)
REVOKE EXECUTE ON FUNCTION public.get_user_profile_data(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_profile_data(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_profile_data(TEXT) FROM authenticated;
