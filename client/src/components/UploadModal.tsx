import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadModal({ open, onOpenChange }: UploadModalProps) {
  const [fileType, setFileType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (data: { file: File; fileType: string; description: string }) => {
      const formData = new FormData();
      formData.append("file", data.file);
      formData.append("fileType", data.fileType);
      formData.append("description", data.description);

      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`${response.status}: ${await response.text()}`);
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Upload iniciado",
        description: "O arquivo está sendo processado. Você será notificado quando concluído.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/uploads/recent"] });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Erro no upload",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setFileType("");
    setDescription("");
    setFile(null);
    onOpenChange(false);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    if (!file || !fileType) {
      toast({
        title: "Campos obrigatórios",
        description: "Selecione um arquivo e o tipo de arquivo.",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate({ file, fileType, description });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Upload de Arquivo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="fileType">Tipo de Arquivo</Label>
            <Select value={fileType} onValueChange={setFileType}>
              <SelectTrigger data-testid="select-file-type">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SPED">SPED Fiscal (.txt)</SelectItem>
                <SelectItem value="TXT_NCM">Lista de NCMs (.txt)</SelectItem>
                <SelectItem value="XML">XML NFe (.xml)</SelectItem>
                <SelectItem value="CSV">CSV Produtos (.csv)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Arquivo</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                dragActive
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-300 hover:border-blue-400"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-input")?.click()}
              data-testid="file-drop-zone"
            >
              <Upload className="mx-auto text-gray-400 text-3xl mb-3" />
              {file ? (
                <div>
                  <p className="text-gray-900 font-medium" data-testid="selected-file-name">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-gray-600">
                    Arraste o arquivo aqui ou{" "}
                    <span className="text-blue-600 font-medium">clique para selecionar</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Suporta: .txt, .xml, .csv (máx. 50MB)
                  </p>
                </>
              )}
              <input
                id="file-input"
                type="file"
                className="hidden"
                accept=".txt,.xml,.csv"
                onChange={handleFileChange}
                data-testid="input-file"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Adicione uma descrição para este arquivo..."
              rows={3}
              data-testid="textarea-description"
            />
          </div>

          {fileType === "TXT_NCM" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Neste modo, cada linha deve conter apenas um NCM. Exemplo: <strong>8528.52.00</strong> ou <strong>85285200</strong>.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end space-x-3 pt-4">
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={uploadMutation.isPending}
            data-testid="button-submit"
          >
            {uploadMutation.isPending ? (
              "Enviando..."
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Fazer Upload
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
