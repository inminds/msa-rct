import { Switch, Route } from "wouter";
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
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/uploads" component={Uploads} />
          <Route path="/ncm-analysis" component={NCMAnalysis} />
          <Route path="/tax-analysis" component={TaxAnalysis} />
          <Route path="/reports" component={Reports} />
          <Route path="/users" component={Users} />
          <Route path="/rpa" component={RPA} />
        </>
      )}
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
