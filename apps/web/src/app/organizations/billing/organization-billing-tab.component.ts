import { Component } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { concatMap, Subject, takeUntil } from "rxjs";

import { OrganizationService } from "@bitwarden/common/abstractions/organization/organization.service.abstraction";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { Organization } from "@bitwarden/common/models/domain/organization";

@Component({
  selector: "app-org-billing-tab",
  templateUrl: "organization-billing-tab.component.html",
})
export class OrganizationBillingTabComponent {
  organization: Organization;
  showPaymentAndHistory: boolean;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private organizationService: OrganizationService,
    private platformUtilsService: PlatformUtilsService
  ) {}

  ngOnInit() {
    this.route.params
      .pipe(
        concatMap(async (params) => {
          this.organization = await this.organizationService.get(params.organizationId);
          this.showPaymentAndHistory =
            !this.platformUtilsService.isSelfHost() && this.organization.canManageBilling;
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
