import { Button } from "@/components/ui/button";
import { Plus, Bell } from "lucide-react";

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
          <div className="relative">
            <Bell className="text-gray-400 text-xl" />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              3
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
