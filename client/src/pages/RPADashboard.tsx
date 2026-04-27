import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeftRight, CheckCheck, XCircle, Clock, CheckCircle2, AlertCircle, GitCompareArrows, ChevronLeft, ChevronRight, Search } from "lucide-react";

const PAGE_SIZE_OPTIONS = [
  { label: "10 por página", value: 10 },
  { label: "20 por página", value: 20 },
  { label: "50 por página", value: 50 },
  { label: "100 por página", value: 100 },
  { label: "Todos", value: 0 },
];
import { useToast } from "@/hooks/use-toast";

interface NCMChange {
  id: number;
  ncm: string;
  field: string;
  oldValue: string;
  newValue: string;
  status: "pending" | "accepted" | "rejected";
  scanDate: string;
  resolvedAt: string | null;
}

function StatusBadge({ status }: { status: NCMChange["status"] }) {
  if (status === "pending") return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
  if (status === "accepted") return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />Aceita</Badge>;
  return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Rejeitada</Badge>;
}

export default function RPADashboard() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [acceptAllOpen, setAcceptAllOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery<any>({ queryKey: ["/api/auth/user"] });
  const isAdmin = currentUser?.role === "ADMIN";

  const { data: changes = [], isLoading } = useQuery<NCMChange[]>({
    queryKey: ["/api/ncm-changes", statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/ncm-changes?status=${statusFilter}`, { credentials: "include" });
      return res.json();
    },
    refetchInterval: 30_000,
  });

  // Stats — always fetch all to show counters
  const { data: allChanges = [] } = useQuery<NCMChange[]>({
    queryKey: ["/api/ncm-changes", "all"],
    queryFn: async () => {
      const res = await fetch("/api/ncm-changes?status=all", { credentials: "include" });
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const pending = allChanges.filter(c => c.status === "pending").length;
  const accepted = allChanges.filter(c => c.status === "accepted").length;
  const rejected = allChanges.filter(c => c.status === "rejected").length;

  useEffect(() => { setCurrentPage(1); }, [statusFilter, searchTerm, pageSize]);

  const filtered = changes.filter(c => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.trim().toLowerCase();
    return c.ncm.toLowerCase().includes(term) || c.field.toLowerCase().includes(term);
  });

  const totalItems = filtered.length;
  const showAll = pageSize === 0;
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = showAll ? filtered : filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/ncm-changes"] });
  };

  const acceptAll = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ncm-changes/accept-all", { method: "POST", credentials: "include" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (data) => {
      invalidate();
      setAcceptAllOpen(false);
      toast({ title: `${data.updated} mudança(s) aceita(s) com sucesso!` });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const acceptOne = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/ncm-changes/${id}/accept`, { method: "POST", credentials: "include" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Mudança aceita." }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const rejectOne = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/ncm-changes/${id}/reject`, { method: "POST", credentials: "include" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Mudança rejeitada. Valor anterior restaurado no Excel." }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar
          title="Mudanças em NCMs"
          subtitle="Mudanças detectadas pela varredura automática agendada"
        />

        <div className="p-6 space-y-6">

          {/* Cards de resumo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pendentes</p>
                  <p className="text-3xl font-bold text-yellow-600">{pending}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-400" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Aceitas</p>
                  <p className="text-3xl font-bold text-green-600">{accepted}</p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Rejeitadas</p>
                  <p className="text-3xl font-bold text-red-600">{rejected}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-400" />
              </CardContent>
            </Card>
          </div>

          {/* Barra de ações + filtro */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                {/* Busca por NCM */}
                <div className="relative sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por NCM ou campo..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="sm:w-56">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendentes</SelectItem>
                      <SelectItem value="accepted">Aceitas</SelectItem>
                      <SelectItem value="rejected">Rejeitadas</SelectItem>
                      <SelectItem value="all">Todas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isAdmin && pending > 0 && (
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setAcceptAllOpen(true)}
                  >
                    <CheckCheck className="w-4 h-4 mr-2" />
                    Aceitar Todas ({pending})
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabela de mudanças */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="flex items-center gap-2">
                  <GitCompareArrows className="w-5 h-5 text-gray-500" />
                  Mudanças Detectadas
                  <span className="ml-1 text-sm font-normal text-gray-500">({totalItems} resultado{totalItems !== 1 ? "s" : ""})</span>
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
              {isLoading ? (
                <div className="text-center py-12 text-gray-500">Carregando...</div>
              ) : totalItems === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                  <ArrowLeftRight className="w-12 h-12 text-gray-200" />
                  <p className="text-base font-medium text-gray-500">Nenhuma mudança encontrada</p>
                  <p className="text-sm">As mudanças aparecem aqui após a varredura automática agendada ser executada.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">NCM</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Campo</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor Anterior</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor Novo</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Detectado em</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        {isAdmin && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {paginated.map((change) => (
                        <tr
                          key={change.id}
                          className={
                            change.status === "pending" ? "bg-yellow-50 hover:bg-yellow-100" :
                            change.status === "accepted" ? "bg-green-50 hover:bg-green-100" :
                            "bg-red-50 hover:bg-red-100"
                          }
                        >
                          <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900 whitespace-nowrap">{change.ncm}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{change.field}</td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            <span className="line-through text-red-500">{change.oldValue || "—"}</span>
                          </td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            <span className="font-medium text-green-700">{change.newValue || "—"}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                            {new Date(change.scanDate).toLocaleString("pt-BR")}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusBadge status={change.status} />
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              {change.status === "pending" ? (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                                    disabled={acceptOne.isPending || rejectOne.isPending}
                                    onClick={() => acceptOne.mutate(change.id)}
                                  >
                                    <CheckCheck className="w-3 h-3 mr-1" /> Aceitar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-300 hover:bg-red-50 h-7 text-xs"
                                    disabled={acceptOne.isPending || rejectOne.isPending}
                                    onClick={() => rejectOne.mutate(change.id)}
                                  >
                                    <XCircle className="w-3 h-3 mr-1" /> Rejeitar
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">
                                  {change.resolvedAt ? new Date(change.resolvedAt).toLocaleString("pt-BR") : "—"}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Confirmação: Aceitar Todas */}
      <AlertDialog open={acceptAllOpen} onOpenChange={v => !v && setAcceptAllOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aceitar todas as mudanças?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a aceitar <strong>{pending} mudança{pending !== 1 ? "s" : ""}</strong> de NCMs detectadas pela varredura automática.
              Os novos valores do Econet serão mantidos no Excel. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => acceptAll.mutate()}
              disabled={acceptAll.isPending}
            >
              {acceptAll.isPending ? "Aceitando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
