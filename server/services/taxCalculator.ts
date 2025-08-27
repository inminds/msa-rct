import type { InsertTribute } from "@shared/schema";

export interface TaxRule {
  ncmCode: string;
  tributeType: 'ICMS' | 'IPI' | 'PIS' | 'COFINS';
  rate: number;
  jurisdiction: 'FEDERAL' | 'ESTADUAL';
  lawSource: string;
}

export class TaxCalculator {
  // Tax rules database - in a real implementation this would come from a database
  // For now, we'll use some common tax rules as examples
  private static taxRules: TaxRule[] = [
    // ICMS rules (Estadual)
    { ncmCode: '84482000', tributeType: 'ICMS', rate: 18, jurisdiction: 'ESTADUAL', lawSource: 'RICMS/SP' },
    { ncmCode: '22030000', tributeType: 'ICMS', rate: 25, jurisdiction: 'ESTADUAL', lawSource: 'RICMS/SP' },
    { ncmCode: '87032310', tributeType: 'ICMS', rate: 12, jurisdiction: 'ESTADUAL', lawSource: 'RICMS/SP' },
    
    // IPI rules (Federal)
    { ncmCode: '84482000', tributeType: 'IPI', rate: 5, jurisdiction: 'FEDERAL', lawSource: 'TIPI' },
    { ncmCode: '87032310', tributeType: 'IPI', rate: 7, jurisdiction: 'FEDERAL', lawSource: 'TIPI' },
    
    // PIS rules (Federal)
    { ncmCode: '22030000', tributeType: 'PIS', rate: 2.1, jurisdiction: 'FEDERAL', lawSource: 'Lei 10.637/2002' },
    { ncmCode: '87032310', tributeType: 'PIS', rate: 1.65, jurisdiction: 'FEDERAL', lawSource: 'Lei 10.637/2002' },
    
    // COFINS rules (Federal)
    { ncmCode: '22030000', tributeType: 'COFINS', rate: 9.65, jurisdiction: 'FEDERAL', lawSource: 'Lei 10.833/2003' },
    { ncmCode: '87032310', tributeType: 'COFINS', rate: 7.6, jurisdiction: 'FEDERAL', lawSource: 'Lei 10.833/2003' },
  ];

  static calculateTaxesForNCM(ncmCode: string): InsertTribute[] {
    const applicableRules = this.taxRules.filter(rule => 
      rule.ncmCode === ncmCode || this.isNCMInRange(ncmCode, rule.ncmCode)
    );

    return applicableRules.map(rule => ({
      type: rule.tributeType,
      rate: rule.rate,
      jurisdiction: rule.jurisdiction,
      lawSource: rule.lawSource,
      effectiveFrom: new Date(),
      effectiveTo: undefined,
      ncmItemId: '', // This will be set when creating the tribute
    }));
  }

  private static isNCMInRange(ncmCode: string, ruleCode: string): boolean {
    // Simple range matching - can be enhanced for more complex rules
    if (ruleCode.endsWith('00')) {
      const baseCode = ruleCode.substring(0, 6);
      return ncmCode.startsWith(baseCode);
    }
    return false;
  }

  static getDefaultTaxesForNCM(ncmCode: string): InsertTribute[] {
    // Default tax rates when no specific rules are found
    const defaultTaxes: InsertTribute[] = [];
    
    // Most products have ICMS (state tax)
    defaultTaxes.push({
      type: 'ICMS',
      rate: 18, // Standard ICMS rate
      jurisdiction: 'ESTADUAL',
      lawSource: 'RICMS - Alíquota Padrão',
      effectiveFrom: new Date(),
      effectiveTo: undefined,
      ncmItemId: '',
    });

    // Most products have PIS (federal tax)
    defaultTaxes.push({
      type: 'PIS',
      rate: 1.65, // Standard PIS rate
      jurisdiction: 'FEDERAL',
      lawSource: 'Lei 10.637/2002 - Regime Não-Cumulativo',
      effectiveFrom: new Date(),
      effectiveTo: undefined,
      ncmItemId: '',
    });

    // Most products have COFINS (federal tax)
    defaultTaxes.push({
      type: 'COFINS',
      rate: 7.6, // Standard COFINS rate
      jurisdiction: 'FEDERAL',
      lawSource: 'Lei 10.833/2003 - Regime Não-Cumulativo',
      effectiveFrom: new Date(),
      effectiveTo: undefined,
      ncmItemId: '',
    });

    return defaultTaxes;
  }

  static async calculateAllTaxes(ncmCode: string): Promise<InsertTribute[]> {
    let taxes = this.calculateTaxesForNCM(ncmCode);
    
    // If no specific rules found, use default taxes
    if (taxes.length === 0) {
      taxes = this.getDefaultTaxesForNCM(ncmCode);
    }
    
    return taxes;
  }
}
