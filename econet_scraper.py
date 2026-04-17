"""
Econet Editora — Scraper PIS/COFINS por NCM
============================================
- 1ª execução: abre browser visível, aguarda reCAPTCHA (ou tenta automaticamente),
  salva sessão em session.json para não precisar mais de login.
- Execuções seguintes: carrega sessão salva, roda sem interação humana.
- Lê NCMs de bcoDados.xlsx (coluna A) e grava resultados nas colunas B-I.
"""

import asyncio
import io
import json
import os
import re
import shutil
import sys
from pathlib import Path

# Fix encoding no Windows (terminal cp1252 nao suporta Unicode)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

# ──────────────────────── Config ────────────────────────
BASE_DIR   = Path(__file__).parent
XLSX_PATH  = BASE_DIR / "bcoDados.xlsx"
SESSION    = BASE_DIR / "session.json"

ECONET_URL = "https://www.econeteditora.com.br/"
LOGIN      = "onu41041"
SENHA      = "ms6003"
# ────────────────────────────────────────────────────────


def formatar_ncm(raw) -> str:
    """84714190 → '8471.41.90'"""
    s = str(int(raw)).zfill(8)
    return f"{s[:4]}.{s[4:6]}.{s[6:]}"


def _abrir_workbook(read_only=True):
    """Abre bcoDados.xlsx, usando cópia temporária se estiver bloqueado."""
    try:
        wb = openpyxl.load_workbook(XLSX_PATH, read_only=read_only)
        return wb, None
    except PermissionError:
        tmp = XLSX_PATH.parent / "_tmp_read.xlsx"
        shutil.copy2(XLSX_PATH, tmp)
        return openpyxl.load_workbook(tmp, read_only=read_only), tmp


def ler_ncms(apenas_incompletos: bool = True) -> list[tuple[int, int]]:
    """Retorna lista de (linha_excel, ncm_int).

    apenas_incompletos=True  → somente linhas onde col B ou col D (PIS) está vazia.
    apenas_incompletos=False → todas as linhas com valor na col A.
    """
    wb, tmp = _abrir_workbook(read_only=True)
    try:
        ws = wb.active
        entradas = []
        for r in ws.iter_rows(min_row=2):
            if not r[0].value:
                continue
            if apenas_incompletos:
                incompleta = (len(r) < 2 or not r[1].value) or (len(r) < 4 or not r[3].value)
                if not incompleta:
                    continue
            ncm_int = int(str(r[0].value).replace(".", ""))
            entradas.append((r[0].row, ncm_int))
    finally:
        wb.close()
        if tmp and tmp.exists():
            try:
                tmp.unlink()
            except Exception:
                pass
    return entradas


def ler_dados_existentes() -> dict[int, dict]:
    """Lê os dados atuais do Excel para cada linha com NCM preenchido.

    Retorna {linha: {campo: valor}} para comparação posterior.
    """
    campos = ["descricao", "pis_cum", "cofins_cum", "pis_ncum", "cofins_ncum", "regime", "legislacao"]
    wb, tmp = _abrir_workbook(read_only=True)
    try:
        ws = wb.active
        dados = {}
        for r in ws.iter_rows(min_row=2, values_only=False):
            if not r[0].value:
                continue
            # colunas C(2) a I(8) → índices 2-8
            vals = [r[i].value if i < len(r) else None for i in range(2, 9)]
            dados[r[0].row] = dict(zip(campos, vals))
    finally:
        wb.close()
        if tmp and tmp.exists():
            try:
                tmp.unlink()
            except Exception:
                pass
    return dados


