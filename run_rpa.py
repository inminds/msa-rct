#!/usr/bin/env python3
"""
Script de execução simplificada do RPA Legal Intelligence
Execução standalone para testes e desenvolvimento
"""

import os
import sys
import json
from datetime import datetime

# Adiciona o diretório atual ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from rpa_legal_intelligence.main import main

if __name__ == "__main__":
    print("=" * 60)
    print("RPA Legal Intelligence - Sistema de Monitoramento Legal")
    print("Machado Schutz Advogados & InMinds Technology")
    print("=" * 60)
    print(f"Iniciado em: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print()
    
    exit_code = main()
    
    print()
    print(f"Finalizado em: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print("=" * 60)
    
    sys.exit(exit_code)