import * as xml2js from "xml2js";
import { parse as parseCSV } from "csv-parse/sync";
import type { InsertNCMItem } from "@shared/schema";

export interface ProcessedNCMItem {
  ncmCode: string;
  description?: string;
  productName?: string;
}

export class FileProcessor {
  static async processSPEDFile(fileContent: string): Promise<ProcessedNCMItem[]> {
    const lines = fileContent.split('\n').filter(line => line.trim());
    const ncmItems: ProcessedNCMItem[] = [];
    
    for (const line of lines) {
      // SPED Fiscal - Record 0200 contains product information
      if (line.startsWith('|0200|')) {
        const fields = line.split('|');
        if (fields.length >= 10) {
          const productCode = fields[2];
          const productName = fields[3];
          const ncmCode = fields[9];
          
          if (ncmCode && ncmCode.length === 8) {
            ncmItems.push({
              ncmCode: ncmCode,
              description: productName,
              productName: productName,
            });
          }
        }
      }
    }
    
    return ncmItems;
  }

  static async processXMLFile(fileContent: string): Promise<ProcessedNCMItem[]> {
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(fileContent);
    const ncmItems: ProcessedNCMItem[] = [];
    
    try {
      // Navigate through NFe XML structure
      const nfe = result.nfeProc?.NFe?.[0] || result.NFe?.[0];
      const infNFe = nfe?.infNFe?.[0];
      const det = infNFe?.det;
      
      if (det && Array.isArray(det)) {
        for (const item of det) {
          const prod = item.prod?.[0];
          if (prod) {
            const ncmCode = prod.NCM?.[0];
            const productName = prod.xProd?.[0];
            const description = prod.xProd?.[0];
            
            if (ncmCode && ncmCode.length === 8) {
              ncmItems.push({
                ncmCode: ncmCode,
                description: description,
                productName: productName,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error parsing XML:', error);
      throw new Error('Invalid XML format');
    }
    
    return ncmItems;
  }

  static async processCSVFile(fileContent: string): Promise<ProcessedNCMItem[]> {
    try {
      const records = parseCSV(fileContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ',',
      });
      
      const ncmItems: ProcessedNCMItem[] = [];
      
      for (const record of records) {
        // Try common column names for NCM
        const recordObj = record as Record<string, any>;
        const ncmCode = recordObj.NCM || recordObj.ncm || recordObj.codigo_ncm || recordObj.ncm_code;
        const productName = recordObj.produto || recordObj.product || recordObj.nome_produto || recordObj.description || recordObj.descricao;
        
        if (ncmCode && ncmCode.length === 8) {
          ncmItems.push({
            ncmCode: ncmCode.toString(),
            description: productName?.toString(),
            productName: productName?.toString(),
          });
        }
      }
      
      return ncmItems;
    } catch (error) {
      console.error('Error parsing CSV:', error);
      throw new Error('Invalid CSV format');
    }
  }

  static async processFile(fileContent: string, fileType: 'SPED' | 'XML' | 'CSV'): Promise<ProcessedNCMItem[]> {
    switch (fileType) {
      case 'SPED':
        return this.processSPEDFile(fileContent);
      case 'XML':
        return this.processXMLFile(fileContent);
      case 'CSV':
        return this.processCSVFile(fileContent);
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }
}
