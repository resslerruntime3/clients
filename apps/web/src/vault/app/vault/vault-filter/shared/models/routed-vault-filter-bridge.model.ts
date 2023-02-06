import { TreeNode } from "@bitwarden/common/models/domain/tree-node";
import { CipherType } from "@bitwarden/common/vault/enums/cipher-type";

import { RoutedVaultFilterModel } from "../../../../core/vault-filter/routed-vault-filter.model";
import { RoutedVaultFilterBridgeService } from "../../services/routed-vault-filter-bridge.service";

import { VaultFilter, VaultFilterFunction } from "./vault-filter.model";
import {
  OrganizationFilter,
  CipherTypeFilter,
  FolderFilter,
  CollectionFilter,
  CipherStatus,
} from "./vault-filter.type";

export class RoutedVaultFilterBridge implements VaultFilter {
  constructor(
    private routedFilter: RoutedVaultFilterModel,
    private legacyFilter: VaultFilter,
    private bridgeService: RoutedVaultFilterBridgeService
  ) {}
  get collectionBreadcrumbs(): TreeNode<CollectionFilter>[] {
    return this.legacyFilter.collectionBreadcrumbs;
  }
  get isCollectionSelected(): boolean {
    return this.legacyFilter.isCollectionSelected;
  }
  get isUnassignedCollectionSelected(): boolean {
    return this.legacyFilter.isUnassignedCollectionSelected;
  }
  get isMyVaultSelected(): boolean {
    return this.legacyFilter.isMyVaultSelected;
  }
  get selectedOrganizationNode(): TreeNode<OrganizationFilter> {
    return this.legacyFilter.selectedOrganizationNode;
  }
  set selectedOrganizationNode(value: TreeNode<OrganizationFilter>) {
    this.bridgeService.navigate({ ...this.routedFilter, organizationId: value.node.id });
  }
  get selectedCipherTypeNode(): TreeNode<CipherTypeFilter> {
    return this.legacyFilter.selectedCipherTypeNode;
  }
  set selectedCipherTypeNode(value: TreeNode<CipherTypeFilter>) {
    this.bridgeService.navigate({ ...this.routedFilter, type: value.node.id });
  }
  get selectedFolderNode(): TreeNode<FolderFilter> {
    return this.legacyFilter.selectedFolderNode;
  }
  set selectedFolderNode(value: TreeNode<FolderFilter>) {
    this.bridgeService.navigate({
      ...this.routedFilter,
      folderId: value.node.id,
      collectionId: null,
    });
  }
  get selectedCollectionNode(): TreeNode<CollectionFilter> {
    return this.legacyFilter.selectedCollectionNode;
  }
  set selectedCollectionNode(value: TreeNode<CollectionFilter>) {
    this.bridgeService.navigate({
      ...this.routedFilter,
      folderId: null,
      collectionId: value.node.id,
    });
  }
  get isFavorites(): boolean {
    return this.legacyFilter.isFavorites;
  }
  get isDeleted(): boolean {
    return this.legacyFilter.isDeleted;
  }
  get organizationId(): string {
    return this.legacyFilter.organizationId;
  }
  get cipherType(): CipherType {
    return this.legacyFilter.cipherType;
  }
  get cipherStatus(): CipherStatus {
    return this.legacyFilter.cipherStatus;
  }
  get cipherTypeId(): string {
    return this.legacyFilter.cipherTypeId;
  }
  get folderId(): string {
    return this.legacyFilter.folderId;
  }
  get collectionId(): string {
    return this.legacyFilter.collectionId;
  }
  resetFilter(): void {
    return this.legacyFilter.resetFilter();
  }
  resetOrganization(): void {
    return this.legacyFilter.resetOrganization();
  }
  buildFilter(): VaultFilterFunction {
    return this.legacyFilter.buildFilter();
  }
}
