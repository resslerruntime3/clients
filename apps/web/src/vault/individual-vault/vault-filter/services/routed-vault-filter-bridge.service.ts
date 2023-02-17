import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { combineLatest, map, Observable } from "rxjs";

import { ITreeNodeObject, TreeNode } from "@bitwarden/common/models/domain/tree-node";

import { RoutedVaultFilterBridge } from "../shared/models/routed-vault-filter-bridge.model";
import { RoutedVaultFilterModel, Unassigned } from "../shared/models/routed-vault-filter.model";
import { VaultFilter } from "../shared/models/vault-filter.model";
import { CipherTypeFilter } from "../shared/models/vault-filter.type";

import { VaultFilterService } from "./abstractions/vault-filter.service";
import { RoutedVaultFilterService } from "./routed-vault-filter.service";

/**
 * This file is part of a layer that is used to temporary bridge between URL filtering and the old state-in-code method.
 * This should be removed after we have refactored the {@link VaultItemsComponent} and introduced vertical navigation
 * (which will refactor the {@link VaultFilterComponent}).
 *
 * This class listens to both the new {@link RoutedVaultFilterService} and the old {@link VaultFilterService}.
 * When a new filter is emitted the service uses the ids to find the corresponding tree nodes needed for
 * the old {@link VaultFilter} model. It then emits a bridge model that contains this information.
 */
@Injectable()
export class RoutedVaultFilterBridgeService {
  readonly activeFilter$: Observable<VaultFilter>;

  constructor(
    private router: Router,
    private routedVaultFilterService: RoutedVaultFilterService,
    legacyVaultFilterService: VaultFilterService
  ) {
    this.activeFilter$ = combineLatest([
      routedVaultFilterService.filter$,
      legacyVaultFilterService.collectionTree$,
      legacyVaultFilterService.folderTree$,
      legacyVaultFilterService.organizationTree$,
      legacyVaultFilterService.cipherTypeTree$,
    ]).pipe(
      map(([filter, collectionTree, folderTree, organizationTree, cipherTypeTree]) => {
        const legacyFilter = new VaultFilter();

        if (filter.collectionId !== undefined && filter.collectionId === Unassigned) {
          legacyFilter.selectedCollectionNode = this.findNode(collectionTree, null);
        }

        if (filter.collectionId !== undefined && filter.collectionId !== Unassigned) {
          legacyFilter.selectedCollectionNode = this.findNode(collectionTree, filter.collectionId);
        }

        if (filter.folderId !== undefined && filter.folderId === Unassigned) {
          legacyFilter.selectedFolderNode = this.findNode(folderTree, null);
        }

        if (filter.folderId !== undefined && filter.folderId !== Unassigned) {
          legacyFilter.selectedFolderNode = this.findNode(folderTree, filter.folderId);
        }

        if (filter.organizationId !== undefined) {
          legacyFilter.selectedOrganizationNode = this.findNode(
            organizationTree,
            filter.organizationId
          );
        }

        if (filter.type !== undefined && filter.type === "trash") {
          legacyFilter.selectedCipherTypeNode = new TreeNode<CipherTypeFilter>(
            { id: "trash", name: "", type: "trash", icon: "" },
            null
          );
        }

        if (filter.type !== undefined && filter.type !== "trash") {
          legacyFilter.selectedCipherTypeNode = this.findNode(cipherTypeTree, filter.type);
        }

        return new RoutedVaultFilterBridge(filter, legacyFilter, this);
      })
    );
  }

  navigate(filter: RoutedVaultFilterModel) {
    const route = this.routedVaultFilterService.createRoute(filter);
    this.router.navigate(route.commands, route.extras);
  }

  private findNode<T extends ITreeNodeObject>(
    node: TreeNode<T>,
    id: string
  ): TreeNode<T> | undefined {
    if (node.node.id === id) {
      return node;
    }

    for (const child of node.children) {
      const result = this.findNode(child, id);
      if (result !== undefined) {
        return result;
      }
    }

    return undefined;
  }
}
