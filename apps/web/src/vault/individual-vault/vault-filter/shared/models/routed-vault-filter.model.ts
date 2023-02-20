export const Unassigned = "unassigned";

export const All = "all";

export type RoutedVaultFilterItemType =
  | "favorites"
  | "login"
  | "card"
  | "identity"
  | "note"
  | "trash"
  | typeof All; // TODO: Remove `All` when moving to vertical navigation.

export interface RoutedVaultFilterModel {
  collectionId?: string;
  folderId?: string;
  organizationId?: string;
  type?: RoutedVaultFilterItemType;

  organizationIdParamType?: "path" | "query";
}
