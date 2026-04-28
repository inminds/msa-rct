import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";

interface UserForm {
  firstName: string;
  lastName: string;
  email: string;
  role: "USER" | "ADMIN";
  password: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  editUser?: { id: string; firstName: string; lastName: string; email: string; role: string } | null;
}

const EMPTY: UserForm = { firstName: "", lastName: "", email: "", role: "USER", password: "" };

export function UserModal({ open, onClose, editUser }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UserForm>(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const isEditing = !!editUser;

  useEffect(() => {
    if (editUser) {
      setForm({ firstName: editUser.firstName, lastName: editUser.lastName, email: editUser.email, role: editUser.role as "USER" | "ADMIN", password: "" });
    } else {
      setForm(EMPTY);
    }
  }, [editUser, open]);

  const set = <K extends keyof UserForm>(k: K, v: UserForm[K]) => setForm(p => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = isEditing ? `/api/users/${editUser!.id}` : "/api/users";
      const method = isEditing ? "PUT" : "POST";
      const body: any = { firstName: form.firstName, lastName: form.lastName, email: form.email, role: form.role };
      if (!isEditing) { body.password = form.password; }
      else if (form.password) { body.password = form.password; }
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erro ao salvar"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: isEditing ? "Usuário atualizado!" : "Usuário criado!" });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={form.role} onValueChange={v => set("role", v as "USER" | "ADMIN")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">Padrão</SelectItem>
                <SelectItem value="ADMIN">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input placeholder="Nome" value={form.firstName} onChange={e => set("firstName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Sobrenome</Label>
              <Input placeholder="Sobrenome" value={form.lastName} onChange={e => set("lastName", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => set("email", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{isEditing ? "Nova senha (deixe vazio para manter)" : "Senha"}</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={form.password}
                onChange={e => set("password", e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
