import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

import Dashboard from "@/pages/Dashboard";
import Landing from "@/pages/Landing";
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

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {/* Rota pública da landing */}
      <Route path="/">
        {/* Enquanto carrega, não renderiza nada para evitar flicker */}
        {isLoading ? null : isAuthenticated ? <Redirect to="/app" /> : <Landing />}
      </Route>

      {/* Área logada */}
      <Route path="/app" component={Dashboard} />
      <Route path="/uploads" component={Uploads} />
      <Route path="/ncm-analysis" component={NCMAnalysis} />
      <Route path="/tax-analysis" component={TaxAnalysis} />
      <Route path="/reports" component={Reports} />
      <Route path="/users" component={Users} />
      <Route path="/rpa" component={RPA} />
      <Route path="/rpa-dashboard" component={RPADashboard} />

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
