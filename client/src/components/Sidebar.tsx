import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Calculator,
  BarChart3,
  Upload,
  List,
  FileText,
  Users,
  Bot,
  User,
  LogOut,
  GitCompareArrows,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const navigation = [
  { name: "Dashboard", href: "/app", icon: BarChart3 },
  { name: "Upload de Arquivos", href: "/uploads", icon: Upload },
  { name: "NCMs Extraídos", href: "/ncm-analysis", icon: List },
  { name: "Análise Tributária", href: "/tax-analysis", icon: FileText },
  { name: "Relatórios", href: "/reports", icon: BarChart3 },
  { name: "Usuários", href: "/users", icon: Users },
  { name: "RPA Legislação", href: "/rpa", icon: Bot },
  { name: "Mudanças em NCMs", href: "/rpa-dashboard", icon: GitCompareArrows },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  return (
    <aside className="w-64 bg-white shadow-lg flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Calculator className="text-white text-lg" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">TributAI</h1>
            <p className="text-sm text-gray-500">Machado Schütz Advogados</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                )}
                data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
            <User className="text-gray-600 text-sm" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900" data-testid="user-name">
              {(user as any)?.firstName || (user as any)?.email || "Usuário"}
            </p>
            <p className="text-xs text-gray-500" data-testid="user-role">
              {(user as any)?.role === "ADMIN" ? "Administrador" : "Analista Tributário"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
              window.location.href = "/login";
            }}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
