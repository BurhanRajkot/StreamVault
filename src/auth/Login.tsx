import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default function Login() {
  const { loginWithRedirect } = useAuth0();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-black/60 px-4">
      <Card className="w-full max-w-md border border-border/60 bg-background/90 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
          <CardDescription>
            Sign in to continue watching your movies & shows.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Button
            className="w-full"
            onClick={() =>
              loginWithRedirect({
                appState: { returnTo: "/" },
              })
            }
          >
            Continue with Email
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
