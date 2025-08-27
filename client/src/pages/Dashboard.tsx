import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { UploadModal } from "@/components/UploadModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  FileCheck,
  BarChart3,
  Clock,
  TrendingUp,
  Download,
  Eye,
  Edit,
  Check,
  Bot,
  RefreshCw,
  Bell,
  Database,
  Trash2,
} from "lucide-react";

export default function Dashboard() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Demo data mutations
  const generateDemoMutation = useMutation({
    mutationFn: () => apiRequest("/api/generate-demo-data", { method: "POST" }),
    onSuccess: () => {
      toast({
        title: "Dados de demonstração criados",
        description: "Os dados fictícios foram populados com sucesso.",
      });
      // Invalidate all queries to refetch data
      queryClient.invalidateQueries();
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao gerar dados de demonstração.",
        variant: "destructive",
      });
    },
  });

  const clearDemoMutation = useMutation({
    mutationFn: () => apiRequest("/api/clear-demo-data", { method: "POST" }),
    onSuccess: () => {
      toast({
        title: "Dados limpos",
        description: "Os dados de demonstração foram removidos.",
      });
      queryClient.invalidateQueries();
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao limpar dados de demonstração.",
        variant: "destructive",
      });
    },
  });

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
                  <TrendingUp className="text-green-600 w-4 h-4 mr-1" />
                  <span className="text-green-600 font-medium">+12%</span>
                  <span className="text-gray-500 ml-1">vs mês anterior</span>
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
                  <TrendingUp className="text-green-600 w-4 h-4 mr-1" />
                  <span className="text-green-600 font-medium">+8%</span>
                  <span className="text-gray-500 ml-1">vs mês anterior</span>
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
                  <TrendingUp className="text-green-600 w-4 h-4 mr-1" />
                  <span className="text-green-600 font-medium">+15%</span>
                  <span className="text-gray-500 ml-1">vs mês anterior</span>
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
                  <span className="text-red-600 font-medium">+3</span>
                  <span className="text-gray-500 ml-1">novos hoje</span>
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
                  <span className="text-sm text-gray-500">Atualizado há 2 min</span>
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
                                {tribute.type} {tribute.rate}%
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {analysis.tributes?.some((t: any) => t.validated) ? (
                            <Badge className="bg-green-100 text-green-800">Validado</Badge>
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

          {/* Demo Area */}
          <Card className="border-2 border-dashed border-blue-300 bg-blue-50">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Database className="text-blue-600" />
                <CardTitle className="text-blue-800">Área de Demonstração</CardTitle>
              </div>
              <p className="text-sm text-blue-700">
                Popule dados fictícios para testar todas as funcionalidades do sistema
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={() => generateDemoMutation.mutate()}
                  disabled={generateDemoMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-generate-demo-data"
                >
                  <Database className="w-4 h-4 mr-2" />
                  {generateDemoMutation.isPending ? "Gerando..." : "Popular Dados Fictícios"}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => clearDemoMutation.mutate()}
                  disabled={clearDemoMutation.isPending}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  data-testid="button-clear-demo-data"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {clearDemoMutation.isPending ? "Limpando..." : "Limpar Dados"}
                </Button>
              </div>
              
              <div className="mt-4 p-3 bg-blue-100 rounded-md">
                <p className="text-sm text-blue-800">
                  <strong>O que será criado:</strong>
                </p>
                <ul className="text-sm text-blue-700 mt-2 space-y-1">
                  <li>• 247 Arquivos processados, 1.834 NCMs, 189 análises, 12 pendentes</li>
                  <li>• Fila de processamento com 3 arquivos (SPED processando 65%, XML concluído, CSV aguardando)</li>
                  <li>• Distribuição de tributos: ICMS 847, IPI 523, PIS 1.234, COFINS 1.234</li>
                  <li>• Competência: 68% Federal (1.247), 32% Estadual (587)</li>
                  <li>• Análises recentes com NCMs reais: máquinas offset, cerveja, automóveis</li>
                  <li>• Status de validação com badges coloridos (validado/pendente)</li>
                </ul>
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
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Bot className="text-green-600 text-2xl" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Status do RPA</h4>
                  <p className="text-sm text-green-600 font-medium">Ativo e Monitorando</p>
                  <p className="text-xs text-gray-500 mt-1">Última verificação: 14:23</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <RefreshCw className="text-blue-600 text-2xl" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Alterações Detectadas</h4>
                  <p className="text-sm text-blue-600 font-medium" data-testid="rpa-changes-detected">
                    7 esta semana
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Última: ICMS/SP hoje</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Bell className="text-amber-600 text-2xl" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Alertas Pendentes</h4>
                  <p className="text-sm text-amber-600 font-medium" data-testid="rpa-pending-alerts">
                    3 para revisar
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Requer validação manual</p>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Próxima execução programada:</span>
                  <span className="text-sm font-medium text-gray-900" data-testid="rpa-next-execution">
                    Hoje às 18:00
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
