import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { UploadModal } from "@/components/UploadModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { parseUTCDate } from "@/lib/dateUtils";

const PAGE_SIZE_OPTIONS = [
  { label: "10 por página", value: 10 },
  { label: "20 por página", value: 20 },
  { label: "50 por página", value: 50 },
  { label: "100 por página", value: 100 },
  { label: "Todos", value: 0 },
];

export default function Uploads() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: uploads, isLoading } = useQuery({
    queryKey: ["/api/uploads"],
  });

  useEffect(() => { setCurrentPage(1); }, [pageSize]);

  const list = (uploads as any[]) ?? [];
  const totalItems = list.length;
  const showAll = pageSize === 0;
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = showAll ? list : list.slice((safePage - 1) * pageSize, safePage * pageSize);

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

  const getFileTypeIcon = (fileType: string) => {
    switch (fileType) {
      case "SPED": return "📄";
      case "XML":  return "📋";
      case "CSV":  return "📊";
      default:     return "📁";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <TopBar
            title="Upload de Arquivos"
            subtitle="Gerencie seus arquivos fiscais e acompanhe o processamento"
            onNewUpload={() => setUploadModalOpen(true)}
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
          title="Upload de Arquivos"
          subtitle="Gerencie seus arquivos fiscais e acompanhe o processamento"
          onNewUpload={() => setUploadModalOpen(true)}
        />

        <div className="p-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle>
                  Histórico de Uploads
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({totalItems} arquivo{totalItems !== 1 ? "s" : ""})
                  </span>
                </CardTitle>
                {totalItems > 0 && (
                  <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                    <SelectTrigger className="w-40 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {totalItems === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Nenhum arquivo enviado ainda
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Faça o upload do seu primeiro arquivo fiscal para começar a análise tributária.
                  </p>
                  <Button onClick={() => setUploadModalOpen(true)} data-testid="button-first-upload">
                    Fazer Primeiro Upload
                  </Button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arquivo</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data de Upload</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {paginated.map((upload: any) => (
                          <tr key={upload.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <span className="text-2xl mr-3">{getFileTypeIcon(upload.fileType)}</span>
                                <div>
                                  <div className="text-sm font-medium text-gray-900" data-testid={`filename-${upload.id}`}>
                                    {upload.filename}
                                  </div>
                                  {upload.errorMessage && (
                                    <div className="text-xs text-red-600" data-testid={`error-${upload.id}`}>
                                      {upload.errorMessage}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm text-gray-900" data-testid={`file-type-${upload.id}`}>{upload.fileType}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm text-gray-900" data-testid={`upload-date-${upload.id}`}>
                                {format(parseUTCDate(upload.uploadedAt), "dd/MM/yyyy HH:mm")}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(upload.status)}</td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-gray-900" data-testid={`description-${upload.id}`}>
                                {upload.description || "-"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginação */}
                  {!showAll && totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-2">
                      <p className="text-sm text-gray-500">
                        Exibindo {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, totalItems)} de {totalItems}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={safePage === 1}
                          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                          .reduce<(number | "...")[]>((acc, p, i, arr) => {
                            if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((item, i) =>
                            item === "..." ? (
                              <span key={`e-${i}`} className="px-1 text-gray-400 text-sm">…</span>
                            ) : (
                              <button
                                key={item}
                                onClick={() => setCurrentPage(item as number)}
                                className={`min-w-[32px] h-8 px-2 rounded text-sm font-medium transition-colors ${
                                  safePage === item ? "bg-primary text-primary-foreground" : "hover:bg-gray-100 text-gray-700"
                                }`}
                              >
                                {item}
                              </button>
                            )
                          )}
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={safePage === totalPages}
                          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <UploadModal open={uploadModalOpen} onOpenChange={setUploadModalOpen} />
    </div>
  );
}
