import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { UploadModal } from "@/components/UploadModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  FileCheck,
  BarChart3,
  Clock,
  TrendingUp,
  Download,
  Eye,
  Edit,
  Bot,
  RefreshCw,
  Bell,
} from "lucide-react";

export default function Dashboard() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Fetch dashboard data
  const { data: stats } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentUploads } = useQuery({
    queryKey: ["/api/uploads/recent"],
  });

  const { data: recentAnalyses } = useQuery({
    queryKey: ["/api/analyses/recent"],
  });

  const { data: taxDistribution } = useQuery({
    queryKey: ["/api/dashboard/tax-distribution"],
  });

  const { data: jurisdictionDistribution } = useQuery({
    queryKey: ["/api/dashboard/jurisdiction-distribution"],
  });

  const { data: rpaStatus } = useQuery<any>({
    queryKey: ["/api/rpa/status"],
  });

  const { data: pendingChanges } = useQuery<any[]>({
    queryKey: ["/api/ncm-changes", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/ncm-changes?status=pending", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const { data: allChanges } = useQuery<any[]>({
    queryKey: ["/api/ncm-changes", "all"],
    queryFn: async () => {
      const res = await fetch("/api/ncm-changes?status=all", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  // Demo data mutations
  const getTaxColor = (type: string) => {
    switch (type) {
      case "ICMS":
        return "bg-tax-icms";
      case "IPI":
        return "bg-tax-ipi";
      case "PIS":
        return "bg-tax-pis";
      case "COFINS":
        return "bg-tax-cofins";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Badge className="bg-green-100 text-green-800">Concluído</Badge>;
      case "PROCESSING":
        return <Badge className="bg-blue-100 text-blue-800">Processando</Badge>;
      case "PENDING":
        return <Badge className="bg-amber-100 text-amber-800">Aguardando</Badge>;
      case "ERROR":
        return <Badge className="bg-red-100 text-red-800">Erro</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <TopBar
          title="Dashboard - Diagnóstico Tributário"
          subtitle="Gerencie uploads, análises e relatórios tributários"
          onNewUpload={() => setUploadModalOpen(true)}
        />

        <div className="p-6 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Arquivos Processados</p>
                    <p className="text-3xl font-bold text-gray-900" data-testid="stat-processed-files">
                      {(stats as any)?.processedFiles || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FileCheck className="text-blue-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <TrendingUp className="text-gray-400 w-4 h-4 mr-1" />
                  <span className="text-gray-400">Total acumulado</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">NCMs Identificados</p>
                    <p className="text-3xl font-bold text-gray-900" data-testid="stat-ncm-codes">
                      {(stats as any)?.ncmCodes || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <BarChart3 className="text-green-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <TrendingUp className="text-gray-400 w-4 h-4 mr-1" />
                  <span className="text-gray-400">Total acumulado</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Análises Concluídas</p>
                    <p className="text-3xl font-bold text-gray-900" data-testid="stat-completed-analyses">
                      {(stats as any)?.completedAnalyses || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <BarChart3 className="text-purple-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <TrendingUp className="text-gray-400 w-4 h-4 mr-1" />
                  <span className="text-gray-400">Total acumulado</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pendentes Validação</p>
                    <p className="text-3xl font-bold text-gray-900" data-testid="stat-pending-validation">
                      {(stats as any)?.pendingValidation || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Clock className="text-amber-600 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <Clock className="text-gray-400 w-4 h-4 mr-1" />
                  <span className="text-gray-400">Aguardando revisão</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Processing Queue */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Fila de Processamento</CardTitle>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(recentUploads as any[])?.slice(0, 3).map((upload: any) => (
                  <div
                    key={upload.id}
                    className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <FileCheck className="text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900" data-testid={`upload-filename-${upload.id}`}>
                          {upload.filename}
                        </p>
                        <p className="text-sm text-gray-600">
                          {upload.fileType} • Enviado por {upload.user?.firstName || upload.user?.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        {getStatusBadge(upload.status)}
                        {upload.status === "PROCESSING" && (
                          <>
                            <Progress value={65} className="w-32 mt-2" />
                            <p className="text-xs text-gray-500 mt-1">65% concluído</p>
                          </>
                        )}
                        {upload.status === "COMPLETED" && (
                          <p className="text-xs text-gray-500 mt-1">
                            {upload.ncmItemsCount} NCMs extraídos
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tax Analysis Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Distribuição por Tipo de Tributo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {taxDistribution && Object.entries(taxDistribution as Record<string, number>).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-4 h-4 ${getTaxColor(type.toUpperCase())} rounded`}></div>
                        <span className="font-medium text-gray-900">{type.toUpperCase()}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-gray-900" data-testid={`tax-count-${type}`}>
                          {count}
                        </span>
                        <p className="text-sm text-gray-500">NCMs processados</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Classificação por Competência</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {jurisdictionDistribution && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900">Federal</span>
                          <span className="text-lg font-bold text-gray-900" data-testid="jurisdiction-federal-count">
                            {(jurisdictionDistribution as any).federal}
                          </span>
                        </div>
                        <Progress 
                          value={
                            ((jurisdictionDistribution as any).federal / 
                            ((jurisdictionDistribution as any).federal + (jurisdictionDistribution as any).estadual)) * 100
                          } 
                          className="h-3"
                        />
                        <p className="text-sm text-gray-500 mt-1">{(jurisdictionDistribution as any).federal} NCMs</p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900">Estadual</span>
                          <span className="text-lg font-bold text-gray-900" data-testid="jurisdiction-estadual-count">
                            {(jurisdictionDistribution as any).estadual}
                          </span>
                        </div>
                        <Progress 
                          value={
                            ((jurisdictionDistribution as any).estadual / 
                            ((jurisdictionDistribution as any).federal + (jurisdictionDistribution as any).estadual)) * 100
                          } 
                          className="h-3"
                        />
                        <p className="text-sm text-gray-500 mt-1">{(jurisdictionDistribution as any).estadual} NCMs</p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Analyses */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Análises Recentes</CardTitle>
                <Button variant="ghost" size="sm" data-testid="button-view-all-analyses">
                  Ver todas
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        NCM
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Produto
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tributos Aplicáveis
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(recentAnalyses as any[])?.slice(0, 5).map((analysis: any) => (
                      <tr key={analysis.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-mono text-sm font-medium text-gray-900" data-testid={`ncm-code-${analysis.id}`}>
                            {analysis.ncmCode}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900" data-testid={`product-name-${analysis.id}`}>
                            {analysis.productName || analysis.description}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {analysis.tributes?.map((tribute: any) => (
                              <Badge
                                key={tribute.id}
                                className={`${getTaxColor(tribute.type)} bg-opacity-20 text-gray-800`}
                                data-testid={`tribute-${tribute.type}-${analysis.id}`}
                              >
                                {tribute.type} {String(tribute.rate).replace(/%$/, "")}%
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(analysis as any).status === "COMPLETED" || analysis.tributes?.some((t: any) => t.validated) ? (
                            <Badge className="bg-green-100 text-green-800">Concluído</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800">Pendente</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm" data-testid={`button-edit-${analysis.id}`}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" data-testid={`button-export-${analysis.id}`}>
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" data-testid={`button-view-${analysis.id}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* RPA Status Widget */}
          <Card>
            <CardHeader>
              <CardTitle>RPA - Monitoramento de Legislação</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${rpaStatus?.service_status === "active" ? "bg-green-100" : "bg-gray-100"}`}>
                    <Bot className={`text-2xl ${rpaStatus?.service_status === "active" ? "text-green-600" : "text-gray-400"}`} />
                  </div>
                  <h4 className="font-semibold text-gray-900">Status do RPA</h4>
                  <p className={`text-sm font-medium ${rpaStatus?.service_status === "active" ? "text-green-600" : "text-gray-500"}`}>
                    {rpaStatus?.service_status === "active" ? "Ativo e Monitorando" : rpaStatus?.service_status ?? "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {rpaStatus?.last_execution
                      ? `Última: ${new Date(rpaStatus.last_execution).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                      : "Sem execuções"}
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <RefreshCw className="text-blue-600 text-2xl" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Alterações Detectadas</h4>
                  <p className="text-sm text-blue-600 font-medium" data-testid="rpa-changes-detected">
                    {allChanges?.length ?? 0} no total
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Monitoramento de NCMs</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Bell className="text-amber-600 text-2xl" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Alertas Pendentes</h4>
                  <p className="text-sm text-amber-600 font-medium" data-testid="rpa-pending-alerts">
                    {pendingChanges?.length ?? 0} para revisar
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Requer validação manual</p>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Próxima execução programada:</span>
                  <span className="text-sm font-medium text-gray-900" data-testid="rpa-next-execution">
                    {rpaStatus?.next_scheduled_execution
                      ? new Date(rpaStatus.next_scheduled_execution).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                      : "Não agendado"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <UploadModal open={uploadModalOpen} onOpenChange={setUploadModalOpen} />
    </div>
  );
}
