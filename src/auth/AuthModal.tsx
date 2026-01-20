import { motion, AnimatePresence } from "framer-motion"
import { useAuth0 } from "@auth0/auth0-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Mail, Github, Chrome } from "lucide-react"

interface AuthModalProps {
  open: boolean
  onClose: () => void
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { loginWithRedirect, isLoading } = useAuth0()

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="p-6"
            >
              <DialogHeader className="space-y-2">
                <DialogTitle className="text-2xl font-bold">
                  Welcome to StreamVault
                </DialogTitle>
                <DialogDescription>
                  Sign in to continue watching your movies & shows.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-6 space-y-4">
                {/* Email Login */}
                <Button
                  className="w-full h-11"
                  disabled={isLoading}
                  onClick={() =>
                    loginWithRedirect({
                      appState: { returnTo: "/" },
                    })
                  }
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Continue with Email
                </Button>

                {/* Divider */}
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>
                </div>

                {/* Social Buttons */}
                <Button
                  variant="outline"
                  className="w-full h-11"
                  onClick={() =>
                    loginWithRedirect({
                      authorizationParams: {
                        connection: "google-oauth2",
                      },
                      appState: { returnTo: "/" },
                    })
                  }
                >
                  <Chrome className="mr-2 h-4 w-4" />
                  Google
                </Button>

                <Button
                  variant="outline"
                  className="w-full h-11"
                  onClick={() =>
                    loginWithRedirect({
                      authorizationParams: {
                        connection: "github",
                      },
                      appState: { returnTo: "/" },
                    })
                  }
                >
                  <Github className="mr-2 h-4 w-4" />
                  GitHub
                </Button>

                {/* Signup */}
                <p className="pt-4 text-center text-sm text-muted-foreground">
                  New here?{" "}
                  <button
                    onClick={() =>
                      loginWithRedirect({
                        authorizationParams: { screen_hint: "signup" },
                        appState: { returnTo: "/" },
                      })
                    }
                    className="font-medium text-primary hover:underline"
                  >
                    Create an account
                  </button>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
