import { useEffect, type ComponentType } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

import Dashboard from "@/pages/Dashboard";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Uploads from "@/pages/Uploads";
import NCMAnalysis from "@/pages/NCMAnalysis";
import TaxAnalysis from "@/pages/TaxAnalysis";
import Reports from "@/pages/Reports";
import Users from "@/pages/Users";
import RPA from "@/pages/RPA";
import RPADashboard from "@/pages/RPADashboard";
import NotFound from "@/pages/not-found";

/** Redirect simples para wouter */
function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => setLocation(to), [to, setLocation]);
  return null;
}

function ProtectedRoute({ component: Component }: { component: ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {/* Rota pública */}
      <Route path="/">
        {isLoading ? null : isAuthenticated ? <Redirect to="/app" /> : <Redirect to="/login" />}
      </Route>

      {/* Login */}
      <Route path="/login">
        {isLoading ? null : isAuthenticated ? <Redirect to="/app" /> : <Login />}
      </Route>

      {/* Área logada */}
      <Route path="/app"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/uploads"><ProtectedRoute component={Uploads} /></Route>
      <Route path="/ncm-analysis"><ProtectedRoute component={NCMAnalysis} /></Route>
      <Route path="/tax-analysis"><ProtectedRoute component={TaxAnalysis} /></Route>
      <Route path="/reports"><ProtectedRoute component={Reports} /></Route>
      <Route path="/users"><ProtectedRoute component={Users} /></Route>
      <Route path="/rpa"><ProtectedRoute component={RPA} /></Route>
      <Route path="/rpa-dashboard"><ProtectedRoute component={RPADashboard} /></Route>

      {/* 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