async def fazer_login(page):
    print("🔐 Abrindo tela de login...")
    await page.goto(ECONET_URL, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(3000)  # página estabilizar

    await page.wait_for_selector("text=Entrar", timeout=15000)
    await page.wait_for_timeout(1500)  # pausa antes de clicar
    await page.click("text=Entrar")
    await page.wait_for_selector("input[placeholder='Código / CPF']", state="visible", timeout=15000)
    await page.wait_for_timeout(1000)  # modal abriu, aguarda

    # digita usuário caractere a caractere como humano
    await page.type("input[placeholder='Código / CPF']", LOGIN, delay=120)
    await page.wait_for_timeout(700)
    await page.type("input[type='password']", SENHA, delay=100)
    await page.wait_for_timeout(1500)  # pausa antes do reCAPTCHA

    # ── Tenta resolver reCAPTCHA automaticamente ──
    print("🤖 Tentando resolver reCAPTCHA automaticamente...")
    resolved = await tentar_recaptcha(page)

    if not resolved:
        print("⚠️  reCAPTCHA precisa de interação humana.")
        print("   → Por favor, marque 'Não sou um robô' e clique em Entrar no browser.")
        await page.wait_for_selector("input[placeholder='Código / CPF']", state="hidden", timeout=120000)
        print("✅ Login detectado após reCAPTCHA manual.")
        return

    # Clica em Entrar (apenas se reCAPTCHA foi resolvido automaticamente)
    await page.wait_for_selector("#login_submit:not([disabled])", timeout=15000)
    await page.wait_for_timeout(1000)  # pausa natural antes de submeter
    await page.click("#login_submit")
    await page.wait_for_selector("input[placeholder='Código / CPF']", state="hidden", timeout=15000)
    print("✅ Login realizado com sucesso!")


async def tentar_recaptcha(page) -> bool:
    """
    Tenta clicar no checkbox do reCAPTCHA.
    Em browser real (não headless) geralmente passa automaticamente.
    """
    try:
        await page.wait_for_selector("iframe[src*='recaptcha']", timeout=8000)
        await page.wait_for_timeout(2000)  # iframe do reCAPTCHA carregar completamente

        recaptcha_frame = page.frame_locator("iframe[src*='recaptcha']").first
        await page.wait_for_timeout(1000)  # pausa antes de mover para o checkbox

        await recaptcha_frame.locator("#recaptcha-anchor").click(timeout=8000)
        await page.wait_for_timeout(4000)  # aguarda avaliação do Google

        checked = await recaptcha_frame.locator("#recaptcha-anchor").get_attribute("aria-checked")
        if checked == "true":
            print("✅ reCAPTCHA resolvido automaticamente!")
            return True

        # Se surgiu desafio de imagens, aguarda resolução
        await page.wait_for_timeout(6000)
        checked = await recaptcha_frame.locator("#recaptcha-anchor").get_attribute("aria-checked")
        return checked == "true"

    except Exception as e:
        print(f"   reCAPTCHA auto: {e}")
        return False


async def navegar_pis_cofins(page) -> str:
    """Navega até PIS/COFINS → Busca do Produto e retorna o src do iframe interno."""
    print("📂 Navegando para Federal → PIS/COFINS...")
    await page.wait_for_timeout(2000)  # pausa antes de interagir com o menu
    await page.hover("text=Federal")
    await page.wait_for_timeout(1500)  # menu dropdown expandir

    pis_link = page.locator("text=PIS / COFINS").first
    await pis_link.scroll_into_view_if_needed()
    await page.wait_for_timeout(800)
    await pis_link.click()
    await page.wait_for_timeout(3000)  # conteúdo do iframe carregar

    # Clica em "Busca do Produto" dentro do iframe #alvo
    busca_tab = page.frame_locator("#alvo").locator("text=Busca do Produto").first
    await busca_tab.click()
    await page.wait_for_timeout(2500)  # formulário de busca carregar

    # Captura o src do iframe aninhado (será usado para recarregar entre buscas)
    busca_src = await page.evaluate("""() => {
        const f1 = document.getElementById('alvo');
        const f2 = f1.contentDocument.querySelector('iframe');
        return f2 ? f2.src : '';
    }""")
    print(f"✅ Seção PIS/COFINS aberta. iframe src: {busca_src[:80]}...")
    return busca_src


async def _js_iframe(page: object, script: str):
    """Executa JS no iframe aninhado (alvo > iframe) e retorna o resultado."""
    return await page.evaluate(f"""() => {{
        try {{
            const f1 = document.getElementById('alvo');
            const f2 = f1.contentDocument.querySelector('iframe');
            {script}
        }} catch(e) {{ return 'ERR: ' + e.message; }}
    }}""")


async def buscar_ncm(page, ncm_formatado: str, busca_src: str) -> dict:
    """Busca um NCM via JS direto no iframe e retorna os dados extraídos."""
    print(f"  Buscando NCM {ncm_formatado}...")

    # Recarrega o iframe de busca diretamente pela URL capturada
    await page.evaluate(f"""() => {{
        const f1 = document.getElementById('alvo');
        const f2 = f1.contentDocument.querySelector('iframe');
        if (f2) f2.src = '{busca_src}';
    }}""")
    await page.wait_for_timeout(3000)  # formulário recarregar

    # 1. Preenche campo NCM caractere a caractere e submete
    await _js_iframe(page, f"""
        const inp = f2.contentDocument.getElementById('inpCodigoNcm');
        inp.focus();
        inp.value = '{ncm_formatado}';
        return 'ok';
    """)
    await page.wait_for_timeout(1200)  # pausa após digitar
    await _js_iframe(page, """
        f2.contentDocument.querySelector('input[value="Pesquisar"]').click();
        return 'ok';
    """)
    await page.wait_for_timeout(3500)  # resultados da pesquisa carregar

    # 2. Clica no radio do NCM mais específico sem "Ex "
    prefix = ncm_formatado[:7]
    await _js_iframe(page, f"""
        const rows = Array.from(f2.contentDocument.querySelectorAll('tr'));
        let clicked = false;
        for (const r of rows) {{
            const txt = r.innerText;
            if (txt.includes('{prefix}') && !txt.includes('Ex ')) {{
                const radio = r.querySelector('input[type="radio"]');
                if (radio) {{ radio.click(); clicked = true; break; }}
            }}
        }}
        if (!clicked) {{
            const first = f2.contentDocument.querySelector('input[type="radio"]');
            if (first) first.click();
        }}
        return 'ok';
    """)
    await page.wait_for_timeout(4000)  # página de detalhes do NCM carregar

    # 3. Extrai dados via JS — apenas linhas VISÍVEIS (ignora abas escondidas como ZFM/Exportação)
    raw = await _js_iframe(page, """
        const win = f2.contentDocument.defaultView || f2.contentWindow;
        function visivel(el) {
            try {
                let cur = el;
                while (cur && cur !== f2.contentDocument.body) {
                    const st = win.getComputedStyle(cur);
                    if (st.display === 'none' || st.visibility === 'hidden') return false;
                    cur = cur.parentElement;
                }
                return true;
            } catch(e) { return true; }
        }
        const rows = Array.from(f2.contentDocument.querySelectorAll('table tr'))
            .filter(r => visivel(r));
        return rows.map(r =>
            Array.from(r.querySelectorAll('td,th'))
                .map(c => c.innerText.trim().replace(/\\n+/g,' '))
                .join('||')
        ).join('\\n');
    """)

    data = {
        "descricao": "", "pis_cum": "", "cofins_cum": "",
        "pis_ncum": "", "cofins_ncum": "", "regime": "", "legislacao": []
    }

    if not raw or raw.startswith("ERR"):
        print(f"     AVISO extração: {raw}")
    else:
        ncm_desc_rows = []
        in_aliquota = False
        for line in raw.splitlines():
            cells = [c.strip() for c in line.split("||")]
            if not any(cells): continue

            joined = " ".join(cells)
            if "Regime de Tributação" in joined or (cells[0] == "Regime de Tributação"):
                in_aliquota = True
                continue
            if "Alíquota" in joined and len(cells) == 1:
                in_aliquota = True
                continue

            if not in_aliquota:
                if len(cells) >= 2 and cells[0] not in ("", "NCM", "DESCRIÇÃO", "Produto"):
                    ncm_desc_rows.append(cells)
            else:
                if len(cells) < 3:
                    continue
                regime = cells[0]
                pis    = cells[1]
                cofins = cells[2]
                leg    = cells[3] if len(cells) > 3 else ""

                # Só processa linhas com alíquotas reais (contém % ou "Vide")
                if not ("%" in pis or "Vide" in pis or "%" in cofins):
                    continue

                if "Cumulativo" in regime and "Não" not in regime:
                    data["pis_cum"]    = pis
                    data["cofins_cum"] = cofins
                    if leg: data["legislacao"].append(f"Cum: {leg}")
                    if not data["regime"]: data["regime"] = "Cumulativo / Não Cumulativo"
                elif "Não Cumulativo" in regime:
                    data["pis_ncum"]    = pis
                    data["cofins_ncum"] = cofins
                    if leg: data["legislacao"].append(f"N.Cum: {leg}")
                elif "Simples" in regime:
                    pass  # ignora linha Simples
                elif regime and "%" in pis:
                    # Monofásico: mesmo valor em todos os regimes
                    data["pis_cum"] = data["pis_ncum"] = pis
                    data["cofins_cum"] = data["cofins_ncum"] = cofins
                    if leg: data["legislacao"].append(leg)
                    if not data["regime"]: data["regime"] = regime

        if ncm_desc_rows:
            last = ncm_desc_rows[-1]
            data["descricao"] = " — ".join(c for c in last if c and c not in ("NCM", "DESCRIÇÃO"))

    # Detecta regime especial via texto completo
    body = await _js_iframe(page, "return f2.contentDocument.body.innerText.substring(0,2000);")
    if isinstance(body, str):
        if "Bebidas Frias" in body:
            data["regime"] = "Bebidas Frias (Monofásico)"
            # Bebidas Frias: tabela tem 6 colunas — PIS na col 5, COFINS na col 6
            if not data["pis_cum"]:
                bf_raw = await _js_iframe(page, """
                    const win = f2.contentDocument.defaultView || f2.contentWindow;
                    function visivel(el) {
                        try {
                            let cur = el;
                            while (cur && cur !== f2.contentDocument.body) {
                                const st = win.getComputedStyle(cur);
                                if (st.display === 'none' || st.visibility === 'hidden') return false;
                                cur = cur.parentElement;
                            }
                            return true;
                        } catch(e) { return true; }
                    }
                    const rows = Array.from(f2.contentDocument.querySelectorAll('table tr'))
                        .filter(r => visivel(r));
                    for (const r of rows) {
                        const cells = Array.from(r.querySelectorAll('td,th'))
                            .map(c => c.innerText.trim().replace(/\\n+/g,' '));
                        if (cells.length >= 6 && cells[4].includes('%')) {
                            return cells[4] + '||' + cells[5];
                        }
                    }
                    return '';
                """)
                if bf_raw and "||" in bf_raw:
                    parts = bf_raw.split("||")
                    data["pis_cum"] = data["pis_ncum"] = parts[0].strip()
                    data["cofins_cum"] = data["cofins_ncum"] = parts[1].strip()
        elif "Incidência Monofásica" in body or "Monofásico" in body:
            data["regime"] = "Monofásico"

    data["legislacao"] = " | ".join(data["legislacao"])

    # (navegação de volta ao form é feita no início do próximo buscar_ncm via f2.src)

    print(f"     OK PIS={data['pis_cum']} | COFINS={data['cofins_cum']} | Regime={data['regime']}")
    return data


def _registrar_historico(ws_hist, ncm_fmt: str, dados_ant: dict, dados_nov: dict):
    """Compara campos e grava no sheet Histórico as diferenças encontradas."""
    from datetime import datetime
    agora = datetime.now().strftime("%Y-%m-%d %H:%M")
    nomes = {
        "descricao":   "Descrição",
        "pis_cum":     "PIS Cumulativo",
        "cofins_cum":  "COFINS Cumulativo",
        "pis_ncum":    "PIS Não Cumulativo",
        "cofins_ncum": "COFINS Não Cumulativo",
        "regime":      "Regime",
        "legislacao":  "Legislação",
    }
    mudancas = 0
    for campo, nome in nomes.items():
        ant = str(dados_ant.get(campo) or "").strip()
        nov = str(dados_nov.get(campo) or "").strip()
        if ant != nov:
            ws_hist.append([agora, ncm_fmt, nome, ant, nov])
            mudancas += 1
    return mudancas


def salvar_excel(entradas: list[tuple[int, int]], resultados: list[dict],
                 dados_anteriores: dict[int, dict] | None = None):
    destino = XLSX_PATH
    try:
        wb = openpyxl.load_workbook(XLSX_PATH)
        ws = wb.active
    except PermissionError:
        # Arquivo bloqueado pelo Excel — cria workbook novo
        destino = XLSX_PATH.parent / "bcoDados_resultado.xlsx"
        print(f"⚠️  Excel aberto — salvando em {destino.name}")
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Plan1"

    headers = [
        "NCM", "NCM Econet", "Descrição",
        "PIS Cumulativo", "COFINS Cumulativo",
        "PIS Não Cumulativo", "COFINS Não Cumulativo",
        "Regime", "Legislação"
    ]
    hfill = PatternFill("solid", fgColor="1F4E79")
    hfont = Font(bold=True, color="FFFFFF")

    for ci, h in enumerate(headers, 1):
        c = ws.cell(row=1, column=ci, value=h)
        c.fill = hfill
        c.font = hfont
        c.alignment = Alignment(horizontal="center", wrap_text=True)

    # Sheet de histórico (cria se não existir)
    if "Histórico" not in wb.sheetnames:
        ws_hist = wb.create_sheet("Histórico")
        hist_headers = ["Data/Hora", "NCM", "Campo", "Valor Anterior", "Valor Novo"]
        ws_hist.append(hist_headers)
        hfill_hist = PatternFill("solid", fgColor="1F4E79")
        hfont_hist = Font(bold=True, color="FFFFFF")
        for ci, h in enumerate(hist_headers, 1):
            c = ws_hist.cell(row=1, column=ci, value=h)
            c.fill = hfill_hist
            c.font = hfont_hist
            c.alignment = Alignment(horizontal="center")
        for w, col in zip([18, 13, 22, 40, 40], ["A","B","C","D","E"]):
            ws_hist.column_dimensions[col].width = w
    else:
        ws_hist = wb["Histórico"]

    total_mudancas = 0
    for (ri, ncm), r in zip(entradas, resultados):
        # Registra histórico se modo --todos e dados anteriores disponíveis
        if dados_anteriores and ri in dados_anteriores:
            total_mudancas += _registrar_historico(
                ws_hist, formatar_ncm(ncm), dados_anteriores[ri], r
            )

        ws.cell(ri, 1, ncm)
        ws.cell(ri, 2, formatar_ncm(ncm))
        ws.cell(ri, 3, r["descricao"])
        ws.cell(ri, 4, r["pis_cum"])
        ws.cell(ri, 5, r["cofins_cum"])
        ws.cell(ri, 6, r["pis_ncum"])
        ws.cell(ri, 7, r["cofins_ncum"])
        ws.cell(ri, 8, r["regime"])
        ws.cell(ri, 9, r["legislacao"])
        for ci in range(1, 10):
            ws.cell(ri, ci).alignment = Alignment(wrap_text=True, vertical="top")

    widths = [12, 13, 55, 18, 20, 20, 22, 28, 65]
    for ci, w in enumerate(widths, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(ci)].width = w
    ws.row_dimensions[1].height = 30

    wb.save(destino)
    print(f"\n💾 Salvo: {destino}")
    if dados_anteriores is not None:
        if total_mudancas:
            print(f"📝 {total_mudancas} mudança(s) registrada(s) no sheet Histórico.")
        else:
            print("✅ Nenhuma mudança detectada em relação aos dados anteriores.")


async def main():
    modo_todos = "--todos" in sys.argv
    entradas = ler_ncms(apenas_incompletos=not modo_todos)
    ncms = [ncm for _, ncm in entradas]

    if modo_todos:
        print(f"🔄 Modo --todos: {len(entradas)} NCMs serão verificados (incluindo já preenchidos)")
        dados_anteriores = ler_dados_existentes()
    else:
        print(f"📋 {len(entradas)} NCMs sem dados encontrados: {[formatar_ncm(n) for n in ncms]}")
        dados_anteriores = None

    sessao_existe = SESSION.exists()

    async with async_playwright() as pw:
        # Usa Chromium visível na 1ª execução, headless depois
        browser = await pw.chromium.launch(
            headless=sessao_existe,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-gpu"]
        )

        ctx_args = {"storage_state": str(SESSION)} if sessao_existe else {}
        context = await browser.new_context(
            **ctx_args,
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1400, "height": 900}
        )
        page = await context.new_page()

        # Login se não há sessão
        if not sessao_existe:
            await fazer_login(page)
            await context.storage_state(path=str(SESSION))
            print(f"💾 Sessão salva em {SESSION} — próximas execuções sem login!")
        else:
            print("✅ Sessão carregada — sem necessidade de login/reCAPTCHA!")
            await page.goto(ECONET_URL, wait_until="domcontentloaded", timeout=60000)
            # Verifica se sessão ainda é válida
            try:
                await page.wait_for_selector("text=Minha Biblioteca", timeout=5000)
            except PlaywrightTimeout:
                print("⚠️  Sessão expirada. Fazendo novo login...")
                SESSION.unlink(missing_ok=True)
                await fazer_login(page)
                await context.storage_state(path=str(SESSION))

        busca_src = await navegar_pis_cofins(page)

        resultados = []
        for _, ncm in entradas:
            ncm_fmt = formatar_ncm(ncm)
            try:
                dados = await buscar_ncm(page, ncm_fmt, busca_src)
            except Exception as e:
                print(f"  ERRO no NCM {ncm_fmt}: {e}")
                dados = {k: "" for k in ["descricao","pis_cum","cofins_cum","pis_ncum","cofins_ncum","regime","legislacao"]}
            resultados.append(dados)

        await browser.close()

    salvar_excel(entradas, resultados, dados_anteriores)
    print("\n🎉 Concluído! Todos os NCMs processados.")


if __name__ == "__main__":
    asyncio.run(main())
