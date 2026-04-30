import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, CheckCheck, X, ScanSearch, GitCompareArrows, ClipboardCheck, FileCheck, FileX, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { distanceUTC } from "@/lib/dateUtils";

interface Notification {
  id: string;
  type: "scan_completed" | "ncm_changes" | "scan_request_update" | "upload_processed" | "ncm_pending_scan";
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
  const arr = Array.from(ids).slice(-200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

const typeIcon: Record<Notification["type"], React.ReactNode> = {
  scan_completed:      <ScanSearch className="h-4 w-4 text-green-500" />,
  ncm_changes:         <GitCompareArrows className="h-4 w-4 text-amber-500" />,
  scan_request_update: <ClipboardCheck className="h-4 w-4 text-blue-500" />,
  upload_processed:    <FileCheck className="h-4 w-4 text-green-600" />,
  ncm_pending_scan:    <Clock className="h-4 w-4 text-orange-500" />,
};

function notificationIcon(n: Notification) {
  if (n.type === "upload_processed" && n.title.includes("Erro")) {
    return <FileX className="h-4 w-4 text-red-500" />;
  }
  return typeIcon[n.type];
}

export function NotificationBell() {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed);
  const [open, setOpen] = useState(false);

  const { data: all = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30_000,
  });

  const unreadCount = all.filter((n) => !dismissed.has(n.id)).length;

  useEffect(() => {
    saveDismissed(dismissed);
  }, [dismissed]);

  function dismissAll() {
    const next = new Set(dismissed);
    all.forEach((n) => next.add(n.id));
    setDismissed(next);
  }

  function dismissOne(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function handleClick(n: Notification) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(n.id);
      return next;
    });
    setOpen(false);
    navigate(n.href);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-1 rounded-full hover:bg-gray-100 transition-colors focus:outline-none">
          <Bell className={unreadCount > 0 ? "text-gray-700" : "text-gray-400"} size={20} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold text-gray-900">Notificações</span>
          {unreadCount > 0 && (
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
          {all.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <Bell className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            all.map((n) => {
              const isRead = dismissed.has(n.id);
              return (
                <div
                  key={n.id}
                  onClick={() => !isRead && handleClick(n)}
                  className={[
                    "group relative flex items-start gap-3 px-4 py-3 border-b last:border-b-0 transition-colors",
                    isRead
                      ? "opacity-40 bg-gray-50 cursor-default"
                      : "hover:bg-gray-50 cursor-pointer",
                  ].join(" ")}
                >
                  <div className="mt-0.5 shrink-0">{notificationIcon(n)}</div>

                  <div className="flex-1 min-w-0">
                    <p className={["text-sm font-medium truncate", isRead ? "text-gray-500" : "text-gray-900"].join(" ")}>
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{distanceUTC(n.timestamp)}</p>
                  </div>

                  {!isRead && (
                    <button
                      onClick={(e) => dismissOne(n.id, e)}
                      className="shrink-0 mt-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-opacity focus:outline-none"
                      title="Marcar como lida"
                    >
                      <X className="h-3.5 w-3.5 text-gray-400" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
