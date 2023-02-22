import { BehaviorSubject, filter, map, switchMap, tap } from "rxjs";
import { Jsonify } from "type-fest";

import { OrganizationService } from "@bitwarden/common/abstractions/organization/organization.service.abstraction";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { PolicyType } from "@bitwarden/common/enums/policyType";
import { Policy } from "@bitwarden/common/models/domain/policy";
import { PolicyService } from "@bitwarden/common/services/policy/policy.service";

import { browserSession, sessionSync } from "../decorators/session-sync-observable";

@browserSession
export class BrowserPolicyService extends PolicyService {
  @sessionSync({
    initializer: (obj: Jsonify<Policy>) => Object.assign(new Policy(), obj),
    initializeAs: "array",
  })
  protected _policies: BehaviorSubject<Policy[]>;

  constructor(stateService: StateService, organizationService: OrganizationService) {
    super(stateService, organizationService);

    this._policies
      .pipe(
        map((policies) => policies.find((p) => p.type == PolicyType.ActivateAutofill && p.enabled)),
        filter((p) => p != null),
        switchMap(async (p) => await this.stateService.getActivatedAutofillPolicy()),
        tap((activated) => {
          if (activated === undefined) {
            this.stateService.setActivatedAutofillPolicy(false);
          }
        })
      )
      .subscribe();

    this.updateAutofillPolicy();
  }

  async updateAutofillPolicy(): Promise<void> {
    const activated = await this.stateService.getActivatedAutofillPolicy();
    if (activated === false) {
      this.stateService.setEnableAutoFillOnPageLoad(true);
      this.stateService.setActivatedAutofillPolicy(true);
    }
  }
}
