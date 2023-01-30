import { ImportOption, ImportType } from "../../enums/importOptions";
import { Importer } from "../../importers/importer";
import { ImportResult } from "../../models/domain/import-result";

export abstract class ImportService {
  featuredImportOptions: readonly ImportOption[];
  regularImportOptions: readonly ImportOption[];
  getImportOptions: () => ImportOption[];
  import: (
    importer: Importer,
    fileContents: string,
    organizationId?: string
  ) => Promise<ImportResult>;
  getImporter: (
    format: ImportType | "bitwardenpasswordprotected",
    promptForPassword_callback: () => Promise<string>,
    organizationId: string
  ) => Importer;
}
