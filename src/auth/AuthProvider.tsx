import { Auth0Provider } from "@auth0/auth0-react";
import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_AUTH0_REDIRECT_URI;

  // Debug logging
  console.log("Auth0 Config:", {
    domain,
    clientId,
    redirectUri,
  });

  // Validation
  if (!domain || !clientId || !redirectUri) {
    console.error("❌ Missing Auth0 environment variables!");
    return <div className="p-4 text-red-500">
      Auth0 configuration error. Check your .env file.
    </div>;
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: redirectUri,
      }}
      onRedirectCallback={(appState) => {
        navigate(appState?.returnTo || "/");
      }}
    >
      {children}
    </Auth0Provider>
  );
}