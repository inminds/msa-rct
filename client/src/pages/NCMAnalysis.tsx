import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, RefreshCw, ScanSearch, ScanLine, Loader2, X,
  CheckCircle2, CalendarClock, Clock, XCircle, CheckCheck, AlertCircle, Send, Eye,
  History, ShieldCheck, ChevronLeft, ChevronRight, Info,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { ScheduleModal } from "@/components/ScheduleModal";

interface NCMRow {
  NCM: string;
  "NCM Econet": string;
  "Descrição": string;
  "PIS Cumulativo": string;
  "COFINS Cumulativo": string;
  "PIS Não Cumulativo": string;
  "COFINS Não Cumulativo": string;
  "Regime": string;
  "Legislação": string;
  [key: string]: string;
}

interface NCMChange {
  id: number;
  ncm: string;
  field: string;
  oldValue: string;
  newValue: string;
  status: "pending" | "accepted" | "rejected";
  scanDate: string;
  resolvedAt: string | null;
}

interface LastScan {
  triggeredAt: string;
  triggeredBy: string;
  action: string;
  details: Record<string, any> | null;
  changesDate: string | null;
  changes: {
    ncm: string; field: string;
    oldValue: string; newValue: string;
    status: "pending" | "accepted" | "rejected";
  }[];
}

interface ScanRequest {
  id: number;
  requestedBy: string;
  requestedByName?: string;
  mode: "incompletos" | "todos";
  status: "pending_thayssa" | "pending_yuri" | "approved" | "rejected";
  rejectedBy?: string;
  rejectionNote?: string;
  createdAt: string;
}

function isPreenchido(row: NCMRow): boolean {
  return !!(row["PIS Cumulativo"] || row["PIS Não Cumulativo"]);
}

