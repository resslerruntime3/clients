import { Injectable } from "@angular/core";
import { Router } from "@angular/router";

import { RoutedVaultFilterBridgeService as BaseRoutedVaultFilterBridgeService } from "../../individual-vault/vault-filter/services/routed-vault-filter-bridge.service";
import { RoutedVaultFilterService } from "../../individual-vault/vault-filter/services/routed-vault-filter.service";

import { VaultFilterService } from "./vault-filter.service";

@Injectable()
export class RoutedVaultFilterBridgeService extends BaseRoutedVaultFilterBridgeService {
  constructor(
    private router: Router,
    private routedVaultFilterService: RoutedVaultFilterService,
    legacyVaultFilterService: VaultFilterService
  ) {
    super(router, routedVaultFilterService, legacyVaultFilterService);
  }
}
