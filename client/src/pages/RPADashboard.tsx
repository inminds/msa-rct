import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  AlertTriangle, 
  Activity, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  ExternalLink,
  Play,
  AlertCircle,
  BarChart3
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function RPADashboard() {
  // Fetch RPA status
  const { data: rpaStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/rpa/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch recent changes
  const { data: recentChanges, isLoading: changesLoading } = useQuery({
    queryKey: ['/api/rpa/recent-changes'],
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch critical changes
  const { data: criticalChanges, isLoading: criticalLoading } = useQuery({
    queryKey: ['/api/rpa/critical-changes'],
    refetchInterval: 30000,
  });

  // Fetch statistics
  const { data: rpaStats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/rpa/statistics'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const executeRPA = async (portalName?: string) => {
    try {
      const response = await fetch('/api/rpa/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal_name: portalName })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('RPA execution started:', result);
        // Refresh data after execution
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch (error) {
      console.error('Error executing RPA:', error);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Ativo
        </Badge>;
      case 'running':
        return <Badge variant="default" className="bg-blue-100 text-blue-800 border-blue-200">
          <Activity className="w-3 h-3 mr-1 animate-pulse" />
          Executando
        </Badge>;
      case 'error':
        return <Badge variant="destructive">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Erro
        </Badge>;
      default:
        return <Badge variant="secondary">Desconhecido</Badge>;
    }
  };

  const getSeverityBadge = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive" className="bg-red-600">
          🚨 CRÍTICO
        </Badge>;
      case 'high':
        return <Badge variant="destructive" className="bg-orange-600">
          ⚠️ ALTO
        </Badge>;
      case 'medium':
        return <Badge variant="secondary" className="bg-yellow-600 text-white">
          📢 MÉDIO
        </Badge>;
      case 'low':
        return <Badge variant="outline">
          ℹ️ BAIXO
        </Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="rpa-dashboard">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">RPA Legal Intelligence</h1>
          <p className="text-muted-foreground">
            Monitoramento automático de mudanças em legislações tributárias
          </p>
        </div>
        <div className="space-x-2">
          <Button
            onClick={() => executeRPA()}
            disabled={rpaStatus?.service_status === 'running'}
            data-testid="button-execute-all"
          >
            <Play className="w-4 h-4 mr-2" />
            Executar RPA
          </Button>
        </div>
      </div>

      {/* Critical Alerts */}
      {criticalChanges?.critical_changes?.length > 0 && (
        <Alert className="border-red-200 bg-red-50" data-testid="critical-alert">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">
            Alertas Críticos Pendentes
          </AlertTitle>
          <AlertDescription className="text-red-700">
            {criticalChanges.total_critical} mudanças críticas detectadas que requerem atenção imediata.
          </AlertDescription>
        </Alert>
      )}

      {/* Status Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-system-status">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status do Sistema</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-1">
              {statusLoading ? "..." : getStatusBadge((rpaStatus as any)?.service_status || 'unknown')}
            </div>
            <p className="text-xs text-muted-foreground">
              {(rpaStatus as any)?.portals_monitored?.length || 0} portais monitorados
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-executions-today">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Execuções Hoje</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(rpaStatus as any)?.successful_executions_today || 0}/{(rpaStatus as any)?.total_executions_today || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {(rpaStatus as any)?.total_executions_today > 0 
                ? Math.round(((rpaStatus as any).successful_executions_today / (rpaStatus as any).total_executions_today) * 100)
                : 0}% sucesso
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-changes-detected">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mudanças Hoje</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {rpaStatus?.changes_detected_today || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {criticalChanges?.total_critical || 0} críticas
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-next-execution">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próxima Execução</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sm">
              {rpaStatus?.next_scheduled_execution
                ? formatDistanceToNow(new Date(rpaStatus.next_scheduled_execution), { 
                    locale: ptBR, 
                    addSuffix: true 
                  })
                : "Não agendado"}
            </div>
            <p className="text-xs text-muted-foreground">
              Execução automática
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard Tabs */}
      <Tabs defaultValue="changes" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="changes" data-testid="tab-changes">Mudanças Recentes</TabsTrigger>
          <TabsTrigger value="statistics" data-testid="tab-statistics">Estatísticas</TabsTrigger>
          <TabsTrigger value="portals" data-testid="tab-portals">Portais</TabsTrigger>
        </TabsList>

        {/* Recent Changes Tab */}
        <TabsContent value="changes" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Critical Changes */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center text-red-700">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Mudanças Críticas
                </CardTitle>
                <CardDescription>
                  Requerem atenção imediata
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {criticalLoading ? (
                  <div className="text-sm text-muted-foreground">Carregando...</div>
                ) : criticalChanges?.critical_changes?.length > 0 ? (
                  criticalChanges.critical_changes.map((change: any) => (
                    <div key={change.id} className="p-3 border border-red-200 rounded-lg bg-red-50" data-testid={`critical-change-${change.id}`}>
                      <div className="font-medium text-sm text-red-800">
                        {change.title}
                      </div>
                      <div className="text-xs text-red-600 mt-1">
                        {change.portal_name} • {formatDistanceToNow(new Date(change.detected_at), { locale: ptBR, addSuffix: true })}
                      </div>
                      {change.impact_description && (
                        <div className="text-xs text-red-700 mt-2 italic">
                          {change.impact_description}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">
                    🎉 Nenhuma mudança crítica no momento
                  </div>
                )}
              </CardContent>
            </Card>

            {/* All Recent Changes */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Todas as Mudanças</CardTitle>
                <CardDescription>
                  Mudanças detectadas recentemente em todos os portais
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {changesLoading ? (
                  <div className="text-sm text-muted-foreground">Carregando mudanças...</div>
                ) : recentChanges?.changes?.length > 0 ? (
                  recentChanges.changes.map((change: any) => (
                    <div key={change.id} className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50" data-testid={`change-${change.id}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getSeverityBadge(change.severity)}
                          <span className="text-xs text-muted-foreground">
                            {change.portal_name}
                          </span>
                        </div>
                        <div className="font-medium text-sm mb-1">
                          {change.title}
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          {change.diff_summary}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {change.keywords?.map((keyword: string) => (
                            <Badge key={keyword} variant="outline" className="text-xs px-1 py-0">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end ml-4">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={change.url} target="_blank" rel="noopener noreferrer" data-testid={`link-change-${change.id}`}>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(change.detected_at), { locale: ptBR, addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    Nenhuma mudança recente detectada
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="statistics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Execuções (30 dias)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {statsLoading ? (
                  <div className="text-sm text-muted-foreground">Carregando estatísticas...</div>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Taxa de Sucesso</span>
                      <span className="font-bold text-green-600">{rpaStats?.success_rate || '0%'}</span>
                    </div>
                    <Progress value={parseFloat(rpaStats?.success_rate || '0')} className="h-2" />
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Total de Execuções</span>
                        <span className="font-medium">{rpaStats?.total_executions || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Sucessos</span>
                        <span className="font-medium text-green-600">{rpaStats?.successful_executions || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Falhas</span>
                        <span className="font-medium text-red-600">{rpaStats?.failed_executions || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Tempo Médio</span>
                        <span className="font-medium">{rpaStats?.avg_execution_time_minutes || 0} min</span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mudanças por Severidade</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {statsLoading ? (
                  <div className="text-sm text-muted-foreground">Carregando...</div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(rpaStats?.changes_by_severity || {}).map(([severity, count]) => (
                      <div key={severity} className="flex justify-between items-center">
                        {getSeverityBadge(severity)}
                        <span className="font-bold">{count as number}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Portals Tab */}
        <TabsContent value="portals" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rpaStatus?.portals_monitored?.map((portal: string) => (
              <Card key={portal} data-testid={`portal-card-${portal.toLowerCase().replace(/\s+/g, '-')}`}>
                <CardHeader>
                  <CardTitle className="text-lg">{portal}</CardTitle>
                  <CardDescription>
                    Portal de legislação tributária
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Status</span>
                    {getStatusBadge('active')}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Mudanças (30d)</span>
                    <span className="font-medium">
                      {rpaStats?.changes_by_portal?.[portal] || 0}
                    </span>
                  </div>
                  <Separator />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => executeRPA(portal)}
                    className="w-full"
                    data-testid={`button-execute-${portal.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Play className="w-3 h-3 mr-2" />
                    Executar {portal}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}