import { useState } from "react";
import { useSessionFilter } from "@/hooks/useSessionFilter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Users as UsersIcon, UserPlus, Edit, Shield, Mail, Search, Trash2, ShieldAlert } from "lucide-react";
import { UserModal } from "@/components/UserModal";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  createdAt: string;
}

export default function UsersPage() {
  const [searchTerm, setSearchTerm] = useSessionFilter("users-search", "");
  const [roleFilter, setRoleFilter] = useSessionFilter("users-role", "");
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery<any>({ queryKey: ["/api/auth/user"] });
  const { data: usersList = [], isLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const isAdmin = currentUser?.role === "ADMIN";

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário excluído." });
      setDeleteTarget(null);
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  const getRoleBadge = (role: string) => {
    if (role === "ADMIN") return <Badge className="bg-red-100 text-red-800"><Shield className="w-3 h-3 mr-1" />Administrador</Badge>;
    return <Badge className="bg-gray-100 text-gray-800">Padrão</Badge>;
  };

  const filtered = usersList.filter(u => {
    const matchSearch = !searchTerm ||
      u.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = !roleFilter || roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  // Tela de acesso negado para usuários não-admin
  if (!isLoading && !isAdmin) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <TopBar title="Gerenciamento de Usuários" subtitle="Gerencie usuários e permissões" />
          <div className="flex flex-col items-center justify-center h-96 gap-4 text-gray-500">
            <ShieldAlert className="w-16 h-16 text-red-300" />
            <p className="text-lg font-medium">Acesso restrito a administradores</p>
            <p className="text-sm">Você não tem permissão para acessar esta área.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar title="Gerenciamento de Usuários" subtitle="Gerencie usuários e permissões de acesso" />

        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total de Usuários</p>
                  <p className="text-3xl font-bold text-gray-900">{usersList.length}</p>
                </div>
                <UsersIcon className="w-8 h-8 text-blue-600" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Administradores</p>
                  <p className="text-3xl font-bold text-gray-900">{usersList.filter(u => u.role === "ADMIN").length}</p>
                </div>
                <Shield className="w-8 h-8 text-red-500" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Usuários Padrão</p>
                  <p className="text-3xl font-bold text-gray-900">{usersList.filter(u => u.role !== "ADMIN").length}</p>
                </div>
                <UsersIcon className="w-8 h-8 text-gray-400" />
              </CardContent>
            </Card>
          </div>

          {/* Filtros + botão */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex flex-col sm:flex-row gap-4 flex-1">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input placeholder="Buscar por nome, usuário ou email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
                  </div>
                  <div className="sm:w-48">
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger><SelectValue placeholder="Filtrar por tipo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os tipos</SelectItem>
                        <SelectItem value="ADMIN">Administrador</SelectItem>
                        <SelectItem value="USER">Padrão</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={() => { setEditUser(null); setModalOpen(true); }}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Novo Usuário
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tabela */}
          <Card>
            <CardHeader>
              <CardTitle>
                Lista de Usuários
                <span className="ml-2 text-sm font-normal text-gray-500">({filtered.length} usuários)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-12 text-gray-500">Carregando...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuário</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Login</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filtered.map(user => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-sm font-semibold text-blue-700">
                                {user.firstName?.[0]?.toUpperCase()}{user.lastName?.[0]?.toUpperCase()}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {user.firstName} {user.lastName}
                                  {currentUser?.id === user.id && <span className="ml-2 text-xs text-blue-600">(você)</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{user.id}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center text-sm text-gray-600 gap-1">
                              <Mail className="w-3.5 h-3.5" />{user.email || "—"}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">{getRoleBadge(user.role)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => { setEditUser(user); setModalOpen(true); }}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              {currentUser?.id !== user.id && (
                                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(user)}>
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {filtered.length === 0 && (
                    <div className="text-center py-12">
                      <UsersIcon className="mx-auto h-10 w-10 text-gray-300 mb-3" />
                      <p className="text-gray-500">Nenhum usuário encontrado.</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <UserModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditUser(null); }}
        editUser={editUser}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.firstName} {deleteTarget?.lastName}</strong> ({deleteTarget?.id})?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
