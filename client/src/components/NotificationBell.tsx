import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, Check, X, ScanSearch, GitCompareArrows, ClipboardCheck, FileCheck, FileX, Clock } from "lucide-react";
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

// read: { id → readAt (ms) }  — lidas mas ainda visíveis
// deleted: id[]               — removidas definitivamente
const STORAGE_READ_KEY    = "tributai_read_notifications";
const STORAGE_DELETED_KEY = "tributai_deleted_notifications";

function loadRead(): Map<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_READ_KEY);
    return new Map(raw ? JSON.parse(raw) : []);
  } catch { return new Map(); }
}

function saveRead(map: Map<string, number>) {
  const arr = Array.from(map.entries()).slice(-200);
  localStorage.setItem(STORAGE_READ_KEY, JSON.stringify(arr));
}

function loadDeleted(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_DELETED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveDeleted(set: Set<string>) {
  localStorage.setItem(STORAGE_DELETED_KEY, JSON.stringify(Array.from(set).slice(-200)));
}

const typeIcon: Record<Notification["type"], React.ReactNode> = {
  scan_completed:      <ScanSearch className="h-4 w-4 text-green-500" />,
  ncm_changes:         <GitCompareArrows className="h-4 w-4 text-amber-500" />,
  scan_request_update: <ClipboardCheck className="h-4 w-4 text-blue-500" />,
  upload_processed:    <FileCheck className="h-4 w-4 text-green-600" />,
  ncm_pending_scan:    <Clock className="h-4 w-4 text-orange-500" />,
};

function notificationIcon(n: Notification) {
  if (n.type === "upload_processed" && n.title.includes("Erro"))
    return <FileX className="h-4 w-4 text-red-500" />;
  return typeIcon[n.type];
}

export function NotificationBell() {
  const [, navigate] = useLocation();
  const [read, setRead]       = useState<Map<string, number>>(loadRead);
  const [deleted, setDeleted] = useState<Set<string>>(loadDeleted);
  const [open, setOpen]       = useState(false);

  const { data: all = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30_000,
  });

  // Notificações visíveis (não deletadas)
  const visible = all.filter((n) => n.type !== "ncm_pending_scan" && !deleted.has(n.id));

  // Separa não lidas e lidas; lidas ordenadas pela mais recente no topo
  const unread  = visible.filter((n) => !read.has(n.id));
  const readList = visible
    .filter((n) => read.has(n.id))
    .sort((a, b) => (read.get(b.id) ?? 0) - (read.get(a.id) ?? 0));

  const unreadCount = unread.length;

  useEffect(() => { saveRead(read); },    [read]);
  useEffect(() => { saveDeleted(deleted); }, [deleted]);

  function markRead(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setRead((prev) => {
      const next = new Map(prev);
      next.set(id, Date.now());
      return next;
    });
  }

  function markAllRead() {
    const now = Date.now();
    setRead((prev) => {
      const next = new Map(prev);
      unread.forEach((n) => next.set(n.id, now));
      return next;
    });
  }

  function deleteOne(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleted((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setRead((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  function handleClick(n: Notification) {
    // Clicar na notificação não lida: marca como lida e navega
    if (!read.has(n.id)) {
      setRead((prev) => {
        const next = new Map(prev);
        next.set(n.id, Date.now());
        return next;
      });
    }
    setOpen(false);
    navigate(n.href);
  }

  function NotificationRow({ n, isRead }: { n: Notification; isRead: boolean }) {
    return (
      <div
        onClick={() => !isRead && handleClick(n)}
        className={[
          "group relative flex items-start gap-3 px-4 py-3 border-b last:border-b-0 transition-colors",
          isRead ? "opacity-40 bg-gray-50 cursor-default" : "hover:bg-gray-50 cursor-pointer",
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

        {/* Não lida: botão ✓ para marcar como lida */}
        {!isRead && (
          <button
            onClick={(e) => markRead(n.id, e)}
            title="Marcar como lida"
            className="shrink-0 mt-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-opacity focus:outline-none"
          >
            <Check className="h-3.5 w-3.5 text-gray-400" />
          </button>
        )}

        {/* Lida: botão X para excluir */}
        {isRead && (
          <button
            onClick={(e) => deleteOne(n.id, e)}
            title="Remover notificação"
            className="shrink-0 mt-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-opacity focus:outline-none"
          >
            <X className="h-3.5 w-3.5 text-gray-400" />
          </button>
        )}
      </div>
    );
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
              onClick={markAllRead}
            >
              <Check className="h-3 w-3 mr-1" />
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
            <>
              {unread.map((n) => <NotificationRow key={n.id} n={n} isRead={false} />)}

              {readList.length > 0 && (
                <>
                  {unread.length > 0 && (
                    <div className="px-4 py-1.5 bg-gray-50 border-b">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Lidas</p>
                    </div>
                  )}
                  {readList.map((n) => <NotificationRow key={n.id} n={n} isRead={true} />)}
                </>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
