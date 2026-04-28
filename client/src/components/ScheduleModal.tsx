import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, History, User2, XCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { formatUTC, distanceUTC } from "@/lib/dateUtils";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface ScheduleConfig {
  enabled: boolean;
  frequency: "weekly" | "monthly";
  dayOfWeek: number;   // 0–6
  dayOfMonth: number;  // 1–28
  hour: number;
  minute: number;
  mode: "incompletos" | "todos";
}

interface ScheduleHistoryEntry {
  id: number;
  createdAt: string;
  userName: string;
  action: "SCHEDULE_CONFIGURED" | "SCHEDULE_CANCELLED";
  details: Record<string, any> | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
];

const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: `Dia ${i + 1}`,
}));

const FREQ_LABEL: Record<string, string> = { weekly: "Semanal", monthly: "Mensal" };
const MODE_LABEL: Record<string, string> = { incompletos: "Pendentes", todos: "Todos os NCMs" };
const DOW_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const DEFAULT: ScheduleConfig = {
  enabled: false,
  frequency: "weekly",
  dayOfWeek: 1,
  dayOfMonth: 1,
  hour: 8,
  minute: 0,
  mode: "incompletos",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextExecution(cfg: ScheduleConfig): string {
  if (!cfg.enabled) return "—";
  const now = new Date();
  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setHours(cfg.hour, cfg.minute);

  if (cfg.frequency === "weekly") {
    const dow = cfg.dayOfWeek;
    const diff = (dow - now.getDay() + 7) % 7 || (
      now.getHours() > cfg.hour ||
      (now.getHours() === cfg.hour && now.getMinutes() >= cfg.minute) ? 7 : 0
    );
    target.setDate(now.getDate() + diff);
  } else {
    target.setDate(cfg.dayOfMonth);
    if (target <= now) target.setMonth(target.getMonth() + 1);
  }

  return target.toLocaleString("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function formatHistoryDetails(entry: ScheduleHistoryEntry): string {
  if (entry.action === "SCHEDULE_CANCELLED") return "Agendamento cancelado";
  const d = entry.details;
  if (!d) return "—";
  if (!d.enabled) return "Agendamento desativado";
  const freq = FREQ_LABEL[d.frequency] ?? d.frequency;
  const day = d.frequency === "weekly"
    ? DOW_LABEL[d.dayOfWeek] ?? `Dia ${d.dayOfWeek}`
    : `Dia ${d.dayOfMonth}`;
  const time = `${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`;
  const mode = MODE_LABEL[d.mode] ?? d.mode;
  return `${freq} • ${day} • ${time} • ${mode}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ScheduleModal({ open, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cfg, setCfg] = useState<ScheduleConfig>(DEFAULT);
  const [activeTab, setActiveTab] = useState("config");
  const [restoredFrom, setRestoredFrom] = useState<number | null>(null);

  const { data: saved, isLoading } = useQuery<ScheduleConfig | null>({
    queryKey: ["/api/ncm-scan/schedule"],
    enabled: open,
  });

  const { data: scheduleHistory = [] } = useQuery<ScheduleHistoryEntry[]>({
    queryKey: ["/api/ncm-scan/schedule/history"],
    enabled: open,
  });

  useEffect(() => {
    if (saved) setCfg(saved);
    else if (saved === null) setCfg(DEFAULT);
  }, [saved]);

  const saveMutation = useMutation({
    mutationFn: async (data: ScheduleConfig) => {
      const res = await fetch("/api/ncm-scan/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ncm-scan/schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ncm-scan/schedule/history"] });
      toast({ title: "Agendamento salvo!", description: cfg.enabled ? `Próxima execução: ${nextExecution(cfg)}` : "Agendamento desativado." });
      onClose();
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível salvar o agendamento.", variant: "destructive" });
    },
  });

  const set = <K extends keyof ScheduleConfig>(key: K, value: ScheduleConfig[K]) =>
    setCfg(prev => ({ ...prev, [key]: value }));

  function applyFromHistory(entry: ScheduleHistoryEntry) {
    const d = entry.details;
    if (!d) return;
    setCfg({
      enabled:    !!d.enabled,
      frequency:  d.frequency  ?? "weekly",
      dayOfWeek:  d.dayOfWeek  ?? 1,
      dayOfMonth: d.dayOfMonth ?? 1,
      hour:       d.hour       ?? 8,
      minute:     d.minute     ?? 0,
      mode:       d.mode       ?? "incompletos",
    });
    setRestoredFrom(entry.id);
    setActiveTab("config");
  }

  function handleClose() {
    setRestoredFrom(null);
    setActiveTab("config");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-blue-600" />
            Agendamento Automático de Varredura
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); if (v === "config") {} }} className="w-full">
          {/* Tab triggers */}
          <TabsList className="w-full grid grid-cols-2 mb-4">
            <TabsTrigger value="config" className="flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" />
              Configuração
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              Histórico
              {scheduleHistory.length > 0 && (
                <span className="ml-1 rounded-full bg-blue-100 text-blue-600 text-xs px-1.5 py-0.5 font-semibold leading-none">
                  {scheduleHistory.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Aba: Configuração ── */}
          <TabsContent value="config">
            {isLoading ? (
              <div className="py-8 text-center text-gray-500 text-sm">Carregando configuração...</div>
            ) : (
              <div className="space-y-5">
                {/* Banner: configuração restaurada do histórico */}
                {restoredFrom !== null && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    Configuração anterior carregada — revise e clique em <strong className="ml-0.5">Salvar</strong> para aplicar.
                    <button
                      className="ml-auto text-amber-500 hover:text-amber-700 transition-colors"
                      onClick={() => setRestoredFrom(null)}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Toggle */}
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Agendamento ativo</Label>
                  <Switch
                    checked={cfg.enabled}
                    onCheckedChange={v => set("enabled", v)}
                  />
                </div>

                <div className={cfg.enabled ? "" : "opacity-40 pointer-events-none"}>
                  {/* Frequência */}
                  <div className="space-y-1 mb-4">
                    <Label className="text-sm">Frequência</Label>
                    <Select value={cfg.frequency} onValueChange={v => set("frequency", v as "weekly" | "monthly")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Dia */}
                  <div className="space-y-1 mb-4">
                    <Label className="text-sm">
                      {cfg.frequency === "weekly" ? "Dia da semana" : "Dia do mês"}
                    </Label>
                    {cfg.frequency === "weekly" ? (
                      <Select value={String(cfg.dayOfWeek)} onValueChange={v => set("dayOfWeek", Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DAYS_OF_WEEK.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={String(cfg.dayOfMonth)} onValueChange={v => set("dayOfMonth", Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DAYS_OF_MONTH.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Horário */}
                  <div className="space-y-1 mb-4">
                    <Label className="text-sm">Horário</Label>
                    <div className="flex items-center gap-2">
                      <div className="relative w-24">
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          value={cfg.hour}
                          onChange={e => {
                            const v = Math.min(23, Math.max(0, Number(e.target.value)));
                            set("hour", v);
                          }}
                          className="pr-7 text-center"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">h</span>
                      </div>
                      <span className="text-gray-500 font-medium">:</span>
                      <div className="relative w-24">
                        <Input
                          type="number"
                          min={0}
                          max={59}
                          value={cfg.minute}
                          onChange={e => {
                            const v = Math.min(59, Math.max(0, Number(e.target.value)));
                            set("minute", v);
                          }}
                          className="pr-9 text-center"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">min</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">Hora: 0–23 · Minuto: 0–59</p>
                  </div>

                  {/* Modo */}
                  <div className="space-y-1 mb-4">
                    <Label className="text-sm">Modo de varredura</Label>
                    <Select value={cfg.mode} onValueChange={v => set("mode", v as "incompletos" | "todos")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="incompletos">Buscar Pendentes</SelectItem>
                        <SelectItem value="todos">Buscar Todos (detecta mudanças)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Próxima execução */}
                  <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-800">
                    <span className="font-medium">Próxima execução:</span>{" "}
                    {nextExecution(cfg)}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Aba: Histórico ── */}
          <TabsContent value="history">
            {scheduleHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
                <History className="w-10 h-10 text-gray-200" />
                <p className="text-sm font-medium text-gray-500">Nenhuma configuração registrada</p>
                <p className="text-xs text-center text-gray-400">
                  As configurações salvas aparecerão aqui com data, horário e responsável.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {scheduleHistory.map((entry) => {
                  const isCancelled = entry.action === "SCHEDULE_CANCELLED";
                  const isDisabled = !isCancelled && entry.details && !entry.details.enabled;
                  const isActive = !isCancelled && !isDisabled;

                  return (
                    <div
                      key={entry.id}
                      className={`rounded-lg border px-4 py-3 ${
                        isActive
                          ? "border-blue-100 bg-blue-50"
                          : "border-gray-100 bg-gray-50"
                      }`}
                    >
                      {/* Linha principal: ícone + descrição + data */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {isActive
                            ? <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                            : <XCircle className="w-4 h-4 text-gray-400 shrink-0" />
                          }
                          <p className={`text-sm font-medium truncate ${isActive ? "text-blue-800" : "text-gray-600"}`}>
                            {formatHistoryDetails(entry)}
                          </p>
                        </div>
                        <p className="text-xs text-gray-400 whitespace-nowrap shrink-0 mt-0.5">
                          {formatUTC(entry.createdAt, "dd/MM/yyyy HH:mm")}
                        </p>
                      </div>

                      {/* Linha secundária: usuário + tempo relativo + botão Usar */}
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
                        <User2 className="w-3 h-3 shrink-0" />
                        <span>{entry.userName}</span>
                        <span className="text-gray-300">·</span>
                        <span>{distanceUTC(entry.createdAt)}</span>
                        {entry.details && (
                          <button
                            onClick={() => applyFromHistory(entry)}
                            className="ml-auto flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Usar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button
            onClick={() => saveMutation.mutate(cfg)}
            disabled={saveMutation.isPending || isLoading}
          >
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
