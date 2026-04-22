import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Lock, ArrowLeft, KeyRound } from "lucide-react";

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" className={className} fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function resolvePostLoginRedirectPath(): string | null {
  if (typeof window === "undefined") return null;
  const candidate = new URLSearchParams(window.location.search).get("redirect");
  if (!candidate) return null;
  if (!candidate.startsWith("/")) return null;
  if (candidate.startsWith("//")) return null;
  if (candidate.startsWith("/admin-login")) return null;
  return candidate;
}

function isLocalDevHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export default function AdminLogin() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const { tx } = useI18n();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [microsoftPending, setMicrosoftPending] = useState(false);

  const isLocalMockSession = user?.id === "local-dev-user";
  const isLocalPreviewRoute = location === "/admin-login-preview";
  const allowLocalPreview = isLocalPreviewRoute && (isLocalMockSession || isLocalDevHost());
  const redirectAfterLogin = resolvePostLoginRedirectPath();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isAuthenticated && !allowLocalPreview) {
    setLocation(redirectAfterLogin || "/dashboard");
    return null;
  }

  async function handleMicrosoftLogin() {
    if (allowLocalPreview) {
      if (typeof window !== "undefined" && redirectAfterLogin && redirectAfterLogin.startsWith("/q/")) {
        const redirectUrl = new URL(redirectAfterLogin, window.location.origin);
        const gateKey = `form-login-preview-ok:${redirectUrl.pathname}`;
        const methodKey = `form-login-preview-method:${redirectUrl.pathname}`;
        sessionStorage.setItem(gateKey, "1");
        sessionStorage.setItem(methodKey, "microsoft");
      }
      setLocation(redirectAfterLogin || "/dashboard");
      return;
    }

    setMicrosoftPending(true);
    try {
      const statusRes = await fetch("/api/auth/microsoft-status");
      const status = await statusRes.json();
      if (status.enabled) {
        window.location.href = "/api/auth/microsoft/login";
      } else {
        toast({
          title: tx("Indisponível", "Unavailable"),
          description: tx(
            "O login via Microsoft ainda não está configurado. Por favor, utilize a senha para acessar.",
            "Microsoft login is not yet configured. Please use the password to sign in.",
          ),
        });
      }
    } catch {
      toast({
        title: tx("Erro", "Error"),
        description: tx("Erro ao verificar login Microsoft", "Error checking Microsoft login"),
        variant: "destructive",
      });
    } finally {
      setMicrosoftPending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (allowLocalPreview) {
      if (typeof window !== "undefined" && redirectAfterLogin && redirectAfterLogin.startsWith("/q/")) {
        const redirectUrl = new URL(redirectAfterLogin, window.location.origin);
        const gateKey = `form-login-preview-ok:${redirectUrl.pathname}`;
        const methodKey = `form-login-preview-method:${redirectUrl.pathname}`;
        sessionStorage.setItem(gateKey, "1");
        sessionStorage.setItem(methodKey, "password");
      }
      setLocation(redirectAfterLogin || "/dashboard");
      return;
    }

    setIsPending(true);

    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Login failed");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation(redirectAfterLogin || "/dashboard");
    } catch (err: any) {
      toast({
        title: tx("Erro", "Error"),
        description:
          err.message === "Invalid credentials"
            ? tx("Senha inválida", "Invalid password")
            : tx("Erro ao fazer login", "Login error"),
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <Card className="w-full shadow-lg">
          <CardHeader className="text-center space-y-4">
            <img
              src="/assets/logos/ms-horizontal.png"
              alt="Machado Schutz"
              className="h-16 w-auto self-start -ml-1"
            />

            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-8 w-8 text-primary" />
            </div>

            <CardTitle data-testid="text-admin-login-title" className="text-2xl">
              {tx("Backoffice Administrativo", "Administrative Backoffice")}
            </CardTitle>

            <p className="text-sm text-muted-foreground">
              {tx(
                "Entre com Microsoft ou use sua senha administrativa.",
                "Sign in with Microsoft or use your admin password.",
              )}
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleMicrosoftLogin}
              disabled={microsoftPending}
              data-testid="button-microsoft-login"
            >
              <MicrosoftIcon className="mr-2 h-4 w-4" />
              {microsoftPending
                ? tx("Verificando...", "Checking...")
                : tx("Entrar com Microsoft", "Sign in with Microsoft")}
            </Button>

            <Separator />

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{tx("Senha", "Password")}</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    data-testid="input-admin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    autoFocus
                    className="pl-10"
                  />
                </div>
              </div>

              <Button
                type="submit"
                data-testid="button-admin-login"
                className="w-full"
                disabled={isPending}
              >
                {isPending ? tx("Entrando...", "Signing in...") : tx("Entrar", "Sign In")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button
            variant="ghost"
            data-testid="link-back-home"
            onClick={() => setLocation("/")}
            className="text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {tx("Voltar ao inicio", "Back to home")}
          </Button>
        </div>
      </div>
    </div>
  );
}
