import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { UploadModal } from "@/components/UploadModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, ChevronLeft, ChevronRight, Clock, User, FileText, ChevronDown } from "lucide-react";
import { formatUTC, distanceUTC } from "@/lib/dateUtils";

const PAGE_SIZE_OPTIONS = [
  { label: "10 por página", value: 10 },
  { label: "20 por página", value: 20 },
  { label: "50 por página", value: 50 },
  { label: "100 por página", value: 100 },
  { label: "Todos", value: 0 },
];

const MAX_CHIPS_VISIBLE = 8;

function getStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":  return <Badge className="bg-green-100 text-green-800">Concluído</Badge>;
    case "PROCESSING": return <Badge className="bg-blue-100 text-blue-800">Processando</Badge>;
    case "PENDING":    return <Badge className="bg-amber-100 text-amber-800">Aguardando</Badge>;
    case "ERROR":      return <Badge className="bg-red-100 text-red-800">Erro</Badge>;
    default:           return <Badge>{status}</Badge>;
  }
}

function getFileTypeIcon(fileType: string) {
  switch (fileType) {
    case "SPED": return "📄";
    case "XML":  return "📋";
    case "CSV":  return "📊";
    default:     return "📁";
  }
}

function UploadRow({ upload }: { upload: any }) {
  const [ncmsExpanded, setNcmsExpanded] = useState(false);

  const ncms: string[] = upload.extractedNcms ?? [];
  const visible = ncmsExpanded ? ncms : ncms.slice(0, MAX_CHIPS_VISIBLE);
  const hidden = ncms.length - MAX_CHIPS_VISIBLE;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors">
      {/* Linha principal */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">{getFileTypeIcon(upload.fileType)}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate" data-testid={`filename-${upload.id}`}>
              {upload.filename}
            </p>
            {upload.errorMessage && (
              <p className="text-xs text-red-600 mt-0.5" data-testid={`error-${upload.id}`}>
                {upload.errorMessage}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-xs font-mono">{upload.fileType}</Badge>
          {getStatusBadge(upload.status)}
        </div>
      </div>

      {/* Linha de metadados */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <User className="w-3.5 h-3.5" />
          {upload.uploaderName ?? "—"}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-medium text-gray-700">{formatUTC(upload.uploadedAt, "dd/MM/yyyy HH:mm")}</span>
          <span className="text-gray-400">({distanceUTC(upload.uploadedAt)})</span>
        </span>
        {upload.description && (
          <span className="flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />
            {upload.description}
          </span>
        )}
      </div>

      {/* NCMs extraídos */}
      {ncms.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-2">
            NCMs extraídos
            <span className="ml-1.5 rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-xs font-semibold">
              {ncms.length}
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visible.map(ncm => (
              <span
                key={ncm}
                className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-mono text-gray-700"
              >
                {ncm}
              </span>
            ))}
            {!ncmsExpanded && hidden > 0 && (
              <button
                onClick={() => setNcmsExpanded(true)}
                className="inline-flex items-center gap-0.5 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-100 transition-colors"
              >
                <ChevronDown className="w-3 h-3" />
                +{hidden} mais
              </button>
            )}
            {ncmsExpanded && ncms.length > MAX_CHIPS_VISIBLE && (
              <button
                onClick={() => setNcmsExpanded(false)}
                className="inline-flex items-center gap-0.5 rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
              >
                <ChevronDown className="w-3 h-3 rotate-180" />
                recolher
              </button>
            )}
          </div>
        </div>
      )}

      {ncms.length === 0 && upload.status === "COMPLETED" && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 italic">Nenhum NCM extraído deste arquivo.</p>
        </div>
      )}
    </div>
  );
}

export default function Uploads() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: uploads, isLoading } = useQuery({ queryKey: ["/api/uploads"] });

  useEffect(() => { setCurrentPage(1); }, [pageSize]);

  const list = (uploads as any[]) ?? [];
  const totalItems = list.length;
  const showAll = pageSize === 0;
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = showAll ? list : list.slice((safePage - 1) * pageSize, safePage * pageSize);

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
          <div className="p-6"><div className="text-center">Carregando...</div></div>
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
                    <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
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
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum arquivo enviado ainda</h3>
                  <p className="text-gray-600 mb-6">
                    Faça o upload do seu primeiro arquivo fiscal para começar a análise tributária.
                  </p>
                  <Button onClick={() => setUploadModalOpen(true)} data-testid="button-first-upload">
                    Fazer Primeiro Upload
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {paginated.map((upload: any) => (
                      <UploadRow key={upload.id} upload={upload} />
                    ))}
                  </div>

                  {/* Paginação */}
                  {!showAll && totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-4">
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
