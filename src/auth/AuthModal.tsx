import { motion, AnimatePresence } from "framer-motion"
import { useAuth0 } from "@auth0/auth0-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { Mail, Github, Chrome, Play, Heart, Download } from "lucide-react"

interface AuthModalProps {
  open: boolean
  onClose: () => void
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { loginWithRedirect, isLoading } = useAuth0()

  const handleRedirect = async (options?: any) => {
    onClose()
    await loginWithRedirect(options)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="grid grid-cols-1 md:grid-cols-2"
            >
              {/* LEFT SIDE — VALUE PROPOSITION */}
              <div className="hidden md:flex flex-col justify-between bg-gradient-to-br from-primary/20 via-background to-background p-8">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Unlock your StreamVault
                  </h2>

                  <p className="mt-3 text-sm text-muted-foreground">
                    Create an account to get the full experience.
                  </p>

                  <div className="mt-8 space-y-4">
                    <div className="flex items-center gap-3">
                      <Heart className="h-5 w-5 text-primary" />
                      <span className="text-sm">
                        Save your favorites & watch later
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <Play className="h-5 w-5 text-primary" />
                      <span className="text-sm">
                        Resume watching across all devices
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <Download className="h-5 w-5 text-primary" />
                      <span className="text-sm">
                        Access downloads & continue offline
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Join thousands of viewers building their personal library.
                </p>
              </div>

              {/* RIGHT SIDE — ACTIONS */}
              <div className="p-8">
                <h3 className="text-xl font-semibold tracking-tight">
                  Sign in to continue
                </h3>

                <p className="mt-2 text-sm text-muted-foreground">
                  Your account gives you a personalized StreamVault experience.
                </p>

                <div className="mt-6 space-y-3">
                  {/* Email */}
                  <Button
                    className="w-full h-11"
                    disabled={isLoading}
                    onClick={() =>
                      handleRedirect({
                        appState: { returnTo: "/" },
                      })
                    }
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Continue with Email
                  </Button>

                  {/* Social */}
                  <Button
                    variant="outline"
                    className="w-full h-11"
                    onClick={() =>
                      handleRedirect({
                        authorizationParams: {
                          connection: "google-oauth2",
                        },
                        appState: { returnTo: "/" },
                      })
                    }
                  >
                    <Chrome className="mr-2 h-4 w-4" />
                    Continue with Google
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full h-11"
                    onClick={() =>
                      handleRedirect({
                        authorizationParams: {
                          connection: "github",
                        },
                        appState: { returnTo: "/" },
                      })
                    }
                  >
                    <Github className="mr-2 h-4 w-4" />
                    Continue with GitHub
                  </Button>

                  {/* Signup */}
                  <p className="pt-4 text-center text-sm text-muted-foreground">
                    New to StreamVault?{" "}
                    <button
                      onClick={() =>
                        handleRedirect({
                          authorizationParams: { screen_hint: "signup" },
                          appState: { returnTo: "/" },
                        })
                      }
                      className="font-medium text-primary hover:underline"
                    >
                      Create your free account
                    </button>
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
