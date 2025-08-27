import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Check, Eye, Search, Filter } from "lucide-react";

export default function NCMAnalysis() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: recentAnalyses, isLoading } = useQuery({
    queryKey: ["/api/analyses/recent"],
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

  const getJurisdictionBadge = (tributes: any[]) => {
    const hasState = tributes.some(t => t.jurisdiction === "ESTADUAL");
    const hasFederal = tributes.some(t => t.jurisdiction === "FEDERAL");
    
    if (hasState && hasFederal) {
      return <Badge className="bg-blue-100 text-blue-800">Mista</Badge>;
    } else if (hasState) {
      return <Badge className="bg-purple-100 text-purple-800">Estadual</Badge>;
    } else if (hasFederal) {
      return <Badge className="bg-green-100 text-green-800">Federal</Badge>;
    }
    return <Badge>-</Badge>;
  };

  const isValidated = (tributes: any[]) => {
    return tributes.some(t => t.validated);
  };

  const filteredAnalyses = (recentAnalyses as any[])?.filter((analysis: any) => {
    const matchesSearch = !searchTerm || 
      analysis.ncmCode.includes(searchTerm) ||
      analysis.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      analysis.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = !statusFilter || statusFilter === "all" ||
      (statusFilter === "validated" && isValidated(analysis.tributes)) ||
      (statusFilter === "pending" && !isValidated(analysis.tributes));
    
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

        <div className="p-6 space-y-6">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Buscar por NCM, produto ou descrição..."
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
                      <SelectItem value="validated">Validados</SelectItem>
                      <SelectItem value="pending">Pendentes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" data-testid="button-advanced-filters">
                  <Filter className="w-4 h-4 mr-2" />
                  Filtros Avançados
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
                        Tributos Aplicáveis
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Competência
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
                    {filteredAnalyses?.map((analysis: any) => (
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
                          {analysis.description && analysis.productName && (
                            <div className="text-sm text-gray-500" data-testid={`product-description-${analysis.id}`}>
                              {analysis.description}
                            </div>
                          )}
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
                          {getJurisdictionBadge(analysis.tributes || [])}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {isValidated(analysis.tributes || []) ? (
                            <Badge className="bg-green-100 text-green-800">Validado</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800">Pendente</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-edit-${analysis.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            {!isValidated(analysis.tributes || []) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600 hover:text-green-700"
                                data-testid={`button-validate-${analysis.id}`}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-view-${analysis.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!filteredAnalyses || filteredAnalyses.length === 0 ? (
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
    </div>
  );
}
