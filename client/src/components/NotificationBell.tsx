import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, Check, X, ScanSearch, GitCompareArrows, ClipboardCheck, FileCheck, FileX, Clock, Loader2, CalendarClock, ClipboardList, CalendarCheck, ThumbsUp, ThumbsDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { distanceUTC } from "@/lib/dateUtils";

interface Notification {
  id: string;
  type: "scan_completed" | "ncm_changes" | "scan_request_update" | "upload_processed" | "ncm_pending_scan" | "scan_running" | "scan_scheduled" | "scan_request_pending" | "schedule_configured" | "ncm_change_resolved";
  title: string;
  message: string;
  timestamp: string;
  href: string;
  live?: boolean;
  readAt?: string | null;
}

const typeIcon: Record<Notification["type"], React.ReactNode> = {
  scan_completed:        <ScanSearch className="h-4 w-4 text-green-500" />,
  ncm_changes:           <GitCompareArrows className="h-4 w-4 text-amber-500" />,
  scan_request_update:   <ClipboardCheck className="h-4 w-4 text-blue-500" />,
  upload_processed:      <FileCheck className="h-4 w-4 text-green-600" />,
  ncm_pending_scan:      <Clock className="h-4 w-4 text-orange-500" />,
  scan_running:          <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  scan_scheduled:        <CalendarClock className="h-4 w-4 text-purple-500" />,
  scan_request_pending:  <ClipboardList className="h-4 w-4 text-orange-500" />,
  schedule_configured:   <CalendarCheck className="h-4 w-4 text-purple-500" />,
  ncm_change_resolved:   <ThumbsUp className="h-4 w-4 text-green-500" />,
};

function notificationIcon(n: Notification) {
  if (n.type === "upload_processed" && n.title.includes("Erro"))
    return <FileX className="h-4 w-4 text-red-500" />;
  if (n.type === "ncm_change_resolved" && n.title.includes("rejeitada"))
    return <ThumbsDown className="h-4 w-4 text-red-400" />;
  if (n.type === "schedule_configured" && n.title.includes("desativado"))
    return <CalendarCheck className="h-4 w-4 text-gray-400" />;
  return typeIcon[n.type];
}

export function NotificationBell() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: all = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30_000,
  });

  // Mutations — atualização otimista via invalidação
  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: "POST", credentials: "include",
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await fetch("/api/notifications/read-all", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
        method: "DELETE", credentials: "include",
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  // Notificações "ao vivo" — sempre visíveis no topo, sem controles
  const liveNotifs = all.filter((n) => n.live);

  // Notificações persistentes (tipo ncm_pending_scan legacy ignorado)
  const persistent = all.filter((n) => !n.live && n.type !== "ncm_pending_scan");

  const unread   = persistent.filter((n) => !n.readAt);
  const readList = persistent
    .filter((n) => !!n.readAt)
    .sort((a, b) => new Date(b.readAt!).getTime() - new Date(a.readAt!).getTime());

  const unreadCount = unread.length + liveNotifs.length;

  function handleClick(n: Notification) {
    if (!n.readAt) markReadMutation.mutate(n.id);
    setOpen(false);
    navigate(n.href);
  }

  function markRead(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    markReadMutation.mutate(id);
  }

  function deleteOne(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    deleteMutation.mutate(id);
  }

  function markAllRead() {
    const ids = unread.map((n) => n.id);
    if (ids.length > 0) markAllReadMutation.mutate(ids);
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
          {unread.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-0.5 px-2 text-xs text-gray-500 hover:text-gray-700"
              onClick={markAllRead}
              disabled={markAllReadMutation.isPending}
            >
              <Check className="h-3 w-3 mr-1" />
              Marcar todas como lidas
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {liveNotifs.length === 0 && persistent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <Bell className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            <>
              {/* Notificações ao vivo — topo, sem controles */}
              {liveNotifs.length > 0 && (
                <>
                  <div className="px-4 py-1.5 bg-blue-50 border-b">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-400">Agora</p>
                  </div>
                  {liveNotifs.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => { setOpen(false); navigate(n.href); }}
                      className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-blue-50 cursor-pointer transition-colors bg-blue-50/40"
                    >
                      <div className="mt-0.5 shrink-0">{notificationIcon(n)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Notificações persistentes */}
              {persistent.length > 0 && (
                <>
                  {liveNotifs.length > 0 && (
                    <div className="px-4 py-1.5 bg-gray-50 border-b">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Notificações</p>
                    </div>
                  )}
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
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
