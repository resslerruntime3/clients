import { Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { combineLatest, map, Observable } from "rxjs";

import { OrganizationService } from "@bitwarden/common/abstractions/organization/organization.service.abstraction";
import { Organization } from "@bitwarden/common/models/domain/organization";

@Component({
  selector: "app-org-reporting",
  templateUrl: "reporting.component.html",
})
export class ReportingComponent implements OnInit {
  organization$: Observable<Organization>;
  showLeftNav$: Observable<boolean>;

  constructor(private route: ActivatedRoute, private organizationService: OrganizationService) {}

  ngOnInit() {
    this.organization$ = combineLatest(
      [this.route.params, this.organizationService.organizations$],
      (params, orgs) => {
        return orgs.find((o) => o.id === params.organizationId);
      }
    );

    this.showLeftNav$ = this.organization$.pipe(
      map((o) => o.canAccessEventLogs && o.canAccessReports)
    );
  }
}
