import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";

interface TopBarProps {
  title: string;
  subtitle: string;
  onNewUpload?: () => void;
}

export function TopBar({ title, subtitle, onNewUpload }: TopBarProps) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" data-testid="page-title">
            {title}
          </h2>
          <p className="text-gray-600 mt-1" data-testid="page-subtitle">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {onNewUpload && (
            <Button
              onClick={onNewUpload}
              className="bg-blue-600 text-white hover:bg-blue-700"
              data-testid="button-new-upload"
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Upload
            </Button>
          )}
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
