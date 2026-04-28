import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator, FileText, BarChart3, Upload } from "lucide-react";
import { apiFetch } from "@/api/client"; // ajuste o path conforme sua estrutura

async function demoLogin() {
  try {
    // Chama a rota já com x-demo-key
    await apiFetch("/api/login", { method: "POST", body: JSON.stringify({ from: "landing" }) });
    // se a sua rota de app interna for outra, troque aqui
    window.location.href = "/app";
  } catch (e: any) {
    alert("Falha no login da demo: " + e.message);
  }
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center mr-4">
              <Calculator className="text-white text-2xl" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Revisão da Classificação Tributária</h1>
              <p className="text-lg text-gray-600">Machado Schütz Advogados</p>
            </div>
          </div>
          <p className="text-xl text-gray-700 max-w-2xl mx-auto">
            Transforme seu processo de análise tributária com automação inteligente. 
            Processe arquivos fiscais, extraia NCMs e calcule tributos automaticamente.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <Card>
            <CardContent className="p-6 text-center">
              <Upload className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Upload Inteligente</h3>
              <p className="text-gray-600">
                Processe arquivos SPED, XML e CSV com extração automática de NCMs
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <FileText className="w-12 h-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Análise Tributária</h3>
              <p className="text-gray-600">
                Cálculo automático de ICMS, IPI, PIS e COFINS por competência
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <BarChart3 className="w-12 h-12 text-purple-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Relatórios Completos</h3>
              <p className="text-gray-600">
                Exportação em PDF, Excel e CSV com análises detalhadas
              </p>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold mb-4">Machado Schütz Advogados</h2>
              <p className="text-gray-600 mb-6">
                Faça login para acessar a plataforma de diagnóstico tributário
              </p>
              <Button
                size="lg"
                className="w-full bg-blue-600 hover:bg-blue-700"
                //onClick={() => window.location.href = "/api/login"}
                onClick={demoLogin}
                data-testid="button-login"
              >
                Acessar Plataforma
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
