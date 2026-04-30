import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, CheckCheck, ScanSearch, GitCompareArrows, ClipboardCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { distanceUTC } from "@/lib/dateUtils";

interface Notification {
  id: string;
  type: "scan_completed" | "ncm_changes" | "scan_request_update";
  title: string;
  message: string;
  timestamp: string;
  href: string;
}

const STORAGE_KEY = "tributai_dismissed_notifications";

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  // Mantém apenas os últimos 200 IDs para não crescer indefinidamente
  const arr = Array.from(ids).slice(-200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

const typeIcon: Record<Notification["type"], React.ReactNode> = {
  scan_completed: <ScanSearch className="h-4 w-4 text-green-500" />,
  ncm_changes: <GitCompareArrows className="h-4 w-4 text-amber-500" />,
  scan_request_update: <ClipboardCheck className="h-4 w-4 text-blue-500" />,
};

export function NotificationBell() {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed);
  const [open, setOpen] = useState(false);

  const { data: all = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30_000,
  });

  const visible = all.filter((n) => !dismissed.has(n.id));
  const count = visible.length;

  useEffect(() => {
    saveDismissed(dismissed);
  }, [dismissed]);

  function dismissAll() {
    const next = new Set(dismissed);
    all.forEach((n) => next.add(n.id));
    setDismissed(next);
  }

  function dismissOne(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function handleClick(n: Notification) {
    dismissOne(n.id);
    setOpen(false);
    navigate(n.href);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-1 rounded-full hover:bg-gray-100 transition-colors focus:outline-none">
          <Bell className={count > 0 ? "text-gray-700" : "text-gray-400"} size={20} />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold text-gray-900">Notificações</span>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-0.5 px-2 text-xs text-gray-500 hover:text-gray-700"
              onClick={dismissAll}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Marcar todas como lidas
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <Bell className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            visible.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b last:border-b-0"
              >
                <div className="mt-0.5 shrink-0">{typeIcon[n.type]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{distanceUTC(n.timestamp)}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