function RequestStatusCard({
  request,
  onNewRequest,
  onDismiss,
}: {
  request: ScanRequest;
  onNewRequest: () => void;
  onDismiss: () => void;
}) {
  if (request.status === "pending_thayssa") {
    return (
      <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-800">
        <Clock className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium flex-1">Aguardando aprovação da <strong>Thayssa</strong> — solicitação de varredura enviada.</span>
        <button onClick={onDismiss} className="text-yellow-500 hover:text-yellow-700 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }
  if (request.status === "pending_yuri") {
    return (
      <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-orange-800">
        <Clock className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium flex-1">Thayssa aprovou. Aguardando aprovação do <strong>Yuri</strong>.</span>
        <button onClick={onDismiss} className="text-orange-500 hover:text-orange-700 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }
  if (request.status === "approved") {
    return (
      <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium flex-1">Solicitação aprovada! A varredura foi iniciada.</span>
        <button onClick={onDismiss} className="text-green-500 hover:text-green-700 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }
  if (request.status === "rejected") {
    const rejectorName = request.rejectedBy === "thayssa" ? "Thayssa" : "Yuri";
    return (
      <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium flex-1">
          Solicitação rejeitada por <strong>{rejectorName}</strong>.
          {request.rejectionNote && <span className="ml-1 italic">"{request.rejectionNote}"</span>}
        </span>
        <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100 text-xs" onClick={onNewRequest}>
          Novo Pedido
        </Button>
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600 transition-colors ml-1">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }
  return null;
}

const PAGE_SIZE_OPTIONS = [
  { label: "10 por página", value: 10 },
  { label: "20 por página", value: 20 },
  { label: "50 por página", value: 50 },
  { label: "100 por página", value: 100 },
  { label: "Todos", value: 0 },
];

export default function NCMAnalysis() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedNCMs, setSelectedNCMs] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNCM, setSelectedNCM] = useState<NCMRow | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [scanLabel, setScanLabel] = useState("");
  const [rejectTarget, setRejectTarget] = useState<{ id: number; name: string } | null>(null);
  const [requestDismissed, setRequestDismissed] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [lastScanOpen, setLastScanOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery<any>({ queryKey: ["/api/auth/user"] });

  const { data: lastScan, refetch: refetchLastScan } = useQuery<LastScan | null>({
    queryKey: ["/api/ncm-scan/last"],
    refetchInterval: 60_000,
  });
  const isAdmin = currentUser?.role === "ADMIN";

  const { data: ncmRows, isLoading, refetch } = useQuery<NCMRow[]>({
    queryKey: ["/api/ncm-excel"],
  });

  // Dados completos (todas as colunas do Excel) — usados apenas no modal de detalhe
  const { data: ncmRowsFull } = useQuery<Record<string, string>[]>({
    queryKey: ["/api/ncm-excel-full"],
  });

  // Histórico de mudanças do NCM selecionado
  const { data: ncmHistory = [] } = useQuery<NCMChange[]>({
    queryKey: ["/api/ncm-changes", "all", selectedNCM?.NCM],
    queryFn: async () => {
      if (!selectedNCM) return [];
      const res = await fetch(
        `/api/ncm-changes?status=all&ncm=${encodeURIComponent(selectedNCM.NCM)}`,
        { credentials: "include" }
      );
      return res.json();
    },
    enabled: !!selectedNCM,
  });

  // Pedido mais recente do USER logado (só para não-admins)
  const { data: myRequest, refetch: refetchMyRequest } = useQuery<ScanRequest | null>({
    queryKey: ["/api/scan-requests/mine"],
    refetchInterval: 10_000,
    enabled: currentUser !== undefined && !isAdmin,
  });

  // Pedidos pendentes para o ADMIN logado
  const { data: pendingRequests = [] } = useQuery<ScanRequest[]>({
    queryKey: ["/api/scan-requests/pending"],
    refetchInterval: 10_000,
    enabled: isAdmin === true,
  });

  // ── Scan status polling ──────────────────────────────────────────────────

  async function checkStatus() {
    try {
      const res = await fetch("/api/ncm-scan/status", { credentials: "include" });
      const data = await res.json();
      refetch();
      if (!data.running) stopPolling(true);
    } catch { /* ignore */ }
  }

  function startPolling(label: string) {
    setScanLabel(label);
    setScanning(true);
    setScanDone(false);
    pollRef.current = setInterval(checkStatus, 8_000);
    stopRef.current = setTimeout(() => stopPolling(false), 10 * 60 * 1000);
  }

  function stopPolling(completed = false) {
    if (pollRef.current) clearInterval(pollRef.current);
    if (stopRef.current) clearTimeout(stopRef.current);
    pollRef.current = null;
    stopRef.current = null;
    setScanning(false);
    if (completed) { setScanDone(true); refetchLastScan(); }
    refetch();
  }

  useEffect(() => () => { stopPolling(); }, []);

  // Verificação imediata ao montar: retoma indicador se varredura já está rodando
  useEffect(() => {
    async function checkOnMount() {
      try {
        const res = await fetch("/api/ncm-scan/status", { credentials: "include" });
        const data = await res.json();
        if (data.running) startPolling("Varredura em andamento...");
      } catch { /* ignore */ }
    }
    checkOnMount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset dismiss quando uma nova solicitação chega
  useEffect(() => { setRequestDismissed(false); }, [myRequest?.id]);

  // Auto-abrir modal se URL contém ?ncm=<code> (vindo do Dashboard)
  useEffect(() => {
    if (!ncmRows || ncmRows.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const ncmParam = params.get("ncm");
    if (ncmParam) {
      const row = ncmRows.find(r => r.NCM === ncmParam || r["NCM Econet"] === ncmParam);
      if (row) setSelectedNCM(row);
      // Limpa o param da URL sem reload
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [ncmRows]);

  // Background poll: detecta varreduras agendadas ou disparadas por aprovação
  useEffect(() => {
    const interval = setInterval(async () => {
      if (scanning) return;
      try {
        const res = await fetch("/api/ncm-scan/status", { credentials: "include" });
        const data = await res.json();
        if (data.running) startPolling("Varredura em andamento...");
      } catch { /* ignore */ }
    }, 20_000);
    return () => clearInterval(interval);
  }, [scanning]);

  // ── Mutations ────────────────────────────────────────────────────────────

  // ADMIN: disparo direto
  const triggerScan = useMutation({
    mutationFn: async (mode: "incompletos" | "todos") => {
      const res = await fetch("/api/ncm-scan/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error("Falha ao iniciar varredura");
      return res.json();
    },
    onSuccess: (_, mode) => {
      setScanDone(false);
      startPolling(mode === "todos" ? "Buscando todos os NCMs no Econet..." : "Buscando NCMs pendentes no Econet...");
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível iniciar a varredura.", variant: "destructive" }),
  });

  // ADMIN: varredura seletiva
  const triggerSelected = useMutation({
    mutationFn: async (ncms: string[]) => {
      const res = await fetch("/api/ncm-scan/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: "selecionados", ncms }),
      });
      if (!res.ok) throw new Error("Falha ao iniciar varredura");
      return res.json();
    },
    onSuccess: (_, ncms) => {
      setScanDone(false);
      setSelectedNCMs(new Set());
      setSelectionMode(false);
      startPolling(`Buscando ${ncms.length} NCM(s) selecionado(s) no Econet...`);
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível iniciar a varredura.", variant: "destructive" }),
  });

  // USER: solicitar varredura (mode ou ncms[] seletivo)
  const submitRequest = useMutation({
    mutationFn: async (payload: { mode: "incompletos" | "todos" } | { ncms: string[] }) => {
      const res = await fetch("/api/scan-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-requests/mine"] });
      const isSeletivo = "ncms" in payload;
      const desc = isSeletivo
        ? `${(payload as any).ncms.length} NCM(s) selecionado(s). Aguardando aprovação da Thayssa.`
        : "Aguardando aprovação da Thayssa.";
      toast({ title: "Solicitação enviada!", description: desc });
      if (isSeletivo) { setSelectedNCMs(new Set()); setSelectionMode(false); }
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ADMIN: aprovar
  const approveRequest = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/scan-requests/${id}/approve`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-requests/pending"] });
      if (data.newStatus === "approved") {
        toast({ title: "Aprovado!", description: "Varredura iniciada." });
        startPolling("Varredura aprovada em andamento...");
      } else {
        toast({ title: "Aprovado!", description: "Aguardando aprovação do Yuri." });
      }
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ADMIN: rejeitar
  const rejectRequest = useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      const res = await fetch(`/api/scan-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ note }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-requests/pending"] });
      setRejectTarget(null);
      setRejectNote("");
      toast({ title: "Solicitação rejeitada." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Derived state ────────────────────────────────────────────────────────

  const hasActiveRequest = !isAdmin && (myRequest?.status === "pending_thayssa" || myRequest?.status === "pending_yuri");

  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Reset página e seleção ao mudar filtros ou tamanho da página
  useEffect(() => { setCurrentPage(1); setSelectedNCMs(new Set()); setSelectionMode(false); }, [searchTerm, statusFilter, pageSize]);

  const filtered = ncmRows?.filter((row) => {
    const term = normalize(searchTerm.trim());
    const matchesSearch =
      !term ||
      row.NCM.includes(term) ||
      normalize(row["NCM Econet"] ?? "").includes(term) ||
      normalize(row["Descrição"] ?? "").includes(term) ||
      normalize(row["Regime"] ?? "").includes(term) ||
      normalize(row["Legislação"] ?? "").includes(term);
    const preenchido = isPreenchido(row);
    const matchesStatus =
      !statusFilter || statusFilter === "all" ||
      (statusFilter === "preenchido" && preenchido) ||
      (statusFilter === "pendente" && !preenchido);
    return matchesSearch && matchesStatus;
  });

  const totalItems = filtered?.length ?? 0;
  const showAll = pageSize === 0;
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = showAll
    ? filtered
    : filtered?.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Helpers de seleção — declarados APÓS paginated
  const pageNCMs = paginated?.map(r => r.NCM) ?? [];
  const allPageSelected = pageNCMs.length > 0 && pageNCMs.every(ncm => selectedNCMs.has(ncm));
  const somePageSelected = pageNCMs.some(ncm => selectedNCMs.has(ncm));

  function toggleRow(ncm: string) {
    setSelectedNCMs(prev => {
      const next = new Set(prev);
      next.has(ncm) ? next.delete(ncm) : next.add(ncm);
      return next;
    });
  }

  function togglePage() {
    setSelectedNCMs(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageNCMs.forEach(ncm => next.delete(ncm));
      } else {
        pageNCMs.forEach(ncm => next.add(ncm));
      }
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <TopBar title="NCMs Extraídos" subtitle="Visualize e gerencie a análise tributária dos códigos NCM identificados" />
          <div className="p-6"><div className="text-center">Carregando...</div></div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar title="NCMs Extraídos" subtitle="Visualize e gerencie a análise tributária dos códigos NCM identificados" />

        {/* Banner: varredura em andamento */}
        {scanning && (
          <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span className="text-sm font-medium flex-1">{scanLabel} A tabela atualiza automaticamente.</span>
            <button onClick={() => stopPolling(false)} className="text-blue-500 hover:text-blue-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Banner: varredura concluída */}
        {!scanning && scanDone && (
          <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium flex-1">Varredura concluída! Os dados foram atualizados.</span>
            <button onClick={() => setScanDone(false)} className="text-green-500 hover:text-green-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Card de status do pedido (apenas USER) */}
        {!isAdmin && myRequest && !requestDismissed && (
          <RequestStatusCard
            request={myRequest}
            onNewRequest={() => {
              setRequestDismissed(false);
              queryClient.invalidateQueries({ queryKey: ["/api/scan-requests/mine"] });
            }}
            onDismiss={() => setRequestDismissed(true)}
          />
        )}

        <div className="p-6 space-y-6">

          {/* Painel de solicitações pendentes (apenas ADMIN quando há pendências) */}
          {isAdmin && pendingRequests.length > 0 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-orange-800 flex items-center gap-2 text-base">
                  <Clock className="w-5 h-5" />
                  Solicitações Pendentes ({pendingRequests.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-lg p-3 border border-orange-100">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-gray-900 text-sm">{req.requestedByName}</span>
                      <span className="text-xs text-gray-500">
                        {req.mode === "todos" ? "Buscar Todos os NCMs" : "Buscar NCMs Pendentes"} •{" "}
                        {new Date(req.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {rejectTarget?.id === req.id ? (
                        <>
                          <Input
                            placeholder="Motivo da rejeição (opcional)"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            className="h-8 text-sm w-56"
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={rejectRequest.isPending}
                            onClick={() => rejectRequest.mutate({ id: req.id, note: rejectNote })}
                          >
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setRejectTarget(null); setRejectNote(""); }}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            disabled={approveRequest.isPending}
                            onClick={() => approveRequest.mutate(req.id)}
                          >
                            <CheckCheck className="w-4 h-4 mr-1" /> Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                            onClick={() => { setRejectTarget({ id: req.id, name: req.requestedByName ?? req.requestedBy }); setRejectNote(""); }}
                          >
                            <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Filtros + botões de ação */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
                {/* Busca */}
                <div className="flex-1 min-w-[180px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Buscar por NCM ou descrição..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                {/* Filtro */}
                <div className="sm:w-48">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrar por status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="preenchido">Preenchidos</SelectItem>
                      <SelectItem value="pendente">Pendentes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Atualizar
                </Button>

                {/* Botão de agendamento (apenas ADMIN) */}
                {isAdmin && (
                  <Button
                    variant="outline"
                    className="text-purple-700 border-purple-300 hover:bg-purple-50"
                    onClick={() => setScheduleOpen(true)}
                  >
                    <CalendarClock className="w-4 h-4 mr-2" />
                    Agendar Varredura
                  </Button>
                )}

                {/* Botões condicionais: ADMIN dispara direto, USER solicita */}
                {isAdmin ? (
                  <>
                    <Button
                      variant="outline"
                      className="text-blue-700 border-blue-300 hover:bg-blue-50"
                      disabled={triggerScan.isPending || scanning}
                      onClick={() => triggerScan.mutate("todos")}
                    >
                      {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScanSearch className="w-4 h-4 mr-2" />}
                      Buscar Todos
                    </Button>
                    <Button
                      variant="outline"
                      className={selectionMode
                        ? "text-gray-700 border-gray-400 bg-gray-100 hover:bg-gray-200"
                        : "text-indigo-700 border-indigo-300 hover:bg-indigo-50"}
                      disabled={scanning}
                      onClick={() => {
                        setSelectionMode(v => !v);
                        setSelectedNCMs(new Set());
                      }}
                    >
                      <ScanLine className="w-4 h-4 mr-2" />
                      {selectionMode ? "Cancelar Seleção" : "Selecionar NCMs"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="text-blue-700 border-blue-300 hover:bg-blue-50"
                      disabled={submitRequest.isPending || hasActiveRequest}
                      onClick={() => submitRequest.mutate({ mode: "todos" })}
                      title={hasActiveRequest ? "Você já tem uma solicitação ativa" : ""}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Solicitar Varredura
                    </Button>
                    <Button
                      variant="outline"
                      className={selectionMode
                        ? "text-gray-700 border-gray-400 bg-gray-100 hover:bg-gray-200"
                        : "text-indigo-700 border-indigo-300 hover:bg-indigo-50"}
                      disabled={scanning}
                      onClick={() => {
                        setSelectionMode(v => !v);
                        setSelectedNCMs(new Set());
                      }}
                    >
                      <ScanLine className="w-4 h-4 mr-2" />
                      {selectionMode ? "Cancelar Seleção" : "Selecionar NCMs"}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabela de NCMs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle>
                    Análises de NCM
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({totalItems} resultado{totalItems !== 1 ? "s" : ""})
                    </span>
                  </CardTitle>

                  {/* Chip — última varredura */}
                  {lastScan && (
                    <button
                      onClick={() => setLastScanOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      Última varredura:{" "}
                      <span className="font-medium text-gray-700">
                        {formatDistanceToNow(new Date(lastScan.triggeredAt), { addSuffix: true, locale: ptBR })}
                      </span>
                      <Info className="w-3.5 h-3.5 ml-0.5 text-blue-400" />
                    </button>
                  )}
                </div>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => setPageSize(Number(v))}
                >
                  <SelectTrigger className="w-40 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {selectionMode && (
                        <th className="px-4 py-3 w-10">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            checked={allPageSelected}
                            ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                            onChange={togglePage}
                            disabled={scanning}
                            title="Selecionar página atual"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NCM</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PIS Cum.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">COFINS Cum.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PIS N.Cum.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">COFINS N.Cum.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Regime</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginated?.map((row, idx) => {
                      const preenchido = isPreenchido(row);
                      const isSelected = selectedNCMs.has(row.NCM);
                      return (
                        <tr key={idx} className={`hover:bg-gray-50 ${selectionMode && isSelected ? "bg-blue-50" : ""}`}>
                          {selectionMode && (
                            <td className="px-4 py-4 w-10">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                checked={isSelected}
                                disabled={scanning}
                                onChange={() => toggleRow(row.NCM)}
                              />
                            </td>
                          )}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="font-mono text-sm font-medium text-gray-900">{row.NCM}</div>
                            {row["NCM Econet"] && row["NCM Econet"] !== row.NCM && (
                              <div className="text-xs text-gray-400">{row["NCM Econet"]}</div>
                            )}
                          </td>
                          <td className="px-4 py-4 max-w-xs">
                            <div className="text-sm text-gray-900 truncate" title={row["Descrição"]}>
                              {row["Descrição"] || <span className="text-gray-400 italic">—</span>}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                            {row["PIS Cumulativo"] || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                            {row["COFINS Cumulativo"] || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                            {row["PIS Não Cumulativo"] || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                            {row["COFINS Não Cumulativo"] || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                            {row["Regime"] || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {preenchido ? (
                              <Badge className="bg-green-100 text-green-800">Preenchido</Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-800">Pendente</Badge>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedNCM(row)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalItems === 0 && (
                <div className="text-center py-12">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum resultado encontrado</h3>
                  <p className="text-gray-600">Tente ajustar os filtros ou fazer novos uploads de arquivos.</p>
                </div>
              )}

              {/* Paginação */}
              {!showAll && totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-2">
                  <p className="text-sm text-gray-500">
                    Exibindo {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, totalItems)} de {totalItems}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                      .reduce<(number | "...")[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((item, i) =>
                        item === "..." ? (
                          <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm">…</span>
                        ) : (
                          <button
                            key={item}
                            onClick={() => setCurrentPage(item as number)}
                            className={`min-w-[32px] h-8 px-2 rounded text-sm font-medium transition-colors ${
                              safePage === item
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-gray-100 text-gray-700"
                            }`}
                          >
                            {item}
                          </button>
                        )
                      )}

                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />

      {/* Modal — última varredura */}
      <Dialog open={lastScanOpen} onOpenChange={setLastScanOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ScanSearch className="w-5 h-5 text-blue-500" />
              Última Varredura
            </DialogTitle>
          </DialogHeader>

          {lastScan && (
            <div className="overflow-auto flex-1 space-y-5 mt-1">

              {/* Info geral */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Data/Hora</p>
                  <p className="font-medium text-gray-900">
                    {format(new Date(lastScan.triggeredAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDistanceToNow(new Date(lastScan.triggeredAt), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Iniciada por</p>
                  <p className="font-medium text-gray-900">
                    {lastScan.action === "SCAN_AUTO_TRIGGERED" ? "Sistema (automático)" : lastScan.triggeredBy}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {lastScan.action === "SCAN_TRIGGERED_TODOS" && "Todos os NCMs"}
                    {lastScan.action === "SCAN_TRIGGERED_INCOMPLETOS" && "NCMs pendentes"}
                    {lastScan.action === "SCAN_TRIGGERED_SELECIONADOS" && "NCMs selecionados"}
                    {lastScan.action === "SCAN_AUTO_TRIGGERED" && "Disparada por upload"}
                    {lastScan.action === "SCAN_APPROVED_YURI" && "Solicitação aprovada"}
                  </p>
                </div>
              </div>

              {/* NCMs selecionados (se seletiva) */}
              {lastScan.details?.ncms && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">NCMs varridos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(lastScan.details.ncms as string[]).map((ncm) => (
                      <span key={ncm} className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-mono text-gray-700">
                        {ncm}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* NCMs novos (auto-scan) */}
              {lastScan.details?.newNcms?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">NCMs novos detectados no upload</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(lastScan.details.newNcms as string[]).map((ncm) => (
                      <span key={ncm} className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-mono text-blue-700">
                        {ncm}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Mudanças detectadas */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Mudanças detectadas
                  {lastScan.changes.length > 0 && (
                    <span className="ml-2 rounded-full bg-blue-100 text-blue-700 text-xs px-2 py-0.5 font-semibold normal-case">
                      {lastScan.changes.length}
                    </span>
                  )}
                </p>
                {lastScan.changes.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-green-700 text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Nenhuma mudança detectada — todos os dados estão atualizados.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse border border-gray-200 rounded overflow-hidden">
                      <thead>
                        <tr className="bg-blue-600 text-white">
                          <th className="px-3 py-2 text-left font-medium border border-blue-500">NCM</th>
                          <th className="px-3 py-2 text-left font-medium border border-blue-500">Campo</th>
                          <th className="px-3 py-2 text-left font-medium border border-blue-500">Antes</th>
                          <th className="px-3 py-2 text-left font-medium border border-blue-500">Depois</th>
                          <th className="px-3 py-2 text-left font-medium border border-blue-500">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastScan.changes.map((c, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="px-3 py-2 border border-gray-200 font-mono text-xs">{c.ncm}</td>
                            <td className="px-3 py-2 border border-gray-200 text-gray-700">{c.field}</td>
                            <td className="px-3 py-2 border border-gray-200">
                              <span className="line-through text-red-500 text-xs">{c.oldValue || "—"}</span>
                            </td>
                            <td className="px-3 py-2 border border-gray-200">
                              <span className="font-medium text-green-700 text-xs">{c.newValue || "—"}</span>
                            </td>
                            <td className="px-3 py-2 border border-gray-200">
                              {c.status === "pending" && <Badge className="bg-yellow-100 text-yellow-800 text-xs">Pendente</Badge>}
                              {c.status === "accepted" && <Badge className="bg-green-100 text-green-800 text-xs">Aceita</Badge>}
                              {c.status === "rejected" && <Badge className="bg-red-100 text-red-800 text-xs">Rejeitada</Badge>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Barra flutuante de varredura seletiva */}
      {selectionMode && selectedNCMs.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-gray-200 shadow-lg rounded-full px-5 py-3">
          <span className="text-sm font-medium text-gray-700">
            <span className="text-primary font-bold">{selectedNCMs.size}</span> NCM{selectedNCMs.size !== 1 ? "s" : ""} selecionado{selectedNCMs.size !== 1 ? "s" : ""}
          </span>
          <div className="w-px h-5 bg-gray-200" />
          {isAdmin ? (
            <Button
              size="sm"
              className="rounded-full bg-blue-600 hover:bg-blue-700 text-white h-8 px-4 text-xs"
              disabled={triggerSelected.isPending || scanning}
              onClick={() => triggerSelected.mutate(Array.from(selectedNCMs))}
            >
              {scanning ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <ScanSearch className="w-3 h-3 mr-1.5" />}
              Buscar Selecionados
            </Button>
          ) : (
            <Button
              size="sm"
              className="rounded-full bg-blue-600 hover:bg-blue-700 text-white h-8 px-4 text-xs"
              disabled={submitRequest.isPending || hasActiveRequest}
              onClick={() => submitRequest.mutate({ ncms: Array.from(selectedNCMs) })}
              title={hasActiveRequest ? "Você já tem uma solicitação ativa" : ""}
            >
              <Send className="w-3 h-3 mr-1.5" />
              Solicitar Varredura
            </Button>
          )}
          <button
            onClick={() => setSelectedNCMs(new Set())}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Limpar seleção"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal de detalhe do NCM — estilo Econet */}
      <Dialog open={!!selectedNCM} onOpenChange={() => setSelectedNCM(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span className="font-mono">{selectedNCM?.NCM}</span>
              {selectedNCM && isPreenchido(selectedNCM) ? (
                <Badge className="bg-green-100 text-green-800 text-xs">Preenchido</Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 text-xs">Pendente</Badge>
              )}
              {ncmHistory.length > 0 && (
                <span className="flex items-center gap-1 text-xs font-normal text-gray-500 ml-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                  Última alteração detectada:{" "}
                  {new Date(ncmHistory[0].scanDate).toLocaleString("pt-BR")}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedNCM && (() => {
            const fullRow: Record<string, string> =
              (ncmRowsFull?.find(r => r["NCM"] === selectedNCM.NCM) as Record<string, string> | undefined)
              ?? (selectedNCM as unknown as Record<string, string>);

            // Helper: find value by partial keyword match (all keywords, case-insensitive)
            const get = (...keywords: string[]) => {
              const key = Object.keys(fullRow).find(k =>
                keywords.every(kw => k.toLowerCase().includes(kw.toLowerCase()))
              );
              return key ? String(fullRow[key] ?? "").trim() : "";
            };

            // Detect ZFM / Suspensão data
            const zfmKeys = Object.keys(fullRow).filter(k =>
              k.toLowerCase().includes("zfm") || k.toLowerCase().includes("zona franca")
            );
            const zfmHasData = zfmKeys.some(k => String(fullRow[k] ?? "").trim() !== "");

            const suspKeys = Object.keys(fullRow).filter(k =>
              k.toLowerCase().includes("suspens")
            );
            const suspHasData = suspKeys.some(k => String(fullRow[k] ?? "").trim() !== "");

            // Regra Geral alíquota rows
            const regime = fullRow["Regime"] ?? "";
            const legislacao = fullRow["Legislação"] ?? "";
            const pisCum = fullRow["PIS Cumulativo"] ?? "";
            const cofinsCum = fullRow["COFINS Cumulativo"] ?? "";
            const pisNaoCum = fullRow["PIS Não Cumulativo"] ?? "";
            const cofinsNaoCum = fullRow["COFINS Não Cumulativo"] ?? "";

            type AliqRow = { regime: string; pis: string; cofins: string; leg: string };
            const aliqRows: AliqRow[] = [];
            if (pisCum || cofinsCum)
              aliqRows.push({ regime: "Cumulativo", pis: pisCum, cofins: cofinsCum, leg: legislacao });
            if (pisNaoCum || cofinsNaoCum)
              aliqRows.push({ regime: "Não Cumulativo", pis: pisNaoCum, cofins: cofinsNaoCum, leg: legislacao });
            // Monofásico fallback
            if (aliqRows.length === 0 && regime) {
              const pis = get("pis") || "";
              const cofins = get("cofins") || "";
              aliqRows.push({ regime, pis, cofins, leg: legislacao });
            }

            // ZFM alíquota rows
            const zfmAliqRows: AliqRow[] = [];
            if (zfmHasData) {
              const pCZ = get("pis", "cumulativo", "zfm") || get("zfm", "pis", "cum");
              const cCZ = get("cofins", "cumulativo", "zfm") || get("zfm", "cofins", "cum");
              const pNZ = get("pis", "não", "zfm") || get("zfm", "pis", "nao");
              const cNZ = get("cofins", "não", "zfm") || get("zfm", "cofins", "nao");
              const lZ  = get("legislação", "zfm") || get("zfm", "leg");
              if (pCZ || cCZ) zfmAliqRows.push({ regime: "Cumulativo", pis: pCZ, cofins: cCZ, leg: lZ });
              if (pNZ || cNZ) zfmAliqRows.push({ regime: "Não Cumulativo", pis: pNZ, cofins: cNZ, leg: lZ });
              if (zfmAliqRows.length === 0) {
                // generic fallback: first non-empty ZFM key as a single row
                const firstKey = zfmKeys.find(k => String(fullRow[k] ?? "").trim() !== "");
                if (firstKey) zfmAliqRows.push({ regime: "ZFM", pis: fullRow[firstKey] ?? "", cofins: "", leg: "" });
              }
            }

            const observacoes =
              fullRow["Observações"] ?? fullRow["Observacoes"] ?? get("observa");

            // Inner component for alíquota table
            const AliqTable = ({ rows }: { rows: AliqRow[] }) => (
              <table className="w-full text-sm border-collapse border border-gray-200 rounded overflow-hidden">
                <thead>
                  <tr className="bg-blue-600 text-white">
                    <th className="px-3 py-2 text-left font-medium border border-blue-500">Regime</th>
                    <th className="px-3 py-2 text-center font-medium border border-blue-500 w-24">PIS</th>
                    <th className="px-3 py-2 text-center font-medium border border-blue-500 w-24">COFINS</th>
                    <th className="px-3 py-2 text-left font-medium border border-blue-500">Dispositivo Legal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 ? rows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-3 py-2 border border-gray-200 font-medium text-gray-700">{r.regime || "—"}</td>
                      <td className="px-3 py-2 border border-gray-200 text-center text-green-700 font-semibold">{r.pis || "—"}</td>
                      <td className="px-3 py-2 border border-gray-200 text-center text-green-700 font-semibold">{r.cofins || "—"}</td>
                      <td className="px-3 py-2 border border-gray-200 text-gray-600 text-xs">{r.leg || "—"}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-gray-400 italic">
                        Sem dados disponíveis
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            );

            return (
              <div className="overflow-auto flex-1 mt-1">
                <Tabs defaultValue="regra-geral">
                  {/* Tab bar */}
                  <TabsList className="w-full justify-start border-b border-gray-200 rounded-none bg-transparent p-0 h-auto mb-4 gap-0">
                    <TabsTrigger
                      value="regra-geral"
                      className="rounded-none px-4 py-2 text-sm font-medium border-b-2 border-transparent
                        data-[state=active]:border-blue-600 data-[state=active]:text-blue-700
                        data-[state=inactive]:text-gray-500 bg-transparent shadow-none"
                    >
                      Regra Geral
                    </TabsTrigger>
                    {zfmHasData && (
                      <TabsTrigger
                        value="zfm"
                        className="rounded-none px-4 py-2 text-sm font-medium border-b-2 border-transparent
                          data-[state=active]:border-blue-600 data-[state=active]:text-blue-700
                          data-[state=inactive]:text-gray-500 bg-transparent shadow-none"
                      >
                        ZFM
                      </TabsTrigger>
                    )}
                    {suspHasData && (
                      <TabsTrigger
                        value="suspensao"
                        className="rounded-none px-4 py-2 text-sm font-medium border-b-2 border-transparent
                          data-[state=active]:border-blue-600 data-[state=active]:text-blue-700
                          data-[state=inactive]:text-gray-500 bg-transparent shadow-none"
                      >
                        Suspensão
                      </TabsTrigger>
                    )}
                    <TabsTrigger
                      value="historico"
                      className="rounded-none px-4 py-2 text-sm font-medium border-b-2 border-transparent
                        data-[state=active]:border-blue-600 data-[state=active]:text-blue-700
                        data-[state=inactive]:text-gray-500 bg-transparent shadow-none flex items-center gap-1.5"
                    >
                      <History className="w-3.5 h-3.5" />
                      Histórico
                      {ncmHistory.length > 0 && (
                        <span className="ml-1 rounded-full bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 font-semibold leading-none">
                          {ncmHistory.length}
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  {/* ── Regra Geral ── */}
                  <TabsContent value="regra-geral" className="space-y-5 mt-0">
                    {/* NCM info table */}
                    <table className="w-full text-sm border-collapse border border-gray-200">
                      <thead>
                        <tr className="bg-blue-600 text-white">
                          <th className="px-3 py-2 text-left font-medium border border-blue-500 w-1/4">Campo</th>
                          <th className="px-3 py-2 text-left font-medium border border-blue-500">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-white">
                          <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">NCM</td>
                          <td className="px-3 py-2 border border-gray-200 font-mono text-gray-900">{selectedNCM.NCM}</td>
                        </tr>
                        {fullRow["NCM Econet"] && String(fullRow["NCM Econet"]).trim() !== "" && (
                          <tr className="bg-gray-50">
                            <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">NCM Econet</td>
                            <td className="px-3 py-2 border border-gray-200 font-mono text-gray-900">{fullRow["NCM Econet"]}</td>
                          </tr>
                        )}
                        {fullRow["Descrição"] && String(fullRow["Descrição"]).trim() !== "" && (
                          <tr className="bg-white">
                            <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">Descrição</td>
                            <td className="px-3 py-2 border border-gray-200 text-gray-900">{fullRow["Descrição"]}</td>
                          </tr>
                        )}
                        {regime && (
                          <tr className="bg-gray-50">
                            <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">Regime</td>
                            <td className="px-3 py-2 border border-gray-200 text-gray-900">{regime}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* Alíquota */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Alíquota</h4>
                      <AliqTable rows={aliqRows} />
                    </div>

                    {/* Observações */}
                    {observacoes && String(observacoes).trim() !== "" && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Observações</h4>
                        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {observacoes}
                        </div>
                      </div>
                    )}

                  </TabsContent>

                  {/* ── ZFM ── */}
                  {zfmHasData && (
                    <TabsContent value="zfm" className="space-y-5 mt-0">
                      {/* NCM info (mesma estrutura da Regra Geral) */}
                      <table className="w-full text-sm border-collapse border border-gray-200">
                        <thead>
                          <tr className="bg-blue-600 text-white">
                            <th className="px-3 py-2 text-left font-medium border border-blue-500 w-1/4">Campo</th>
                            <th className="px-3 py-2 text-left font-medium border border-blue-500">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-white">
                            <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">NCM</td>
                            <td className="px-3 py-2 border border-gray-200 font-mono text-gray-900">{selectedNCM.NCM}</td>
                          </tr>
                          {fullRow["NCM Econet"] && String(fullRow["NCM Econet"]).trim() !== "" && (
                            <tr className="bg-gray-50">
                              <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">NCM Econet</td>
                              <td className="px-3 py-2 border border-gray-200 font-mono text-gray-900">{fullRow["NCM Econet"]}</td>
                            </tr>
                          )}
                          {fullRow["Descrição"] && String(fullRow["Descrição"]).trim() !== "" && (
                            <tr className="bg-white">
                              <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">Descrição</td>
                              <td className="px-3 py-2 border border-gray-200 text-gray-900">{fullRow["Descrição"]}</td>
                            </tr>
                          )}
                          {regime && (
                            <tr className="bg-gray-50">
                              <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">Regime</td>
                              <td className="px-3 py-2 border border-gray-200 text-gray-900">{regime}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                      {/* Alíquota ZFM */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          Alíquota — Zona Franca de Manaus
                        </h4>
                        <AliqTable rows={zfmAliqRows} />
                      </div>

                      {/* Observações ZFM */}
                      {(() => {
                        const obsZfm =
                          get("observa", "zfm") ||
                          get("zfm", "observa") ||
                          get("observa", "zona");
                        if (!obsZfm || obsZfm.trim() === "") return null;
                        return (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Observações</h4>
                            <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {obsZfm}
                            </div>
                          </div>
                        );
                      })()}
                    </TabsContent>
                  )}

                  {/* ── Suspensão ── */}
                  {suspHasData && (
                    <TabsContent value="suspensao" className="space-y-5 mt-0">
                      {/* NCM info (mesma estrutura da Regra Geral) */}
                      <table className="w-full text-sm border-collapse border border-gray-200">
                        <thead>
                          <tr className="bg-blue-600 text-white">
                            <th className="px-3 py-2 text-left font-medium border border-blue-500 w-1/4">Campo</th>
                            <th className="px-3 py-2 text-left font-medium border border-blue-500">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-white">
                            <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">NCM</td>
                            <td className="px-3 py-2 border border-gray-200 font-mono text-gray-900">{selectedNCM.NCM}</td>
                          </tr>
                          {fullRow["NCM Econet"] && String(fullRow["NCM Econet"]).trim() !== "" && (
                            <tr className="bg-gray-50">
                              <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">NCM Econet</td>
                              <td className="px-3 py-2 border border-gray-200 font-mono text-gray-900">{fullRow["NCM Econet"]}</td>
                            </tr>
                          )}
                          {fullRow["Descrição"] && String(fullRow["Descrição"]).trim() !== "" && (
                            <tr className="bg-white">
                              <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">Descrição</td>
                              <td className="px-3 py-2 border border-gray-200 text-gray-900">{fullRow["Descrição"]}</td>
                            </tr>
                          )}
                          {regime && (
                            <tr className="bg-gray-50">
                              <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">Regime</td>
                              <td className="px-3 py-2 border border-gray-200 text-gray-900">{regime}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                      {/* Dados de Suspensão */}
                      {(() => {
                        const suspDataKeys = suspKeys.filter(k => {
                          const v = String(fullRow[k] ?? "").trim();
                          return v !== "" && !k.toLowerCase().includes("observa");
                        });
                        if (suspDataKeys.length === 0) return null;
                        return (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Alíquota</h4>
                            <table className="w-full text-sm border-collapse border border-gray-200">
                              <thead>
                                <tr className="bg-blue-600 text-white">
                                  <th className="px-3 py-2 text-left font-medium border border-blue-500 w-1/3">Campo</th>
                                  <th className="px-3 py-2 text-left font-medium border border-blue-500">Valor</th>
                                </tr>
                              </thead>
                              <tbody>
                                {suspDataKeys.map((k, i) => (
                                  <tr key={k} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                    <td className="px-3 py-2 border border-gray-200 font-medium text-gray-600">{k}</td>
                                    <td className="px-3 py-2 border border-gray-200 text-gray-900">{String(fullRow[k])}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}

                      {/* Observações Suspensão */}
                      {(() => {
                        const obsKey = suspKeys.find(k => k.toLowerCase().includes("observa"));
                        const obsVal = obsKey ? String(fullRow[obsKey] ?? "").trim() : "";
                        if (!obsVal) return null;
                        return (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Observações</h4>
                            <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {obsVal}
                            </div>
                          </div>
                        );
                      })()}
                    </TabsContent>
                  )}
                  {/* ── Histórico ── */}
                  <TabsContent value="historico" className="mt-0">
                    {ncmHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
                        <History className="w-10 h-10 text-gray-200" />
                        <p className="text-sm font-medium text-gray-500">Nenhuma mudança registrada</p>
                        <p className="text-xs text-center">As mudanças aparecem aqui após a varredura automática detectar alterações neste NCM.</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm border-collapse border border-gray-200">
                        <thead>
                          <tr className="bg-blue-600 text-white">
                            <th className="px-3 py-2 text-left font-medium border border-blue-500">Campo</th>
                            <th className="px-3 py-2 text-left font-medium border border-blue-500">Valor Anterior</th>
                            <th className="px-3 py-2 text-left font-medium border border-blue-500">Valor Novo</th>
                            <th className="px-3 py-2 text-left font-medium border border-blue-500">Detectado em</th>
                            <th className="px-3 py-2 text-left font-medium border border-blue-500">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ncmHistory.map((change, i) => (
                            <tr key={change.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                              <td className="px-3 py-2 border border-gray-200 font-medium text-gray-700">{change.field}</td>
                              <td className="px-3 py-2 border border-gray-200">
                                <span className="line-through text-red-500">{change.oldValue || "—"}</span>
                              </td>
                              <td className="px-3 py-2 border border-gray-200">
                                <span className="font-medium text-green-700">{change.newValue || "—"}</span>
                              </td>
                              <td className="px-3 py-2 border border-gray-200 text-gray-500 whitespace-nowrap text-xs">
                                {new Date(change.scanDate).toLocaleString("pt-BR")}
                              </td>
                              <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">
                                {change.status === "pending" && (
                                  <Badge className="bg-yellow-100 text-yellow-800 text-xs">
                                    <Clock className="w-3 h-3 mr-1" />Pendente
                                  </Badge>
                                )}
                                {change.status === "accepted" && (
                                  <Badge className="bg-green-100 text-green-800 text-xs">
                                    <CheckCircle2 className="w-3 h-3 mr-1" />Aceita
                                  </Badge>
                                )}
                                {change.status === "rejected" && (
                                  <Badge className="bg-red-100 text-red-800 text-xs">
                                    <XCircle className="w-3 h-3 mr-1" />Rejeitada
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
