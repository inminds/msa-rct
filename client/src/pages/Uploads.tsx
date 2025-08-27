import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { UploadModal } from "@/components/UploadModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Download, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function Uploads() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const { data: uploads, isLoading } = useQuery({
    queryKey: ["/api/uploads"],
  });

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
      case "SPED":
        return "📄";
      case "XML":
        return "📋";
      case "CSV":
        return "📊";
      default:
        return "📁";
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
              <CardTitle>Histórico de Uploads</CardTitle>
            </CardHeader>
            <CardContent>
              {!uploads || uploads.length === 0 ? (
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
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Arquivo
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tipo
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Data de Upload
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Descrição
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {uploads.map((upload: any) => (
                        <tr key={upload.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="text-2xl mr-3">
                                {getFileTypeIcon(upload.fileType)}
                              </span>
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
                            <span className="text-sm text-gray-900" data-testid={`file-type-${upload.id}`}>
                              {upload.fileType}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900" data-testid={`upload-date-${upload.id}`}>
                              {format(new Date(upload.uploadedAt), "dd/MM/yyyy HH:mm")}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(upload.status)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-900" data-testid={`description-${upload.id}`}>
                              {upload.description || "-"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`button-view-${upload.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {upload.status === "COMPLETED" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  data-testid={`button-download-${upload.id}`}
                                >
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

      <UploadModal open={uploadModalOpen} onOpenChange={setUploadModalOpen} />
    </div>
  );
}
