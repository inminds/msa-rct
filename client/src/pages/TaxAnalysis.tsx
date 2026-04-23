import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  Equal,
  Filter,
  Search,
  Download,
  Eye,
  AlertTriangle
} from "lucide-react";

export default function TaxAnalysis() {
  const [searchTerm, setSearchTerm] = useState("");
  const [jurisdictionFilter, setJurisdictionFilter] = useState("");
  const [taxTypeFilter, setTaxTypeFilter] = useState("");

  const { data: recentAnalyses, isLoading } = useQuery({
    queryKey: ["/api/analyses/recent"],
  });

  const { data: taxDistribution } = useQuery({
    queryKey: ["/api/dashboard/tax-distribution"],
  });

  const { data: jurisdictionDistribution } = useQuery({
    queryKey: ["/api/dashboard/jurisdiction-distribution"],
  });

  const { data: alertsSummary } = useQuery<{
    pendingScans: number;
    pendingChanges: number;
  }>({
    queryKey: ["/api/tax-analysis/alerts"],
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

  const getVariationIcon = (variation: number) => {
    if (variation > 0) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (variation < 0) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Equal className="w-4 h-4 text-gray-600" />;
  };

  const filteredAnalyses = (recentAnalyses as any[])?.filter((analysis: any) => {
    const matchesSearch = !searchTerm || 
      analysis.ncmCode.includes(searchTerm) ||
      analysis.productName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesJurisdiction = !jurisdictionFilter || jurisdictionFilter === "all" ||
      analysis.tributes?.some((t: any) => t.jurisdiction === jurisdictionFilter);
    
    const matchesTaxType = !taxTypeFilter || taxTypeFilter === "all" ||
      analysis.tributes?.some((t: any) => t.type === taxTypeFilter);
    
    return matchesSearch && matchesJurisdiction && matchesTaxType;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <TopBar
            title="Análise Tributária"
            subtitle="Análise detalhada de tributos por NCM e competência"
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
          title="Análise Tributária"
          subtitle="Análise detalhada de tributos por NCM e competência"
        />

        <div className="p-6 space-y-6">
          {/* Tax Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {taxDistribution && Object.entries(taxDistribution as Record<string, number>).map(([type, count]) => (
              <Card key={type}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">{type.toUpperCase()}</p>
                      <p className="text-3xl font-bold text-gray-900" data-testid={`tax-analysis-${type}`}>
                        {count}
                      </p>
                    </div>
                    <div className={`w-12 h-12 ${getTaxColor(type.toUpperCase())} bg-opacity-20 rounded-lg flex items-center justify-center`}>
                      <Calculator className="text-gray-800 text-xl" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-sm">
                    {getVariationIcon(Math.random() > 0.5 ? 5 : -2)}
                    <span className={`font-medium ml-1 ${Math.random() > 0.5 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.random() > 0.5 ? '+5%' : '-2%'}
                    </span>
                    <span className="text-gray-500 ml-1">vs período anterior</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Jurisdiction Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Análise por Competência</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {jurisdictionDistribution && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900">Tributos Federais</span>
                          <span className="text-lg font-bold text-gray-900">
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
                        <p className="text-sm text-gray-500 mt-1">PIS, COFINS, IPI</p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900">Tributos Estaduais</span>
                          <span className="text-lg font-bold text-gray-900">
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
                        <p className="text-sm text-gray-500 mt-1">ICMS</p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Alertas e Exceções</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">NCMs pendentes para varredura</p>
                      <p className="text-xs text-amber-600">
                        {(alertsSummary?.pendingScans ?? 0)} códigos aguardando busca no Econet
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <AlertTriangle className="w-5 h-5 text-blue-600 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">Mudanças aguardando aprovação</p>
                      <p className="text-xs text-blue-600">
                        {(alertsSummary?.pendingChanges ?? 0)} alteração(ões) identificadas no Econet
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Buscar por NCM ou produto..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-tax-search"
                    />
                  </div>
                </div>
                <div className="sm:w-48">
                  <Select value={jurisdictionFilter} onValueChange={setJurisdictionFilter}>
                    <SelectTrigger data-testid="select-jurisdiction-filter">
                      <SelectValue placeholder="Competência" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="FEDERAL">Federal</SelectItem>
                      <SelectItem value="ESTADUAL">Estadual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:w-48">
                  <Select value={taxTypeFilter} onValueChange={setTaxTypeFilter}>
                    <SelectTrigger data-testid="select-tax-type-filter">
                      <SelectValue placeholder="Tipo de Tributo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="ICMS">ICMS</SelectItem>
                      <SelectItem value="IPI">IPI</SelectItem>
                      <SelectItem value="PIS">PIS</SelectItem>
                      <SelectItem value="COFINS">COFINS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" data-testid="button-export-analysis">
                  <Download className="w-4 h-4 mr-2" />
                  Exportar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Analysis Results */}
          <Card>
            <CardHeader>
              <CardTitle>
                Análises Detalhadas
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({filteredAnalyses?.length || 0} resultados)
                </span>
              </CardTitle>
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
                        Tributos
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Alíquota Total
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Competência
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredAnalyses?.map((analysis: any) => {
                      const totalRate = analysis.tributes?.reduce((sum: number, t: any) => sum + (parseFloat(String(t.rate).replace(",", ".")) || 0), 0) ?? 0;
                      return (
                        <tr key={analysis.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-mono text-sm font-medium text-gray-900">
                              {analysis.ncmCode}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              {analysis.productName || analysis.description}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {analysis.tributes?.map((tribute: any) => (
                                <Badge
                                  key={tribute.id}
                                  className={`${getTaxColor(tribute.type)} bg-opacity-20 text-gray-800`}
                                >
                                  {tribute.type} {tribute.rate}%
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-lg font-bold text-gray-900">
                              {totalRate.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              {analysis.tributes?.some((t: any) => t.jurisdiction === "FEDERAL") && (
                                <Badge className="bg-green-100 text-green-800 text-xs">Federal</Badge>
                              )}
                              {analysis.tributes?.some((t: any) => t.jurisdiction === "ESTADUAL") && (
                                <Badge className="bg-purple-100 text-purple-800 text-xs">Estadual</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <Button variant="ghost" size="sm">
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm">
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!filteredAnalyses || filteredAnalyses.length === 0 ? (
                <div className="text-center py-12">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Nenhuma análise encontrada
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
    </div>
  );
}
