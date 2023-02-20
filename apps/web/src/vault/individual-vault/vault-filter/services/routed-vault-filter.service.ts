import { Injectable, OnDestroy } from "@angular/core";
import { ActivatedRoute, NavigationExtras } from "@angular/router";
import { combineLatest, map, Observable, Subject, takeUntil } from "rxjs";

import {
  RoutedVaultFilterItemType,
  RoutedVaultFilterModel,
} from "../shared/models/routed-vault-filter.model";

/**
 * This service is an abstraction layer on top of ActivatedRoute that
 * encapsulates the logic of how filters are stored in the URL.
 *
 * The service builds and emits filter models based on URL params and
 * also contains a method for generating routes to corresponding to those params.
 */
@Injectable()
export class RoutedVaultFilterService implements OnDestroy {
  private onDestroy = new Subject<void>();

  /**
   * Filter values extracted from the URL.
   * To change the values use {@link RoutedVaultFilterService.createRoute}.
   */
  filter$: Observable<RoutedVaultFilterModel>;

  constructor(activatedRoute: ActivatedRoute) {
    this.filter$ = combineLatest([activatedRoute.paramMap, activatedRoute.queryParamMap]).pipe(
      map(([params, queryParams]) => {
        const type = queryParams.get("type");
        let safeType: RoutedVaultFilterItemType | undefined = undefined;
        if (["favorites", "login", "card", "identity", "note"].includes(type)) {
          safeType = type as RoutedVaultFilterItemType;
        }

        return {
          collectionId: queryParams.get("collectionId") ?? undefined,
          folderId: queryParams.get("folderId") ?? undefined,
          organizationId:
            params.get("organizationId") ?? queryParams.get("organizationId") ?? undefined,
          organizationIdParamType:
            params.get("organizationId") != undefined ? ("path" as const) : ("query" as const),
          type: safeType,
        };
      }),
      takeUntil(this.onDestroy)
    );
  }

  /**
   * Create a route that can be used with Router or RouterLink.
   * To subscribe to changes use {@link RoutedVaultFilterService.filter$}
   *
   * @param filter Filter values that should be applied to the URL.
   * @returns route that can be used with Router or RouterLink
   */
  createRoute(filter: RoutedVaultFilterModel): [commands: any[], extras?: NavigationExtras] {
    const commands =
      filter.organizationIdParamType === "path"
        ? ["/", "organizations", filter.organizationId]
        : [];
    const extras: NavigationExtras = {
      queryParams: {
        collectionId: filter.collectionId ?? null,
        folderId: filter.folderId ?? null,
        organizationId:
          filter.organizationIdParamType === "path" ? null : filter.organizationId ?? null,
        type: filter.type ?? null,
      },
      queryParamsHandling: "merge",
    };
    return [commands, extras];
  }

  ngOnDestroy(): void {
    this.onDestroy.next();
    this.onDestroy.complete();
  }
}
