"""
CLI principal do módulo rpa_ncm_scanner.

Uso:
    python -m rpa_ncm_scanner login --username X --password Y
    python -m rpa_ncm_scanner scan
    python -m rpa_ncm_scanner scan --ncm 85171200
"""

import argparse
import logging
import sys
import time
from dataclasses import dataclass, field
from typing import Optional

from .api_client import get_pending_ncms, save_tribute_data
from .config import HEADLESS, REQUEST_DELAY
from .interpreter import extract_tribute_data
from .scraper import EconetScraper, NCM_STATUS_FOUND, NCM_STATUS_NOT_FOUND, NCM_STATUS_PARTIAL

# ---------------------------------------------------------------------------
# Logging estruturado com timestamps
# ---------------------------------------------------------------------------


def _setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
    )


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Estrutura de resultado de varredura
# ---------------------------------------------------------------------------


@dataclass
class ScanSummary:
    found: int = 0
    partial: int = 0
    not_found: int = 0
    error: int = 0
    ncms_with_error: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.found + self.partial + self.not_found + self.error

    def print_report(self) -> None:
        logger.info("=" * 50)
        logger.info("RESUMO DA VARREDURA")
        logger.info("=" * 50)
        logger.info(f"Total processado : {self.total}")
        logger.info(f"  FOUND          : {self.found}")
        logger.info(f"  PARTIAL        : {self.partial}")
        logger.info(f"  NOT_FOUND      : {self.not_found}")
        logger.info(f"  ERROR          : {self.error}")
        if self.ncms_with_error:
            logger.info(f"NCMs com erro    : {', '.join(self.ncms_with_error)}")
        logger.info("=" * 50)


# ---------------------------------------------------------------------------
# Comandos
# ---------------------------------------------------------------------------


def cmd_login(args: argparse.Namespace) -> None:
    """Faz login no Econet e salva a sessão em cookies."""
    logger.info("Iniciando comando: login")
    scraper = EconetScraper(headless=False)  # login sempre com UI visível
    try:
        scraper.login(username=args.username, password=args.password)
        logger.info("Login concluído. Sessão salva para reutilização futura.")
    finally:
        scraper.close()


def cmd_scan(args: argparse.Namespace) -> None:
    """
    Escaneia NCMs no Econet.

    Se --ncm for informado, escaneia apenas aquele NCM.
    Caso contrário, busca a lista de NCMs pendentes na API Node.js.
    """
    logger.info("Iniciando comando: scan")

    # Determina lista de NCMs a escanear
    if args.ncm:
        ncm_list = [{"code": args.ncm, "description": ""}]
        logger.info(f"Modo NCM único: {args.ncm}")
    else:
        ncm_list = get_pending_ncms()
        if not ncm_list:
            logger.info("Nenhum NCM pendente encontrado na API. Encerrando.")
            return
        logger.info(f"{len(ncm_list)} NCMs pendentes para varredura")

    if not args.username or not args.password:
        logger.error(
            "Credenciais necessárias para scan. Use --username e --password, "
            "ou execute 'login' primeiro para salvar a sessão."
        )
        sys.exit(1)

    summary = ScanSummary()
    scraper = EconetScraper(headless=HEADLESS)

    try:
        # Login (reutiliza sessão se válida)
        scraper.login(username=args.username, password=args.password)

        for i, ncm_item in enumerate(ncm_list, start=1):
            ncm_code = ncm_item.get("code", "")
            if not ncm_code:
                logger.warning(f"Item {i}: código NCM vazio, pulando")
                continue

            logger.info(f"[{i}/{len(ncm_list)}] Processando NCM: {ncm_code}")

            try:
                # 1. Buscar no Econet
                result = scraper.search_ncm(ncm_code)
                status = result["status"]
                html_content = result.get("html_content")
                matched_ncm = result.get("matched_ncm")

                # 2. Interpretar com Claude (somente se obteve HTML)
                tribute_data = {}
                if html_content:
                    tribute_data = extract_tribute_data(html_content, ncm_code)

                regras = tribute_data.get("regras", [])
                descricao = tribute_data.get("descricao", "")

                # 3. Salvar na API Node.js
                save_tribute_data(
                    ncm_code=ncm_code,
                    status=status,
                    regras=regras,
                    matched_ncm=matched_ncm,
                    descricao=descricao,
                )

                # Contabiliza resultado
                if status == NCM_STATUS_FOUND:
                    summary.found += 1
                elif status == NCM_STATUS_PARTIAL:
                    summary.partial += 1
                else:
                    summary.not_found += 1

                logger.info(
                    f"NCM {ncm_code}: status={status}, regras={len(regras)}"
                )

            except Exception as e:
                logger.error(
                    f"Erro ao processar NCM {ncm_code}: {e}", exc_info=True
                )
                summary.error += 1
                summary.ncms_with_error.append(ncm_code)

                # Tenta salvar o status de erro na API
                try:
                    save_tribute_data(
                        ncm_code=ncm_code,
                        status="ERROR",
                        regras=[],
                    )
                except Exception:
                    pass

            # Aguarda entre requests para não sobrecarregar o portal
            if i < len(ncm_list):
                logger.debug(f"Aguardando {REQUEST_DELAY}s antes do próximo NCM...")
                time.sleep(REQUEST_DELAY)

    finally:
        scraper.close()
        summary.print_report()


# ---------------------------------------------------------------------------
# Parser CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="rpa_ncm_scanner",
        description="Scanner de tributação NCM via Econet — RTC/Machado Schütz",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Ativar logging em modo debug",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # --- Subcomando: login ---
    login_parser = subparsers.add_parser(
        "login",
        help="Faz login no Econet e salva sessão para reutilização",
    )
    login_parser.add_argument("--username", "-u", required=True, help="Usuário Econet")
    login_parser.add_argument("--password", "-p", required=True, help="Senha Econet")

    # --- Subcomando: scan ---
    scan_parser = subparsers.add_parser(
        "scan",
        help="Escaneia NCMs pendentes (ou um NCM específico)",
    )
    scan_parser.add_argument(
        "--ncm",
        help="Código NCM específico para escanear (ex: 85171200). "
             "Se omitido, busca pendentes na API.",
    )
    scan_parser.add_argument(
        "--username", "-u",
        default="",
        help="Usuário Econet (opcional se sessão já salva)",
    )
    scan_parser.add_argument(
        "--password", "-p",
        default="",
        help="Senha Econet (opcional se sessão já salva)",
    )

    return parser


def main(argv: Optional[list[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    _setup_logging(verbose=args.verbose)

    if args.command == "login":
        cmd_login(args)
    elif args.command == "scan":
        cmd_scan(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
