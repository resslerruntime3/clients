import { Injectable, OnDestroy } from "@angular/core";
import {
  BehaviorSubject,
  combineLatestWith,
  firstValueFrom,
  mergeMap,
  Observable,
  of,
  Subject,
  takeUntil,
  map,
} from "rxjs";

import { CipherTypeFilter } from "@bitwarden/angular/vault/vault-filter/models/cipher-filter.model";
import { CollectionFilter } from "@bitwarden/angular/vault/vault-filter/models/collection-filter.model";
import { FolderFilter } from "@bitwarden/angular/vault/vault-filter/models/folder-filter.model";
import { OrganizationFilter } from "@bitwarden/angular/vault/vault-filter/models/organization-filter.model";
import { CipherService } from "@bitwarden/common/abstractions/cipher.service";
import { CollectionService } from "@bitwarden/common/abstractions/collection.service";
import { FolderService } from "@bitwarden/common/abstractions/folder/folder.service.abstraction";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { OrganizationService } from "@bitwarden/common/abstractions/organization.service";
import { PolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { VaultFilterService as VaultFilterServiceAbstraction } from "@bitwarden/common/abstractions/vault-filter.service";
import { PolicyType } from "@bitwarden/common/enums/policyType";
import { ServiceUtils } from "@bitwarden/common/misc/serviceUtils";
import { Organization } from "@bitwarden/common/models/domain/organization";
import { TreeNode } from "@bitwarden/common/models/domain/treeNode";
import { CollectionView } from "@bitwarden/common/models/view/collectionView";
import { FolderView } from "@bitwarden/common/models/view/folderView";

const NestingDelimiter = "/";

@Injectable()
export class VaultFilterService implements VaultFilterServiceAbstraction, OnDestroy {
  protected _collapsedFilterNodes = new BehaviorSubject<Set<string>>(null);
  collapsedFilterNodes$: Observable<Set<string>> = this._collapsedFilterNodes.asObservable();
  protected _filteredFolders = new BehaviorSubject<FolderView[]>(null);
  filteredFolders$: Observable<FolderView[]> = this._filteredFolders.asObservable();
  protected _filteredCollections = new BehaviorSubject<CollectionView[]>(null);
  filteredCollections$: Observable<CollectionView[]> = this._filteredCollections.asObservable();

  nestedFolders$: Observable<TreeNode<FolderFilter>> = this.filteredFolders$.pipe(
    map((folders) => {
      return this.getAllNestedFolders(folders);
    })
  );
  nestedCollections$: Observable<TreeNode<CollectionFilter>> = this.filteredCollections$.pipe(
    map((collections) => {
      return collections ? this.getAllNestedCollections(collections) : null;
    })
  );

  protected _organizationFilter = new BehaviorSubject<Organization>(null);
  protected destroy$: Subject<void> = new Subject<void>();

  // Fake collections observable
  // TODO: Remove once collections is refactored with observables and use Collection Service
  protected collectionViews$: BehaviorSubject<CollectionView[]> = new BehaviorSubject<
    CollectionView[]
  >(null);

  constructor(
    protected stateService: StateService,
    protected organizationService: OrganizationService,
    protected folderService: FolderService,
    protected cipherService: CipherService,
    protected collectionService: CollectionService,
    protected policyService: PolicyService,
    protected i18nService: I18nService
  ) {
    this.loadSubscriptions();
  }

  protected loadSubscriptions() {
    this.folderService.folderViews$
      .pipe(
        combineLatestWith(this._organizationFilter),
        mergeMap(([folders, org]) => {
          return this.filterFolders(folders, org);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(this._filteredFolders);

    // TODO: Use collectionService once collections is refactored
    this.collectionViews$
      .pipe(
        combineLatestWith(this._organizationFilter),
        mergeMap(([collections, org]) => {
          return this.filterCollections(collections, org);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(this._filteredCollections);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Helper method to update collections and update fake observable
  // TODO: Remove once collections is refactored with observables
  async reloadCollections() {
    this.collectionViews$.next(await this.collectionService.getAllDecrypted());
  }

  async storeCollapsedFilterNodes(collapsedFilterNodes: Set<string>): Promise<void> {
    await this.stateService.setCollapsedGroupings(Array.from(collapsedFilterNodes));
    this._collapsedFilterNodes.next(collapsedFilterNodes);
  }

  async buildCollapsedFilterNodes(): Promise<Set<string>> {
    const nodes = new Set(await this.stateService.getCollapsedGroupings());
    this._collapsedFilterNodes.next(nodes);
    return nodes;
  }

  updateOrganizationFilter(organization: Organization) {
    if (organization.id != "AllVaults") {
      this._organizationFilter.next(organization);
    } else {
      this._organizationFilter.next(null);
    }
  }

  async ensureVaultFiltersAreExpanded() {
    const collapsedFilterNodes = await this.buildCollapsedFilterNodes();
    if (!collapsedFilterNodes.has("AllVaults")) {
      return;
    }
    collapsedFilterNodes.delete("AllVaults");
    await this.storeCollapsedFilterNodes(collapsedFilterNodes);
  }

  async buildNestedOrganizations(): Promise<Observable<TreeNode<OrganizationFilter>>> {
    const orgs = (await this.organizationService.getAll()) as OrganizationFilter[];
    const head = new Organization() as OrganizationFilter;
    head.enabled = true;
    const headNode = new TreeNode<OrganizationFilter>(head, null, "allVaults", "AllVaults");
    if (!(await this.checkForPersonalOwnershipPolicy())) {
      const myVault = new Organization() as OrganizationFilter;
      myVault.id = "MyVault";
      myVault.icon = "bwi-user";
      myVault.enabled = true;
      myVault.hideOptions = true;
      myVault.hideOptions = true;
      const myVaultNode = new TreeNode<OrganizationFilter>(
        myVault,
        null,
        this.i18nService.t("myVault")
      );
      headNode.children.push(myVaultNode);
    }
    if (await this.checkForSingleOrganizationPolicy()) {
      orgs.length = 1;
    }
    orgs.forEach((filter) => {
      filter.icon = "bwi-business";
      const node = new TreeNode<OrganizationFilter>(filter, head, filter.name);
      headNode.children.push(node);
    });
    return of(headNode);
  }

  buildNestedTypes(
    head: CipherTypeFilter,
    array: CipherTypeFilter[]
  ): Observable<TreeNode<CipherTypeFilter>> {
    const headNode = new TreeNode<CipherTypeFilter>(head, null, "allItems", "AllItems");
    array.forEach((filter) => {
      const node = new TreeNode<CipherTypeFilter>(filter, head, filter.name);
      headNode.children.push(node);
    });
    return of(headNode);
  }

  buildNestedTrash(): Observable<TreeNode<CipherTypeFilter>> {
    const head: CipherTypeFilter = {
      id: "headTrash",
      name: "HeadTrash",
      type: "trash",
      icon: "bwi-trash",
    };
    const headNode = new TreeNode<CipherTypeFilter>(head, null);
    const node = new TreeNode<CipherTypeFilter>(
      {
        id: "trash",
        name: this.i18nService.t("trash"),
        type: "trash",
        icon: "bwi-trash",
      },
      null
    );
    headNode.children.push(node);
    return of(headNode);
  }

  // TODO: Use observable once collections is refactored
  async getNestedCollection(id: string): Promise<TreeNode<CollectionFilter>> {
    const collections = await this.getAllNestedCollections(
      await this.collectionService.getAllDecrypted()
    );
    return ServiceUtils.getTreeNodeObject(collections, id) as TreeNode<CollectionFilter>;
  }

  protected async filterCollections(
    storedCollections: CollectionView[],
    org?: Organization
  ): Promise<CollectionView[]> {
    let collections: CollectionView[];
    if (org?.id != null) {
      collections = storedCollections.filter((c) => c.organizationId === org?.id);
    } else {
      collections = storedCollections;
    }
    return collections;
  }

  protected getAllNestedCollections(collections: CollectionView[]): TreeNode<CollectionFilter> {
    const nodes: TreeNode<CollectionFilter>[] = [];
    collections.forEach((c) => {
      const collectionCopy = new CollectionView() as CollectionFilter;
      collectionCopy.id = c.id;
      collectionCopy.organizationId = c.organizationId;
      collectionCopy.icon = "bwi-collection";
      const parts = c.name != null ? c.name.replace(/^\/+|\/+$/g, "").split(NestingDelimiter) : [];
      ServiceUtils.nestedTraverse(nodes, 0, parts, collectionCopy, null, NestingDelimiter);
    });

    const head = new CollectionView() as CollectionFilter;
    const headNode = new TreeNode<CollectionFilter>(head, null, "collections", "AllCollections");
    nodes.forEach((n) => {
      n.parent = head;
      headNode.children.push(n);
    });
    return headNode;
  }

  async getNestedFolder(id: string): Promise<TreeNode<FolderFilter>> {
    const folders = await this.getAllNestedFolders(
      await firstValueFrom(this.folderService.folderViews$)
    );
    return ServiceUtils.getTreeNodeObject(folders, id) as TreeNode<FolderFilter>;
  }

  protected async filterFolders(
    storedFolders: FolderView[],
    org?: Organization
  ): Promise<FolderView[]> {
    let folders: FolderView[];
    if (org?.id != null) {
      const ciphers = await this.cipherService.getAllDecrypted();
      const orgCiphers = ciphers.filter((c) => c.organizationId == org?.id);
      folders = storedFolders.filter(
        (f) =>
          orgCiphers.filter((oc) => oc.folderId == f.id).length > 0 ||
          ciphers.filter((c) => c.folderId == f.id).length < 1
      );
    } else {
      folders = storedFolders;
    }
    return folders;
  }

  protected getAllNestedFolders(folders: FolderView[]): TreeNode<FolderFilter> {
    const nodes: TreeNode<FolderFilter>[] = [];
    folders.forEach((f) => {
      const folderCopy = new FolderView() as FolderFilter;
      folderCopy.id = f.id;
      folderCopy.revisionDate = f.revisionDate;
      folderCopy.icon = "bwi-folder";
      const parts = f.name != null ? f.name.replace(/^\/+|\/+$/g, "").split(NestingDelimiter) : [];
      ServiceUtils.nestedTraverse(nodes, 0, parts, folderCopy, null, NestingDelimiter);
    });

    const head = new FolderView() as FolderFilter;
    const headNode = new TreeNode<FolderFilter>(head, null, "folders", "AllFolders");
    nodes.forEach((n) => {
      n.parent = head;
      headNode.children.push(n);
    });
    return headNode;
  }

  async checkForSingleOrganizationPolicy(): Promise<boolean> {
    return await this.policyService.policyAppliesToUser(PolicyType.SingleOrg);
  }

  async checkForPersonalOwnershipPolicy(): Promise<boolean> {
    return await this.policyService.policyAppliesToUser(PolicyType.PersonalOwnership);
  }
}
