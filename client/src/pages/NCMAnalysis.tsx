import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, RefreshCw, ScanSearch, ScanLine, Loader2, X, CheckCircle2, CalendarClock } from "lucide-react";
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

function isPreenchido(row: NCMRow): boolean {
  return !!(row["PIS Cumulativo"] || row["PIS Não Cumulativo"]);
}

export default function NCMAnalysis() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [scanLabel, setScanLabel] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const { data: ncmRows, isLoading, refetch } = useQuery<NCMRow[]>({
    queryKey: ["/api/ncm-excel"],
  });

  async function checkStatus() {
    try {
      const res = await fetch("/api/ncm-scan/status");
      const data = await res.json();
      refetch();
      if (!data.running) {
        stopPolling(true);
      }
    } catch {
      // ignore transient errors
    }
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

  // Cleanup on unmount
  useEffect(() => () => { stopPolling(); }, []);

  // Background poll: detect scheduled scans that started without user interaction
  useEffect(() => {
    const interval = setInterval(async () => {
      if (scanning) return; // already tracking manually
      try {
        const res = await fetch("/api/ncm-scan/status");
        const data = await res.json();
        if (data.running) {
          // A scheduled scan is running — start showing the banner
          startPolling("Varredura automática agendada em andamento...");
        }
      } catch {
        // ignore
      }
    }, 20_000);
    return () => clearInterval(interval);
  }, [scanning]);

  const triggerScan = useMutation({
    mutationFn: async (mode: "incompletos" | "todos") => {
      const res = await fetch("/api/ncm-scan/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error("Falha ao iniciar varredura");
      return res.json();
    },
    onSuccess: (_, mode) => {
      setScanDone(false);
      const label = mode === "todos" ? "Buscando todos os NCMs no Econet..." : "Buscando NCMs pendentes no Econet...";
      startPolling(label);
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível iniciar a varredura.", variant: "destructive" });
    },
  });

  const filtered = ncmRows?.filter((row) => {
    const matchesSearch =
      !searchTerm ||
      row.NCM.includes(searchTerm) ||
      row["NCM Econet"].includes(searchTerm) ||
      row["Descrição"].toLowerCase().includes(searchTerm.toLowerCase());

    const preenchido = isPreenchido(row);
    const matchesStatus =
      !statusFilter ||
      statusFilter === "all" ||
      (statusFilter === "preenchido" && preenchido) ||
      (statusFilter === "pendente" && !preenchido);

    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <TopBar
            title="NCMs Extraídos"
            subtitle="Visualize e gerencie a análise tributária dos códigos NCM identificados"
          />
          <div className="p-6">
            <div className="text-center">Carregando...</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <TopBar
          title="NCMs Extraídos"
          subtitle="Visualize e gerencie a análise tributária dos códigos NCM identificados"
        />

        {scanning && (
          <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span className="text-sm font-medium flex-1">{scanLabel} A tabela atualiza automaticamente.</span>
            <button onClick={() => stopPolling(false)} className="text-blue-500 hover:text-blue-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {!scanning && scanDone && (
          <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium flex-1">Varredura concluída! Os dados foram atualizados.</span>
            <button onClick={() => setScanDone(false)} className="text-green-500 hover:text-green-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Buscar por NCM ou descrição..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search"
                    />
                  </div>
                </div>
                <div className="sm:w-48">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger data-testid="select-status-filter">
                      <SelectValue placeholder="Filtrar por status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="preenchido">Preenchidos</SelectItem>
                      <SelectItem value="pendente">Pendentes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" data-testid="button-advanced-filters">
                  <Filter className="w-4 h-4 mr-2" />
                  Filtros Avançados
                </Button>
                <Button variant="outline" onClick={() => refetch()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Atualizar
                </Button>
                <Button
                  variant="outline"
                  className="text-purple-700 border-purple-300 hover:bg-purple-50"
                  onClick={() => setScheduleOpen(true)}
                >
                  <CalendarClock className="w-4 h-4 mr-2" />
                  Agendar Varredura
                </Button>
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
              </div>
            </CardContent>
          </Card>

          {/* Results */}
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        NCM
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Descrição
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        PIS Cum.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        COFINS Cum.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        PIS N.Cum.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        COFINS N.Cum.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Regime
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filtered?.map((row, idx) => {
                      const preenchido = isPreenchido(row);
                      return (
                        <tr key={row.NCM || idx} className="hover:bg-gray-50">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="font-mono text-sm font-medium text-gray-900">
                              {row.NCM}
                            </div>
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
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Nenhum resultado encontrado
                  </h3>
                  <p className="text-gray-600">
                    Tente ajustar os filtros ou fazer novos uploads de arquivos.
                  </p>
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
