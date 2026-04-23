import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Download,
  Filter,
  Eye,
  BarChart3,
  PieChart,
  LineChart,
  Loader2,
  X,
} from "lucide-react";

type ReportType = "tax-summary" | "ncm-analysis" | "trend-analysis" | "jurisdiction-report";
type ReportFormat = "xlsx" | "pdf";

interface Report {
  id: string;
  name: string;
  type: ReportType;
  format: ReportFormat;
  status: "pending" | "completed" | "error";
  file_path: string | null;
  created_by: string;
  created_at: string;
  error_message: string | null;
  download_count: number;
  downloaded_by: string | null;
}

interface ReportsResponse {
  reports: Report[];
  totalDownloads: number;
}

interface PreviewData {
  reportName: string;
  title: string;
  headers: string[];
  data: (string | number)[][];
  status: string;
}

const REPORT_TEMPLATES = [
  {
    id: "tax-summary" as ReportType,
    name: "Resumo Tributário",
    description: "Resumo de tributos por NCM com PIS/COFINS e regime tributário",
    icon: BarChart3,
    color: "bg-blue-100 text-blue-800",
    disabled: false,
  },
  {
    id: "ncm-analysis" as ReportType,
    name: "Análise Detalhada de NCMs",
    description: "Lista completa de NCMs com todas as alíquotas e legislação aplicável",
    icon: FileText,
    color: "bg-green-100 text-green-800",
    disabled: false,
  },
  {
    id: "jurisdiction-report" as ReportType,
    name: "Relatório por Competência",
    description: "Segregação de tributos federais e estaduais (em breve — apenas federal disponível)",
    icon: PieChart,
    color: "bg-gray-100 text-gray-400",
    disabled: true,
  },
  {
    id: "trend-analysis" as ReportType,
    name: "Análise de Tendências",
    description: "Histórico de mudanças detectadas nas alíquotas de NCMs ao longo do tempo",
    icon: LineChart,
    color: "bg-amber-100 text-amber-800",
    disabled: false,
  },
];

const TYPE_LABELS: Record<ReportType, string> = {
  "tax-summary": "Resumo Tributário",
  "ncm-analysis": "Análise de NCMs",
  "jurisdiction-report": "Por Competência",
  "trend-analysis": "Tendências",
};

