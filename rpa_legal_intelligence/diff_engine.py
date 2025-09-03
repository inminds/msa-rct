"""
Sistema inteligente de detecção de diferenças em conteúdo legal
Implementa comparação semântica e identificação de mudanças críticas
"""

import hashlib
import re
import logging
from typing import Dict, List, Tuple, Optional
from datetime import datetime
from difflib import unified_diff, SequenceMatcher
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class ContentChange:
    """Representa uma mudança detectada no conteúdo"""
    change_type: str  # ADDED, MODIFIED, DELETED
    section: str
    old_text: str
    new_text: str
    similarity: float
    importance: str  # LOW, MEDIUM, HIGH, CRITICAL
    keywords: List[str]
    line_numbers: Tuple[int, int]

class DiffEngine:
    """Motor de detecção de diferenças inteligente"""
    
    # Palavras-chave críticas para legislação tributária
    CRITICAL_KEYWORDS = [
        'alíquota', 'tributo', 'imposto', 'taxa', 'contribuição',
        'icms', 'ipi', 'pis', 'cofins', 'iss', 'irpj', 'csll',
        'ncm', 'cfop', 'st', 'substituição tributária',
        'prazo', 'vencimento', 'obrigação', 'penalidade',
        'multa', 'juros', 'correção monetária'
    ]
    
    HIGH_KEYWORDS = [
        'regulamento', 'instrução normativa', 'portaria', 'decreto',
        'lei', 'medida provisória', 'emenda', 'alteração',
        'revogação', 'suspensão', 'prorrogação'
    ]
    
    MEDIUM_KEYWORDS = [
        'esclarecimento', 'orientação', 'procedimento',
        'formulário', 'prazo', 'documentação'
    ]
    
    def __init__(self):
        self.similarity_threshold = 0.7  # 70% similaridade mínima
    
    def generate_content_hash(self, content: str) -> str:
        """Gera hash MD5 do conteúdo normalizado"""
        # Normaliza conteúdo (remove espaços extras, quebras de linha, etc.)
        normalized = re.sub(r'\s+', ' ', content.strip().lower())
        return hashlib.md5(normalized.encode('utf-8')).hexdigest()
    
    def detect_changes(self, old_content: str, new_content: str) -> Dict:
        """
        Detecta e classifica mudanças entre dois conteúdos
        Retorna análise completa das diferenças
        """
        try:
            # Hashes para comparação rápida
            old_hash = self.generate_content_hash(old_content)
            new_hash = self.generate_content_hash(new_content)
            
            if old_hash == new_hash:
                return {
                    "has_changes": False,
                    "similarity": 1.0,
                    "summary": "Nenhuma mudança detectada"
                }
            
            # Análise detalhada de diferenças
            changes = self._analyze_differences(old_content, new_content)
            
            # Classificação de importância
            importance = self._classify_importance(changes)
            
            # Geração de resumo
            summary = self._generate_summary(changes, importance)
            
            result = {
                "has_changes": True,
                "old_hash": old_hash,
                "new_hash": new_hash,
                "similarity": self._calculate_similarity(old_content, new_content),
                "importance": importance,
                "summary": summary,
                "changes": changes,
                "change_count": len(changes),
                "detected_at": datetime.now().isoformat()
            }
            
            logger.info(f"Mudanças detectadas: {len(changes)} alterações, importância: {importance}")
            return result
            
        except Exception as e:
            logger.error(f"Erro detectando mudanças: {e}")
            return {
                "has_changes": False,
                "error": str(e)
            }
    
    def _analyze_differences(self, old_content: str, new_content: str) -> List[ContentChange]:
        """Analisa diferenças linha por linha"""
        changes = []
        
        old_lines = old_content.splitlines()
        new_lines = new_content.splitlines()
        
        # Usa difflib para encontrar diferenças
        diff = unified_diff(
            old_lines, new_lines,
            lineterm='',
            n=3  # 3 linhas de contexto
        )
        
        current_change = None
        old_start = new_start = 0
        
        for line in diff:
            if line.startswith('@@'):
                # Extrai números de linha do cabeçalho
                match = re.search(r'@@ -(\d+),?\d* \+(\d+),?\d* @@', line)
                if match:
                    old_start = int(match.group(1))
                    new_start = int(match.group(2))
                continue
                
            elif line.startswith('-'):
                # Linha removida
                removed_text = line[1:]
                if current_change and current_change.change_type == "MODIFIED":
                    current_change.old_text += "\n" + removed_text
                else:
                    current_change = ContentChange(
                        change_type="DELETED",
                        section=self._identify_section(removed_text),
                        old_text=removed_text,
                        new_text="",
                        similarity=0.0,
                        importance=self._assess_line_importance(removed_text),
                        keywords=self._extract_keywords(removed_text),
                        line_numbers=(old_start, new_start)
                    )
                    
            elif line.startswith('+'):
                # Linha adicionada
                added_text = line[1:]
                if current_change and current_change.change_type == "DELETED":
                    # Transformar em modificação
                    current_change.change_type = "MODIFIED"
                    current_change.new_text = added_text
                    current_change.similarity = self._calculate_similarity(
                        current_change.old_text, added_text
                    )
                else:
                    current_change = ContentChange(
                        change_type="ADDED",
                        section=self._identify_section(added_text),
                        old_text="",
                        new_text=added_text,
                        similarity=0.0,
                        importance=self._assess_line_importance(added_text),
                        keywords=self._extract_keywords(added_text),
                        line_numbers=(old_start, new_start)
                    )
                    
            elif line.startswith(' '):
                # Linha inalterada - finaliza mudança atual se existir
                if current_change:
                    changes.append(current_change)
                    current_change = None
        
        # Adiciona última mudança se existir
        if current_change:
            changes.append(current_change)
        
        return changes
    
    def _identify_section(self, text: str) -> str:
        """Identifica seção do documento baseada no conteúdo"""
        text_lower = text.lower()
        
        if any(word in text_lower for word in ['art', 'artigo', 'inciso']):
            return "Artigo"
        elif any(word in text_lower for word in ['parágrafo', '§']):
            return "Parágrafo"
        elif any(word in text_lower for word in ['anexo', 'tabela']):
            return "Anexo"
        elif any(word in text_lower for word in ['alíquota', 'taxa', '%']):
            return "Alíquota"
        elif any(word in text_lower for word in ['prazo', 'data', 'vencimento']):
            return "Prazo"
        else:
            return "Geral"
    
    def _assess_line_importance(self, text: str) -> str:
        """Avalia importância de uma linha baseada em palavras-chave"""
        text_lower = text.lower()
        
        if any(keyword in text_lower for keyword in self.CRITICAL_KEYWORDS):
            return "CRITICAL"
        elif any(keyword in text_lower for keyword in self.HIGH_KEYWORDS):
            return "HIGH"
        elif any(keyword in text_lower for keyword in self.MEDIUM_KEYWORDS):
            return "MEDIUM"
        else:
            return "LOW"
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extrai palavras-chave relevantes do texto"""
        text_lower = text.lower()
        found_keywords = []
        
        all_keywords = self.CRITICAL_KEYWORDS + self.HIGH_KEYWORDS + self.MEDIUM_KEYWORDS
        
        for keyword in all_keywords:
            if keyword in text_lower:
                found_keywords.append(keyword)
        
        return found_keywords
    
    def _classify_importance(self, changes: List[ContentChange]) -> str:
        """Classifica importância geral das mudanças"""
        if not changes:
            return "LOW"
        
        importance_scores = {
            "CRITICAL": 4,
            "HIGH": 3,
            "MEDIUM": 2,
            "LOW": 1
        }
        
        max_importance = max(
            importance_scores.get(change.importance, 1) 
            for change in changes
        )
        
        # Também considera quantidade de mudanças críticas
        critical_count = sum(
            1 for change in changes 
            if change.importance == "CRITICAL"
        )
        
        high_count = sum(
            1 for change in changes 
            if change.importance == "HIGH"
        )
        
        if critical_count > 0 or max_importance >= 4:
            return "CRITICAL"
        elif high_count > 2 or max_importance >= 3:
            return "HIGH"
        elif len(changes) > 5 or max_importance >= 2:
            return "MEDIUM"
        else:
            return "LOW"
    
    def _generate_summary(self, changes: List[ContentChange], importance: str) -> str:
        """Gera resumo executivo das mudanças"""
        if not changes:
            return "Nenhuma mudança detectada"
        
        summary_parts = []
        
        # Contabiliza tipos de mudança
        added = len([c for c in changes if c.change_type == "ADDED"])
        modified = len([c for c in changes if c.change_type == "MODIFIED"])
        deleted = len([c for c in changes if c.change_type == "DELETED"])
        
        if added:
            summary_parts.append(f"{added} adição(ões)")
        if modified:
            summary_parts.append(f"{modified} modificação(ões)")
        if deleted:
            summary_parts.append(f"{deleted} remoção(ões)")
        
        base_summary = f"Detectadas {', '.join(summary_parts)}"
        
        # Adiciona contexto baseado na importância
        if importance == "CRITICAL":
            base_summary += ". ATENÇÃO: Mudanças críticas em tributos ou alíquotas!"
        elif importance == "HIGH":
            base_summary += ". Mudanças importantes em regulamentação."
        elif importance == "MEDIUM":
            base_summary += ". Alterações em procedimentos ou orientações."
        
        # Seções mais afetadas
        sections = {}
        for change in changes:
            sections[change.section] = sections.get(change.section, 0) + 1
        
        if sections:
            most_affected = max(sections.items(), key=lambda x: x[1])
            base_summary += f" Seção mais afetada: {most_affected[0]}."
        
        return base_summary
    
    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Calcula similaridade entre dois textos"""
        if not text1 and not text2:
            return 1.0
        if not text1 or not text2:
            return 0.0
            
        matcher = SequenceMatcher(None, text1, text2)
        return round(matcher.ratio(), 3)