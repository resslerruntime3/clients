import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { combineLatest, map, Observable } from "rxjs";

import { ITreeNodeObject, TreeNode } from "@bitwarden/common/models/domain/tree-node";

import { RoutedVaultFilterModel } from "../../../core/vault-filter/routed-vault-filter.model";
import { RoutedVaultFilterService } from "../../../core/vault-filter/router-vault-filter.service";
import { RoutedVaultFilterBridge } from "../shared/models/routed-vault-filter-bridge.model";
import { VaultFilter } from "../shared/models/vault-filter.model";

import { VaultFilterService } from "./abstractions/vault-filter.service";

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

        if (filter.collectionId !== undefined) {
          legacyFilter.selectedCollectionNode = this.findNode(collectionTree, filter.collectionId);
        }

        if (filter.folderId !== undefined) {
          legacyFilter.selectedFolderNode = this.findNode(folderTree, filter.folderId);
        }

        if (filter.organizationId !== undefined) {
          legacyFilter.selectedOrganizationNode = this.findNode(
            organizationTree,
            filter.organizationId
          );
        }

        if (filter.type !== undefined) {
          legacyFilter.selectedCipherTypeNode = this.findNode(cipherTypeTree, filter.type);
        }

        const bridgeModel = new RoutedVaultFilterBridge(filter, legacyFilter, this);

        return bridgeModel;
      })
    );
  }

  navigate(filter: RoutedVaultFilterModel) {
    const route = this.routedVaultFilterService.createRoute(filter);
    this.router.navigate(route.commands, route.extras);
  }

  private findNode<T extends ITreeNodeObject>(
    node: TreeNode<T>,
    idOrPredicate: string | ((node: T) => boolean)
  ): TreeNode<T> | undefined {
    if (typeof idOrPredicate === "string" && node.node.id === idOrPredicate) {
      return node;
    }

    if (typeof idOrPredicate === "function" && idOrPredicate(node.node)) {
      return node;
    }

    for (const child of node.children) {
      const result = this.findNode(child, idOrPredicate);
      if (result !== undefined) {
        return result;
      }
    }

    return undefined;
  }
}
