import { ImportResult } from "../models/domain/import-result";

export interface Importer {
  organizationId: string;
  promptForPassword_callback: () => Promise<string>;
  parse(data: string): Promise<ImportResult>;
}
