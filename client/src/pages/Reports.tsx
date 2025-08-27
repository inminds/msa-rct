import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, 
  Download, 
  Calendar,
  Filter,
  Eye,
  Share2,
  BarChart3,
  PieChart,
  LineChart
} from "lucide-react";
import { format } from "date-fns";

export default function Reports() {
  const [reportType, setReportType] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: uploads } = useQuery({
    queryKey: ["/api/uploads"],
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const reportTemplates = [
    {
      id: "tax-summary",
      name: "Relatório de Resumo Tributário",
      description: "Resumo geral de tributos por NCM e competência",
      icon: BarChart3,
      color: "bg-blue-100 text-blue-800",
    },
    {
      id: "ncm-analysis",
      name: "Análise Detalhada de NCMs",
      description: "Lista completa de NCMs com tributos aplicáveis",
      icon: FileText,
      color: "bg-green-100 text-green-800",
    },
    {
      id: "jurisdiction-report",
      name: "Relatório por Competência",
      description: "Segregação de tributos federais e estaduais",
      icon: PieChart,
      color: "bg-purple-100 text-purple-800",
    },
    {
      id: "trend-analysis",
      name: "Análise de Tendências",
      description: "Evolução histórica de classificações tributárias",
      icon: LineChart,
      color: "bg-amber-100 text-amber-800",
    },
  ];

  const recentReports = [
    {
      id: "1",
      name: "Resumo Tributário - Janeiro 2024",
      type: "tax-summary",
      generatedAt: new Date(),
      status: "completed",
      fileSize: "2.3 MB",
      format: "PDF",
    },
    {
      id: "2",
      name: "NCMs Processados - Lote 001",
      type: "ncm-analysis",
      generatedAt: new Date(Date.now() - 86400000),
      status: "completed",
      fileSize: "1.8 MB",
      format: "Excel",
    },
    {
      id: "3",
      name: "Competência Federal vs Estadual",
      type: "jurisdiction-report",
      generatedAt: new Date(Date.now() - 172800000),
      status: "processing",
      fileSize: "-",
      format: "PDF",
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800">Concluído</Badge>;
      case "processing":
        return <Badge className="bg-blue-100 text-blue-800">Processando</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800">Erro</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const filteredReports = recentReports.filter(report => {
    const matchesType = !reportType || report.type === reportType;
    const matchesStatus = !statusFilter || report.status === statusFilter;
    return matchesType && matchesStatus;
  });

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <TopBar
          title="Relatórios"
          subtitle="Gere e gerencie relatórios tributários personalizados"
        />

        <div className="p-6 space-y-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Relatórios Gerados</p>
                    <p className="text-3xl font-bold text-gray-900" data-testid="stat-reports-generated">
                      {recentReports.filter(r => r.status === 'completed').length}
                    </p>
                  </div>
                  <FileText className="w-8 h-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Em Processamento</p>
                    <p className="text-3xl font-bold text-gray-900" data-testid="stat-reports-processing">
                      {recentReports.filter(r => r.status === 'processing').length}
                    </p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-amber-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Dados Analisados</p>
                    <p className="text-3xl font-bold text-gray-900" data-testid="stat-data-analyzed">
                      {(stats as any)?.ncmCodes || 0}
                    </p>
                  </div>
                  <PieChart className="w-8 h-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Downloads</p>
                    <p className="text-3xl font-bold text-gray-900" data-testid="stat-downloads">
                      247
                    </p>
                  </div>
                  <Download className="w-8 h-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Report Templates */}
          <Card>
            <CardHeader>
              <CardTitle>Modelos de Relatório</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reportTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors cursor-pointer"
                    data-testid={`report-template-${template.id}`}
                  >
                    <div className="flex items-start space-x-4">
                      <div className={`p-3 ${template.color} rounded-lg`}>
                        <template.icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
                        <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                        <div className="flex space-x-2">
                          <Button size="sm" data-testid={`button-generate-${template.id}`}>
                            <FileText className="w-4 h-4 mr-2" />
                            Gerar
                          </Button>
                          <Button variant="outline" size="sm">
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
                    className="w-full"
                    data-testid="input-search-reports"
                  />
                </div>
                <div className="sm:w-48">
                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger data-testid="select-report-type">
                      <SelectValue placeholder="Tipo de Relatório" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos</SelectItem>
                      <SelectItem value="tax-summary">Resumo Tributário</SelectItem>
                      <SelectItem value="ncm-analysis">Análise NCM</SelectItem>
                      <SelectItem value="jurisdiction-report">Por Competência</SelectItem>
                      <SelectItem value="trend-analysis">Tendências</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:w-48">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger data-testid="select-status-filter">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos</SelectItem>
                      <SelectItem value="completed">Concluído</SelectItem>
                      <SelectItem value="processing">Processando</SelectItem>
                      <SelectItem value="failed">Com Erro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" data-testid="button-filter-reports">
                  <Filter className="w-4 h-4 mr-2" />
                  Filtros
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Reports */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Relatórios Recentes</CardTitle>
                <Button variant="outline" size="sm" data-testid="button-view-all-reports">
                  Ver todos
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nome do Relatório
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Data de Geração
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Formato/Tamanho
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredReports.map((report) => (
                      <tr key={report.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900" data-testid={`report-name-${report.id}`}>
                            {report.name}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant="outline">
                            {reportTemplates.find(t => t.id === report.type)?.name || report.type}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {format(report.generatedAt, "dd/MM/yyyy")}
                          </div>
                          <div className="text-sm text-gray-500">
                            {format(report.generatedAt, "HH:mm")}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(report.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{report.format}</div>
                          <div className="text-sm text-gray-500">{report.fileSize}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            {report.status === "completed" && (
                              <>
                                <Button variant="ghost" size="sm" data-testid={`button-download-${report.id}`}>
                                  <Download className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" data-testid={`button-share-${report.id}`}>
                                  <Share2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="sm" data-testid={`button-view-${report.id}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredReports.length === 0 && (
                <div className="text-center py-12">
                  <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Nenhum relatório encontrado
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Gere seu primeiro relatório usando os modelos acima.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}