export default function Reports() {
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [generateModal, setGenerateModal] = useState<{ type: ReportType; name: string } | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>("xlsx");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: reportsData } = useQuery<ReportsResponse>({
    queryKey: ["/api/reports"],
    queryFn: async () => {
      const res = await fetch("/api/reports", { credentials: "include" });
      return res.ok ? res.json() : { reports: [], totalDownloads: 0 };
    },
    refetchInterval: generatingId ? 2000 : false,
  });

  const reports = reportsData?.reports ?? [];

  const { data: stats } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const generateMutation = useMutation({
    mutationFn: async ({ type, format, name }: { type: ReportType; format: ReportFormat; name: string }) => {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, format, name }),
      });
      if (!res.ok) throw new Error("Falha ao iniciar geração");
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratingId(data.id);
      setGenerateModal(null);
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({ title: "Gerando relatório…", description: "Você será notificado ao concluir." });
      // Poll until done
      const poll = setInterval(async () => {
        const res = await fetch(`/api/reports/${data.id}/status`, { credentials: "include" });
        const status = await res.json();
        if (status.status === "completed") {
          clearInterval(poll);
          setGeneratingId(null);
          queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
          toast({ title: "Relatório pronto!", description: "Clique em baixar para obter o arquivo." });
        } else if (status.status === "error") {
          clearInterval(poll);
          setGeneratingId(null);
          queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
          toast({ title: "Erro na geração", description: status.error_message, variant: "destructive" });
        }
      }, 1500);
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível gerar o relatório.", variant: "destructive" }),
  });

  const handlePreview = async (report: Report) => {
    const res = await fetch(`/api/reports/${report.id}/preview`, { credentials: "include" });
    if (res.ok) setPreviewData(await res.json());
  };

  const handlePreviewTemplate = async (type: ReportType) => {
    const res = await fetch(`/api/reports/preview-template?type=${type}`, { credentials: "include" });
    if (res.ok) setPreviewData(await res.json());
  };

  const handleDownload = (report: Report) => {
    window.open(`/api/reports/${report.id}/download`, "_blank");
  };

  const completed = reports.filter(r => r.status === "completed").length;
  const pending = reports.filter(r => r.status === "pending").length;
  const totalDownloads = reportsData?.totalDownloads ?? reports.reduce((sum, r) => sum + (r.download_count ?? 0), 0);

  const filtered = reports.filter(r => {
    const matchType = !typeFilter || typeFilter === "all" || r.type === typeFilter;
    const matchStatus = !statusFilter || statusFilter === "all" || r.status === statusFilter;
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchStatus && matchSearch;
  });

  const getStatusBadge = (status: string) => {
    if (status === "completed") return <Badge className="bg-green-100 text-green-800">Concluído</Badge>;
    if (status === "pending") return <Badge className="bg-blue-100 text-blue-800 gap-1"><Loader2 className="w-3 h-3 animate-spin" />Gerando</Badge>;
    return <Badge className="bg-red-100 text-red-800">Erro</Badge>;
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar title="Relatórios" subtitle="Gere e gerencie relatórios tributários personalizados" />

        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Relatórios Gerados</p>
                  <p className="text-3xl font-bold text-gray-900">{completed}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-600" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Em Processamento</p>
                  <p className="text-3xl font-bold text-gray-900">{pending}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-amber-600" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">NCMs Analisados</p>
                  <p className="text-3xl font-bold text-gray-900">{(stats as any)?.completedAnalyses ?? 0}</p>
                </div>
                <PieChart className="w-8 h-8 text-green-600" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Downloads</p>
                  <p className="text-3xl font-bold text-gray-900">{totalDownloads}</p>
                </div>
                <Download className="w-8 h-8 text-purple-600" />
              </CardContent>
            </Card>
          </div>

          {/* Templates */}
          <Card>
            <CardHeader><CardTitle>Modelos de Relatório</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {REPORT_TEMPLATES.map(t => (
                  <div
                    key={t.id}
                    className={`p-4 border rounded-lg transition-colors ${t.disabled ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed" : "border-gray-200 hover:border-blue-300 cursor-pointer"}`}
                  >
                    <div className="flex items-start space-x-4">
                      <div className={`p-3 ${t.color} rounded-lg`}>
                        <t.icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-semibold ${t.disabled ? "text-gray-400" : "text-gray-900"}`}>{t.name}</h3>
                          {t.disabled && <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Em breve</span>}
                        </div>
                        <p className="text-sm text-gray-500 mb-3">{t.description}</p>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            disabled={t.disabled || !!generatingId}
                            onClick={() => setGenerateModal({ type: t.id, name: t.name })}
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Gerar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={t.disabled}
                            onClick={() => handlePreviewTemplate(t.id)}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Visualizar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar relatórios..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="sm:w-48">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger><SelectValue placeholder="Tipo de Relatório" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="tax-summary">Resumo Tributário</SelectItem>
                      <SelectItem value="ncm-analysis">Análise NCM</SelectItem>
                      <SelectItem value="trend-analysis">Tendências</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:w-48">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="completed">Concluído</SelectItem>
                      <SelectItem value="pending">Gerando</SelectItem>
                      <SelectItem value="error">Com Erro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline">
                  <Filter className="w-4 h-4 mr-2" />
                  Filtros
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader><CardTitle>Histórico de Relatórios</CardTitle></CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                  <p className="text-gray-500">Nenhum relatório encontrado. Gere seu primeiro relatório acima.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Nome", "Tipo", "Formato", "Data", "Status", "Baixado por", "Ações"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {filtered.map(report => (
                        <tr key={report.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{report.name}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge variant="outline">{TYPE_LABELS[report.type] ?? report.type}</Badge>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-xs font-mono uppercase bg-gray-100 px-2 py-1 rounded">{report.format}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {report.created_at ? report.created_at.replace(/-/g, "/") : "?"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{getStatusBadge(report.status)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {report.downloaded_by ? (
                              <span title={`${report.download_count} download(s)`}>{report.downloaded_by}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handlePreview(report)} title="Visualizar">
                                <Eye className="w-4 h-4" />
                              </Button>
                              {report.status === "completed" && (
                                <Button variant="ghost" size="sm" onClick={() => handleDownload(report)} title="Baixar">
                                  <Download className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Generate Modal */}
      <Dialog open={!!generateModal} onOpenChange={() => setGenerateModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Relatório — {generateModal?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Nome do relatório</label>
              <Input
                value={generateModal?.name ?? ""}
                onChange={e => setGenerateModal(m => m ? { ...m, name: e.target.value } : null)}
                placeholder="Ex: Resumo Tributário — Abril 2026"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Formato</label>
              <div className="flex gap-3">
                {(["xlsx", "pdf"] as ReportFormat[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setSelectedFormat(f)}
                    className={`flex-1 py-2 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${selectedFormat === f ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                  >
                    {f === "xlsx" ? "Excel (.xlsx)" : "PDF (.pdf)"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateModal(null)}>Cancelar</Button>
            <Button
              onClick={() => generateModal && generateMutation.mutate({ type: generateModal.type, format: selectedFormat, name: generateModal.name })}
              disabled={generateMutation.isPending || !generateModal?.name.trim()}
            >
              {generateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando…</> : "Gerar Relatório"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={!!previewData} onOpenChange={() => setPreviewData(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle>{previewData?.reportName ?? previewData?.title}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="overflow-auto flex-1 mt-2">
            {previewData && (
              <table className="w-full text-sm border-collapse">
                <thead className="bg-blue-600 text-white sticky top-0">
                  <tr>
                    {previewData.headers.map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.data.length === 0 ? (
                    <tr><td colSpan={previewData.headers.length} className="px-3 py-6 text-center text-gray-400">Nenhum dado disponível</td></tr>
                  ) : (
                    previewData.data.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-blue-50" : "bg-white"}>
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 text-gray-800 whitespace-nowrap max-w-xs truncate">{cell}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter className="flex-shrink-0 pt-2">
            <p className="text-xs text-gray-400 flex-1">{previewData?.data.length ?? 0} linha(s)</p>
            <Button variant="outline" onClick={() => setPreviewData(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
