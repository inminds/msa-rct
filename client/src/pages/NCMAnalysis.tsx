import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, RefreshCw } from "lucide-react";

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

  const { data: ncmRows, isLoading, refetch } = useQuery<NCMRow[]>({
    queryKey: ["/api/ncm-excel"],
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
    </div>
  );
}
