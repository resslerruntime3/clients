import { Component, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { FormControl, FormGroup, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { combineLatest, firstValueFrom, Observable, share, switchMap, tap } from "rxjs";

import { ValidationService } from "@bitwarden/common/abstractions/validation.service";
import { SelectItemView } from "@bitwarden/components/src/multi-select/models/select-item-view";

import { BaseAccessPoliciesView, BaseAccessPolicyView } from "../../models/view/access-policy.view";

import { BaseAccessPolicyService } from "./access-policy.service";

export type AccessSelectorRowView = {
  type: "user" | "group" | "serviceAccount";
  name: string;
  granteeId: string;
  accessPolicyId: string;
  read: boolean;
  write: boolean;
  icon: string;
  disabled?: boolean;
};

@Component({
  selector: "sm-access-selector",
  templateUrl: "./access-selector.component.html",
})
export class AccessSelectorComponent<T extends BaseAccessPoliciesView> implements OnInit {
  static readonly userIcon = "bwi-user";
  static readonly groupIcon = "bwi-family";
  static readonly serviceAccountIcon = "bwi-wrench";

  @Input() label: string;
  @Input() hint: string;
  @Input() columnTitle: string;
  @Input() emptyMessage: string;
  @Input() rows$: Observable<AccessSelectorRowView[]>;
  @Input() granteeType: "people" | "serviceAccounts";

  @Output() onCreateAccessPolicies = new EventEmitter<SelectItemView[]>();

  private maxLength = 15;
  protected formGroup = new FormGroup({
    multiSelect: new FormControl([], [Validators.required, Validators.maxLength(this.maxLength)]),
  });
  protected loading = true;
  protected selectItems$: Observable<SelectItemView[]>;

  constructor(
    private accessPolicyService: BaseAccessPolicyService<T>,
    private validationService: ValidationService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.formGroup.disable();

    this.selectItems$ = combineLatest([this.rows$, this.route.params]).pipe(
      switchMap(async ([rows, params]) =>
        this.getPotentialGrantees(params.organizationId).then((grantees) =>
          grantees
            .filter((g) => !rows.some((row) => row.granteeId === g.id))
            .map((granteeView) => {
              let icon: string;
              let listName: string;
              if (granteeView.type === "user") {
                icon = AccessSelectorComponent.userIcon;
                listName = `${granteeView.name} (${granteeView.email})`;
              } else if (granteeView.type === "group") {
                icon = AccessSelectorComponent.groupIcon;
                listName = granteeView.name;
              } else {
                icon = AccessSelectorComponent.serviceAccountIcon;
                listName = granteeView.name;
              }
              return {
                icon: icon,
                id: granteeView.id,
                labelName: granteeView.name,
                listName: listName,
              };
            })
        )
      ),
      tap(() => {
        this.loading = false;
        this.formGroup.reset();
        this.formGroup.enable();
      }),
      share()
    );
  }

  submit = async () => {
    this.formGroup.markAllAsTouched();
    if (this.formGroup.invalid) {
      return;
    }
    this.formGroup.disable();
    this.loading = true;

    this.onCreateAccessPolicies.emit(this.formGroup.value.multiSelect);

    return firstValueFrom(this.selectItems$);
  };

  async update(target: any, accessPolicyId: string): Promise<void> {
    try {
      const accessPolicyView = new BaseAccessPolicyView();
      accessPolicyView.id = accessPolicyId;
      if (target.value === "canRead") {
        accessPolicyView.read = true;
        accessPolicyView.write = false;
      } else if (target.value === "canWrite") {
        accessPolicyView.read = false;
        accessPolicyView.write = true;
      } else if (target.value === "canReadWrite") {
        accessPolicyView.read = true;
        accessPolicyView.write = true;
      }

      await this.accessPolicyService.updateAccessPolicy(accessPolicyView);
    } catch (e) {
      this.validationService.showError(e);
    }
  }

  delete = (accessPolicyId: string) => async () => {
    this.loading = true;
    this.formGroup.disable();
    await this.accessPolicyService.deleteAccessPolicy(accessPolicyId);
    return firstValueFrom(this.selectItems$);
  };

  private getPotentialGrantees(organizationId: string) {
    return this.granteeType === "people"
      ? this.accessPolicyService.getPeoplePotentialGrantees(organizationId)
      : this.accessPolicyService.getServiceAccountsPotentialGrantees(organizationId);
  }

  static getAccessItemType(item: SelectItemView) {
    switch (item.icon) {
      case AccessSelectorComponent.userIcon:
        return "user";
      case AccessSelectorComponent.groupIcon:
        return "group";
      case AccessSelectorComponent.serviceAccountIcon:
        return "serviceAccount";
    }
  }
}
