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
  Search, Filter, RefreshCw, ScanSearch, ScanLine, Loader2, X,
  CheckCircle2, CalendarClock, Clock, XCircle, CheckCheck, AlertCircle, Send,
} from "lucide-react";
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

function RequestStatusCard({ request, onNewRequest }: { request: ScanRequest; onNewRequest: () => void }) {
  const isActive = request.status === "pending_thayssa" || request.status === "pending_yuri";

  if (request.status === "pending_thayssa") {
    return (
      <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-800">
        <Clock className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium">Aguardando aprovação da <strong>Thayssa</strong> — solicitação de varredura enviada.</span>
      </div>
    );
  }
  if (request.status === "pending_yuri") {
    return (
      <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-orange-800">
        <Clock className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium">Thayssa aprovou. Aguardando aprovação do <strong>Yuri</strong>.</span>
      </div>
    );
  }
  if (request.status === "approved") {
    return (
      <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium">Solicitação aprovada! A varredura foi iniciada.</span>
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
      </div>
    );
  }
  return null;
}

export default function NCMAnalysis() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [scanLabel, setScanLabel] = useState("");
  const [rejectTarget, setRejectTarget] = useState<{ id: number; name: string } | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery<any>({ queryKey: ["/api/auth/user"] });
  const isAdmin = currentUser?.role === "ADMIN";

  const { data: ncmRows, isLoading, refetch } = useQuery<NCMRow[]>({
    queryKey: ["/api/ncm-excel"],
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
    if (completed) setScanDone(true);
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

  // USER: solicitar varredura
  const submitRequest = useMutation({
    mutationFn: async (mode: "incompletos" | "todos") => {
      const res = await fetch("/api/scan-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-requests/mine"] });
      toast({ title: "Solicitação enviada!", description: "Aguardando aprovação da Thayssa." });
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

  const filtered = ncmRows?.filter((row) => {
    const matchesSearch =
      !searchTerm ||
      row.NCM.includes(searchTerm) ||
      row["NCM Econet"].includes(searchTerm) ||
      row["Descrição"].toLowerCase().includes(searchTerm.toLowerCase());
    const preenchido = isPreenchido(row);
    const matchesStatus =
      !statusFilter || statusFilter === "all" ||
      (statusFilter === "preenchido" && preenchido) ||
      (statusFilter === "pendente" && !preenchido);
    return matchesSearch && matchesStatus;
  });

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
        {!isAdmin && myRequest && (
          <RequestStatusCard
            request={myRequest}
            onNewRequest={() => queryClient.invalidateQueries({ queryKey: ["/api/scan-requests/mine"] })}
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
                <Button variant="outline">
                  <Filter className="w-4 h-4 mr-2" />
                  Filtros Avançados
                </Button>
                <Button variant="outline" onClick={() => refetch()}>
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
                      className="text-amber-700 border-amber-300 hover:bg-amber-50"
                      disabled={triggerScan.isPending || scanning}
                      onClick={() => triggerScan.mutate("incompletos")}
                    >
                      {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScanLine className="w-4 h-4 mr-2" />}
                      Buscar Pendentes
                    </Button>
                    <Button
                      variant="outline"
                      className="text-blue-700 border-blue-300 hover:bg-blue-50"
                      disabled={triggerScan.isPending || scanning}
                      onClick={() => triggerScan.mutate("todos")}
                    >
                      {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScanSearch className="w-4 h-4 mr-2" />}
                      Buscar Todos
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="text-amber-700 border-amber-300 hover:bg-amber-50"
                      disabled={submitRequest.isPending || hasActiveRequest}
                      onClick={() => submitRequest.mutate("incompletos")}
                      title={hasActiveRequest ? "Você já tem uma solicitação ativa" : ""}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Solicitar — Pendentes
                    </Button>
                    <Button
                      variant="outline"
                      className="text-blue-700 border-blue-300 hover:bg-blue-50"
                      disabled={submitRequest.isPending || hasActiveRequest}
                      onClick={() => submitRequest.mutate("todos")}
                      title={hasActiveRequest ? "Você já tem uma solicitação ativa" : ""}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Solicitar — Todos
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabela de NCMs */}
          <Card>
            <CardHeader>
              <CardTitle>
                Análises de NCM
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({filtered?.length ?? 0} resultados)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NCM</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PIS Cum.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">COFINS Cum.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PIS N.Cum.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">COFINS N.Cum.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Regime</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filtered?.map((row, idx) => {
                      const preenchido = isPreenchido(row);
                      return (
                        <tr key={row.NCM || idx} className="hover:bg-gray-50">
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!filtered || filtered.length === 0 ? (
                <div className="text-center py-12">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum resultado encontrado</h3>
                  <p className="text-gray-600">Tente ajustar os filtros ou fazer novos uploads de arquivos.</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </main>

      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </div>
  );
}
