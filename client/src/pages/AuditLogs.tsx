import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  ScanSearch, Upload, FileText, Users, GitCompareArrows,
  CalendarClock, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  ScrollText, ShieldAlert,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseUTCDate } from "@/lib/dateUtils";

// ── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: number;
  createdAt: string;
  userId: string;
  userName: string;
  action: string;
  category: string;
  details: Record<string, any> | null;
}

// ── Config maps ──────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: "all",        label: "Todas as categorias" },
  { value: "scan",       label: "Varreduras" },
  { value: "upload",     label: "Uploads" },
  { value: "report",     label: "Relatórios" },
  { value: "user",       label: "Usuários" },
  { value: "ncm_change", label: "Mudanças em NCMs" },
  { value: "schedule",   label: "Agendamentos" },
];

const PAGE_SIZE_OPTIONS = [
  { label: "20 por página", value: 20 },
  { label: "50 por página", value: 50 },
  { label: "100 por página", value: 100 },
];

const ACTION_LABELS: Record<string, string> = {
  SCAN_TRIGGERED_TODOS:        "Varredura de todos os NCMs iniciada",
  SCAN_TRIGGERED_INCOMPLETOS:  "Varredura de NCMs pendentes iniciada",
  SCAN_TRIGGERED_SELECIONADOS: "Varredura seletiva de NCMs iniciada",
  SCAN_AUTO_TRIGGERED:         "Varredura automática disparada",
  SCAN_REQUESTED:              "Varredura solicitada",
  SCAN_APPROVED_THAYSSA:       "Solicitação aprovada (1ª etapa — Thayssa)",
  SCAN_APPROVED_YURI:          "Solicitação aprovada e varredura iniciada (Yuri)",
  SCAN_REJECTED:               "Solicitação de varredura rejeitada",
  UPLOAD_CREATED:              "Arquivo enviado",
  UPLOAD_PROCESSED:            "Arquivo processado",
  REPORT_GENERATED:            "Relatório gerado",
  REPORT_DOWNLOADED:           "Relatório baixado",
  USER_CREATED:                "Usuário criado",
  USER_UPDATED:                "Usuário atualizado",
  USER_DELETED:                "Usuário excluído",
  NCM_CHANGE_ACCEPTED:         "Mudança de NCM aceita",
  NCM_CHANGES_ACCEPTED_ALL:    "Todas as mudanças de NCM aceitas",
  NCM_CHANGE_REJECTED:         "Mudança de NCM rejeitada",
  SCHEDULE_CONFIGURED:         "Agendamento configurado",
  SCHEDULE_CANCELLED:          "Agendamento cancelado",
};

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  scan:       <ScanSearch className="w-4 h-4" />,
  upload:     <Upload className="w-4 h-4" />,
  report:     <FileText className="w-4 h-4" />,
  user:       <Users className="w-4 h-4" />,
  ncm_change: <GitCompareArrows className="w-4 h-4" />,
  schedule:   <CalendarClock className="w-4 h-4" />,
};

const CATEGORY_COLOR: Record<string, string> = {
  scan:       "bg-blue-100 text-blue-800",
  upload:     "bg-purple-100 text-purple-800",
  report:     "bg-green-100 text-green-800",
  user:       "bg-orange-100 text-orange-800",
  ncm_change: "bg-yellow-100 text-yellow-800",
  schedule:   "bg-gray-100 text-gray-700",
};

const CATEGORY_LABEL: Record<string, string> = {
  scan:       "Varredura",
  upload:     "Upload",
  report:     "Relatório",
  user:       "Usuário",
  ncm_change: "NCM",
  schedule:   "Agendamento",
};

// ── Detail renderer ──────────────────────────────────────────────────────────

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
      <span className="font-medium text-gray-500">{label}:</span>
      <span className="text-gray-800">{String(value)}</span>
    </span>
  );
}

