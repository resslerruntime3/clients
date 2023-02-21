import { Component } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { combineLatestWith, map, Observable, startWith, Subject, switchMap, takeUntil } from "rxjs";

import { SelectItemView } from "@bitwarden/components/src/multi-select/models/select-item-view";

import {
  GroupServiceAccountAccessPolicyView,
  ServiceAccountAccessPoliciesView,
  UserServiceAccountAccessPolicyView,
} from "../../models/view/access-policy.view";
import { BaseAccessPolicyService } from "../../shared/access-policies/access-policy.service";
import {
  AccessSelectorComponent,
  AccessSelectorRowView,
} from "../../shared/access-policies/access-selector.component";
import { ServiceAccountAccessPolicyService } from "../service-account-access-policy.service";

@Component({
  selector: "sm-service-account-people",
  templateUrl: "./service-account-people.component.html",
  providers: [{ provide: BaseAccessPolicyService, useClass: ServiceAccountAccessPolicyService }],
})
export class ServiceAccountPeopleComponent {
  private destroy$ = new Subject<void>();
  private serviceAccountId: string;

  protected rows$: Observable<AccessSelectorRowView[]> =
    this.serviceAccountAccessPolicyService.changes$.pipe(
      startWith(null),
      combineLatestWith(this.route.params),
      switchMap(([_, params]) =>
        this.serviceAccountAccessPolicyService.getAccessPolicies(params.serviceAccountId)
      ),
      map((policies) => {
        const rows: AccessSelectorRowView[] = [];
        policies.userAccessPolicies.forEach((policy) => {
          rows.push({
            type: "user",
            name: policy.organizationUserName,
            granteeId: policy.organizationUserId,
            accessPolicyId: policy.id,
            read: policy.read,
            write: policy.write,
            icon: AccessSelectorComponent.userIcon,
          });
        });

        policies.groupAccessPolicies.forEach((policy) => {
          rows.push({
            type: "group",
            name: policy.groupName,
            granteeId: policy.groupId,
            accessPolicyId: policy.id,
            read: policy.read,
            write: policy.write,
            icon: AccessSelectorComponent.groupIcon,
          });
        });

        return rows;
      })
    );

  protected handleCreateAccessPolicies(selected: SelectItemView[]) {
    const serviceAccountAccessPoliciesView = new ServiceAccountAccessPoliciesView();
    serviceAccountAccessPoliciesView.userAccessPolicies = selected
      .filter((selection) => AccessSelectorComponent.getAccessItemType(selection) === "user")
      .map((filtered) => {
        const view = new UserServiceAccountAccessPolicyView();
        view.grantedServiceAccountId = this.serviceAccountId;
        view.organizationUserId = filtered.id;
        view.read = true;
        view.write = false;
        return view;
      });

    serviceAccountAccessPoliciesView.groupAccessPolicies = selected
      .filter((selection) => AccessSelectorComponent.getAccessItemType(selection) === "group")
      .map((filtered) => {
        const view = new GroupServiceAccountAccessPolicyView();
        view.grantedServiceAccountId = this.serviceAccountId;
        view.groupId = filtered.id;
        view.read = true;
        view.write = false;
        return view;
      });

    return this.serviceAccountAccessPolicyService.createAccessPolicies(
      this.serviceAccountId,
      serviceAccountAccessPoliciesView
    );
  }

  constructor(
    private route: ActivatedRoute,
    private serviceAccountAccessPolicyService: ServiceAccountAccessPolicyService
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.serviceAccountId = params.serviceAccountId;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
