export const Unassigned = "unassigned";

export interface RoutedVaultFilterModel {
  collectionId?: string;
  folderId?: string;
  organizationId?: string;
  type?: string;

  organizationIdParamType?: "path" | "query";
}
