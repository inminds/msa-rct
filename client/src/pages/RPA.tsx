import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { 
  Bot, 
  Play,
  Pause,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  Globe,
  FileText,
  Bell,
  Calendar,
  TrendingUp,
  Eye,
  Download
} from "lucide-react";
import { format } from "date-fns";

export default function RPA() {
  const [rpaEnabled, setRpaEnabled] = useState(true);
  const [autoValidation, setAutoValidation] = useState(false);

  // Mock RPA data
  const rpaStatus = {
    status: "running",
    lastExecution: new Date("2024-01-27T14:23:00"),
    nextExecution: new Date("2024-01-27T18:00:00"),
    totalExecutions: 247,
    successRate: 94.5,
    averageDuration: "12 min",
  };

  const monitoredSources = [
    {
      id: "econet",
      name: "Econet Online",
      url: "https://econet.com.br",
      status: "active",
      lastCheck: new Date("2024-01-27T14:23:00"),
      changesDetected: 3,
      reliability: 98.2,
    },
    {
      id: "receita-federal",
      name: "Receita Federal",
      url: "https://www.gov.br/receitafederal",
      status: "active",
      lastCheck: new Date("2024-01-27T14:20:00"),
      changesDetected: 1,
      reliability: 96.7,
    },
    {
      id: "sefaz-sp",
      name: "SEFAZ São Paulo",
      url: "https://www.fazenda.sp.gov.br",
      status: "warning",
      lastCheck: new Date("2024-01-27T14:18:00"),
      changesDetected: 2,
      reliability: 89.3,
    },
    {
      id: "confaz",
      name: "CONFAZ",
      url: "https://www.confaz.fazenda.gov.br",
      status: "inactive",
      lastCheck: new Date("2024-01-27T12:15:00"),
      changesDetected: 0,
      reliability: 85.1,
    },
  ];

  const recentChanges = [
    {
      id: "1",
      source: "Econet Online",
      type: "ICMS",
      description: "Alteração na alíquota de ICMS para NCM 84482000",
      detectedAt: new Date("2024-01-27T14:23:00"),
      impact: "high",
      status: "pending",
    },
    {
      id: "2",
      source: "Receita Federal",
      type: "IPI",
      description: "Nova tabela TIPI publicada - IPI para produtos eletrônicos",
      detectedAt: new Date("2024-01-27T13:15:00"),
      impact: "medium",
      status: "validated",
    },
    {
      id: "3",
      source: "SEFAZ São Paulo",
      type: "ICMS",
      description: "Regulamento ICMS/SP - Substituição tributária",
      detectedAt: new Date("2024-01-27T11:45:00"),
      impact: "high",
      status: "pending",
    },
    {
      id: "4",
      source: "Econet Online",
      type: "PIS/COFINS",
      description: "Atualização nas alíquotas de PIS/COFINS",
      detectedAt: new Date("2024-01-26T16:30:00"),
      impact: "low",
      status: "validated",
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge className="bg-green-100 text-green-800">Executando</Badge>;
      case "active":
        return <Badge className="bg-green-100 text-green-800">Ativo</Badge>;
      case "warning":
        return <Badge className="bg-amber-100 text-amber-800">Atenção</Badge>;
      case "inactive":
        return <Badge className="bg-gray-100 text-gray-800">Inativo</Badge>;
      case "error":
        return <Badge className="bg-red-100 text-red-800">Erro</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case "high":
        return <Badge className="bg-red-100 text-red-800">Alto</Badge>;
      case "medium":
        return <Badge className="bg-amber-100 text-amber-800">Médio</Badge>;
      case "low":
        return <Badge className="bg-blue-100 text-blue-800">Baixo</Badge>;
      default:
        return <Badge>{impact}</Badge>;
    }
  };

  const getChangeStatusBadge = (status: string) => {
    switch (status) {
      case "validated":
        return <Badge className="bg-green-100 text-green-800">Validado</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 text-amber-800">Pendente</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800">Rejeitado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <TopBar
          title="RPA - Monitoramento de Legislação"
          subtitle="Automação de captura e análise de mudanças na legislação tributária"
        />

        <div className="p-6 space-y-6">
          {/* RPA Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Status do RPA</p>
                    <div className="flex items-center mt-2">
                      {getStatusBadge(rpaStatus.status)}
                    </div>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Bot className="text-green-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Taxa de Sucesso</p>
                    <p className="text-3xl font-bold text-gray-900" data-testid="rpa-success-rate">
                      {rpaStatus.successRate}%
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="text-blue-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Execuções Totais</p>
                    <p className="text-3xl font-bold text-gray-900" data-testid="rpa-total-executions">
                      {rpaStatus.totalExecutions}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Clock className="text-purple-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Duração Média</p>
                    <p className="text-3xl font-bold text-gray-900" data-testid="rpa-avg-duration">
                      {rpaStatus.averageDuration}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Clock className="text-amber-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RPA Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Controles do RPA</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">RPA Ativo</h4>
                      <p className="text-sm text-gray-600">Habilitar/desabilitar monitoramento automático</p>
                    </div>
                    <Switch 
                      checked={rpaEnabled} 
                      onCheckedChange={setRpaEnabled}
                      data-testid="switch-rpa-enabled"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">Validação Automática</h4>
                      <p className="text-sm text-gray-600">Validar automaticamente mudanças de baixo impacto</p>
                    </div>
                    <Switch 
                      checked={autoValidation} 
                      onCheckedChange={setAutoValidation}
                      data-testid="switch-auto-validation"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">Próxima Execução</span>
                      <span className="text-sm text-gray-600" data-testid="next-execution-time">
                        {format(rpaStatus.nextExecution, "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">Última Execução</span>
                      <span className="text-sm text-gray-600" data-testid="last-execution-time">
                        {format(rpaStatus.lastExecution, "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <Button data-testid="button-run-now">
                      <Play className="w-4 h-4 mr-2" />
                      Executar Agora
                    </Button>
                    <Button variant="outline" data-testid="button-configure">
                      <Settings className="w-4 h-4 mr-2" />
                      Configurar
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Monitored Sources */}
          <Card>
            <CardHeader>
              <CardTitle>Fontes Monitoradas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {monitoredSources.map((source) => (
                  <div
                    key={source.id}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                    data-testid={`source-${source.id}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-medium text-gray-900">{source.name}</h4>
                        <p className="text-sm text-gray-600 flex items-center">
                          <Globe className="w-4 h-4 mr-1" />
                          {source.url}
                        </p>
                      </div>
                      {getStatusBadge(source.status)}
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Última verificação:</span>
                        <span className="text-gray-900">
                          {format(source.lastCheck, "HH:mm")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Mudanças detectadas:</span>
                        <span className="text-gray-900 font-medium">
                          {source.changesDetected}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Confiabilidade:</span>
                        <span className="text-gray-900 font-medium">
                          {source.reliability}%
                        </span>
                      </div>
                      <Progress value={source.reliability} className="h-2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Changes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Mudanças Detectadas Recentemente</CardTitle>
                <div className="flex items-center space-x-2">
                  <Badge className="bg-amber-100 text-amber-800">
                    {recentChanges.filter(c => c.status === 'pending').length} pendentes
                  </Badge>
                  <Button variant="outline" size="sm" data-testid="button-view-all-changes">
                    Ver todas
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fonte
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Descrição
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Detectado em
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Impacto
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
                    {recentChanges.map((change) => (
                      <tr key={change.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {change.source}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant="outline">{change.type}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 max-w-xs truncate" data-testid={`change-description-${change.id}`}>
                            {change.description}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {format(change.detectedAt, "dd/MM/yyyy")}
                          </div>
                          <div className="text-sm text-gray-500">
                            {format(change.detectedAt, "HH:mm")}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getImpactBadge(change.impact)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getChangeStatusBadge(change.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm" data-testid={`button-view-${change.id}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            {change.status === "pending" && (
                              <Button variant="ghost" size="sm" data-testid={`button-validate-${change.id}`}>
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" data-testid={`button-download-${change.id}`}>
                              <Download className="w-4 h-4" />
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
        </div>
      </main>
    </div>
  );
}