function renderDetails(action: string, details: Record<string, any> | null): React.ReactNode {
  if (!details) return null;
  const items: React.ReactNode[] = [];

  if (action.startsWith("SCAN_TRIGGERED") || action === "SCAN_AUTO_TRIGGERED") {
    if (details.mode)  items.push(<DetailItem key="mode"  label="Modo"  value={details.mode} />);
    if (details.ncms)  items.push(<DetailItem key="ncms"  label="NCMs"  value={(details.ncms as string[]).join(", ")} />);
    if (details.newNcms?.length) items.push(<DetailItem key="nn" label="NCMs novos" value={(details.newNcms as string[]).join(", ")} />);
  } else if (action === "SCAN_REQUESTED") {
    items.push(<DetailItem key="mode"   label="Modo"       value={details.mode} />);
    items.push(<DetailItem key="reqId"  label="Solicitação" value={`#${details.requestId}`} />);
  } else if (action.startsWith("SCAN_APPROVED") || action === "SCAN_REJECTED") {
    items.push(<DetailItem key="reqId"  label="Solicitação"  value={`#${details.requestId}`} />);
    items.push(<DetailItem key="reqBy"  label="Solicitante"  value={details.requestedBy} />);
    items.push(<DetailItem key="mode"   label="Modo"         value={details.mode} />);
    if (details.note) items.push(<DetailItem key="note" label="Motivo" value={details.note} />);
  } else if (action === "UPLOAD_CREATED") {
    items.push(<DetailItem key="fn"  label="Arquivo"  value={details.filename} />);
    items.push(<DetailItem key="ft"  label="Tipo"     value={details.fileType} />);
    if (details.description) items.push(<DetailItem key="desc" label="Descrição" value={details.description} />);
  } else if (action === "UPLOAD_PROCESSED") {
    items.push(<DetailItem key="total" label="NCMs extraídos"  value={details.totalNcms} />);
    if (details.newNcms?.length) items.push(<DetailItem key="new" label="NCMs novos" value={(details.newNcms as string[]).join(", ")} />);
  } else if (action === "REPORT_GENERATED" || action === "REPORT_DOWNLOADED") {
    items.push(<DetailItem key="name"   label="Nome"    value={details.name ?? details.reportName} />);
    items.push(<DetailItem key="type"   label="Tipo"    value={details.type} />);
    items.push(<DetailItem key="format" label="Formato" value={details.format} />);
  } else if (action === "USER_CREATED" || action === "USER_UPDATED" || action === "USER_DELETED") {
    items.push(<DetailItem key="target" label="Usuário"  value={details.targetName || details.targetId} />);
    items.push(<DetailItem key="email"  label="E-mail"   value={details.email} />);
    items.push(<DetailItem key="role"   label="Perfil"   value={details.role === "ADMIN" ? "Administrador" : details.role ? "Analista Tributário" : ""} />);
    if (action === "USER_UPDATED" && details.passwordChanged)
      items.push(<span key="pw" className="text-xs text-amber-600 font-medium">Senha alterada</span>);
  } else if (action === "NCM_CHANGE_ACCEPTED" || action === "NCM_CHANGE_REJECTED") {
    items.push(<DetailItem key="ncm"   label="NCM"    value={details.ncm} />);
    items.push(<DetailItem key="field" label="Campo"  value={details.field} />);
    items.push(<DetailItem key="old"   label="Antes"  value={details.oldValue} />);
    items.push(<DetailItem key="new"   label="Depois" value={details.newValue} />);
    if (details.restoredToOldValue)
      items.push(<span key="rest" className="text-xs text-red-600 font-medium">Valor restaurado no Excel</span>);
  } else if (action === "NCM_CHANGES_ACCEPTED_ALL") {
    items.push(<DetailItem key="count" label="Mudanças aceitas" value={details.count} />);
  } else if (action === "SCHEDULE_CONFIGURED") {
    items.push(<DetailItem key="en"   label="Ativo"      value={details.enabled ? "Sim" : "Não"} />);
    items.push(<DetailItem key="freq" label="Frequência" value={details.frequency === "weekly" ? "Semanal" : "Mensal"} />);
    items.push(<DetailItem key="hr"   label="Horário"    value={`${String(details.hour).padStart(2,"0")}:${String(details.minute).padStart(2,"0")}`} />);
    items.push(<DetailItem key="mode" label="Modo"       value={details.mode} />);
  }

  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
      {items}
    </div>
  );
}

// ── Row component ────────────────────────────────────────────────────────────

function LogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const label = ACTION_LABELS[log.action] ?? log.action;
  const colorClass = CATEGORY_COLOR[log.category] ?? "bg-gray-100 text-gray-700";
  const catLabel = CATEGORY_LABEL[log.category] ?? log.category;
  const icon = CATEGORY_ICON[log.category] ?? <ScrollText className="w-4 h-4" />;
  const details = renderDetails(log.action, log.details);

  return (
    <tr className="hover:bg-gray-50 border-b border-gray-100">
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-xs text-gray-500">
          {format(parseUTCDate(log.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <Badge className={`${colorClass} flex items-center gap-1 w-fit text-xs`}>
          {icon}
          {catLabel}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {details && (
          <div className="mt-1">
            <button
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? "Ocultar detalhes" : "Ver detalhes"}
            </button>
            {expanded && (
              <div className="mt-1.5 pl-1 border-l-2 border-gray-200">
                {details}
              </div>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-sm text-gray-700 font-medium">{log.userName}</span>
        <span className="block text-xs text-gray-400">{log.userId}</span>
      </td>
    </tr>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AuditLogs() {
  const [category, setCategory] = useState("all");
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { setCurrentPage(1); }, [category, pageSize]);

  const offset = (currentPage - 1) * pageSize;

  const { data, isLoading } = useQuery<{ logs: AuditLog[]; total: number }>({
    queryKey: ["/api/audit-logs", category, pageSize, offset],
    queryFn: async () => {
      const params = new URLSearchParams({
        category,
        limit: String(pageSize),
        offset: String(offset),
      });
      const res = await fetch(`/api/audit-logs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao buscar logs");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar
          title="Logs de Auditoria"
          subtitle="Histórico completo de ações realizadas no sistema"
        />

        <div className="p-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="flex items-center gap-2">
                  <ScrollText className="w-5 h-5 text-gray-500" />
                  Registro de Atividades
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({total} evento{total !== 1 ? "s" : ""})
                  </span>
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="w-48 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                    <SelectTrigger className="w-36 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <div className="text-center py-12 text-gray-400">Carregando...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-16">
                  <ShieldAlert className="mx-auto h-12 w-12 text-gray-200 mb-4" />
                  <h3 className="text-lg font-medium text-gray-700 mb-1">Nenhum log encontrado</h3>
                  <p className="text-sm text-gray-500">
                    {category === "all"
                      ? "As ações realizadas no sistema aparecerão aqui."
                      : "Nenhuma ação registrada para esta categoria ainda."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">Data/Hora</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Categoria</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ação</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-44">Usuário</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {logs.map(log => <LogRow key={log.id} log={log} />)}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginação */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-2">
                      <p className="text-sm text-gray-500">
                        Exibindo {offset + 1}–{Math.min(offset + pageSize, total)} de {total}
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
                                  safePage === item
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-gray-100 text-gray-700"
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
    </div>
  );
}
