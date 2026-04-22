import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock } from "lucide-react";

interface ScheduleConfig {
  enabled: boolean;
  frequency: "weekly" | "monthly";
  dayOfWeek: number;   // 0–6
  dayOfMonth: number;  // 1–28
  hour: number;
  minute: number;
  mode: "incompletos" | "todos";
}

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

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: String(i).padStart(2, "0"),
}));

const MINUTES = [
  { value: "0", label: "00" },
  { value: "15", label: "15" },
  { value: "30", label: "30" },
  { value: "45", label: "45" },
];

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

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEFAULT: ScheduleConfig = {
  enabled: false,
  frequency: "weekly",
  dayOfWeek: 1,
  dayOfMonth: 1,
  hour: 8,
  minute: 0,
  mode: "incompletos",
};

export function ScheduleModal({ open, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cfg, setCfg] = useState<ScheduleConfig>(DEFAULT);

  const { data: saved, isLoading } = useQuery<ScheduleConfig | null>({
    queryKey: ["/api/ncm-scan/schedule"],
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
      toast({ title: "Agendamento salvo!", description: cfg.enabled ? `Próxima execução: ${nextExecution(cfg)}` : "Agendamento desativado." });
      onClose();
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível salvar o agendamento.", variant: "destructive" });
    },
  });

  const set = <K extends keyof ScheduleConfig>(key: K, value: ScheduleConfig[K]) =>
    setCfg(prev => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-blue-600" />
            Agendamento Automático de Varredura
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-gray-500 text-sm">Carregando configuração...</div>
        ) : (
          <div className="space-y-5 py-2">
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

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
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
