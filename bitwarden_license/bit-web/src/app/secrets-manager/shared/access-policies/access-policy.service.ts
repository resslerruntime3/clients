import { Observable, Subject } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { EncryptService } from "@bitwarden/common/abstractions/encrypt.service";
import { EncString } from "@bitwarden/common/models/domain/enc-string";
import { SymmetricCryptoKey } from "@bitwarden/common/models/domain/symmetric-crypto-key";
import { ListResponse } from "@bitwarden/common/models/response/list.response";

import {
  BaseAccessPoliciesView,
  BaseAccessPolicyView,
  GroupProjectAccessPolicyView,
  GroupServiceAccountAccessPolicyView,
  ServiceAccountProjectAccessPolicyView,
  UserProjectAccessPolicyView,
  UserServiceAccountAccessPolicyView,
} from "../../models/view/access-policy.view";
import { PotentialGranteeView } from "../../models/view/potential-grantee.view";

import { AccessPolicyUpdateRequest } from "./models/requests/access-policy-update.request";
import { AccessPolicyRequest } from "./models/requests/access-policy.request";
import {
  GroupProjectAccessPolicyResponse,
  GroupServiceAccountAccessPolicyResponse,
  ServiceAccountProjectAccessPolicyResponse,
  UserProjectAccessPolicyResponse,
  UserServiceAccountAccessPolicyResponse,
} from "./models/responses/access-policy.response";
import { PotentialGranteeResponse } from "./models/responses/potential-grantee.response";

export abstract class BaseAccessPolicyService<T extends BaseAccessPoliciesView> {
  protected abstract _changes$: Subject<T>;
  /**
   * Emits when an access policy is created or deleted.
   */
  abstract readonly changes$: Observable<T>;

  constructor(
    private cryptoService: CryptoService,
    protected apiService: ApiService,
    protected encryptService: EncryptService
  ) {}

  abstract getAccessPolicies(...args: unknown[]): Promise<T>;

  abstract createAccessPolicies(...args: unknown[]): Promise<T>;

  async deleteAccessPolicy(accessPolicyId: string): Promise<void> {
    await this.apiService.send("DELETE", "/access-policies/" + accessPolicyId, null, true, false);
    this._changes$.next(null);
  }

  async updateAccessPolicy(baseAccessPolicyView: BaseAccessPolicyView): Promise<void> {
    const payload = new AccessPolicyUpdateRequest();
    payload.read = baseAccessPolicyView.read;
    payload.write = baseAccessPolicyView.write;
    await this.apiService.send(
      "PUT",
      "/access-policies/" + baseAccessPolicyView.id,
      payload,
      true,
      true
    );
  }

  async getPeoplePotentialGrantees(organizationId: string) {
    const r = await this.apiService.send(
      "GET",
      "/organizations/" + organizationId + "/access-policies/people/potential-grantees",
      null,
      true,
      true
    );
    const results = new ListResponse(r, PotentialGranteeResponse);
    return await this.createPotentialGranteeViews(organizationId, results.data);
  }

  async getServiceAccountsPotentialGrantees(organizationId: string) {
    const r = await this.apiService.send(
      "GET",
      "/organizations/" + organizationId + "/access-policies/service-accounts/potential-grantees",
      null,
      true,
      true
    );
    const results = new ListResponse(r, PotentialGranteeResponse);
    return await this.createPotentialGranteeViews(organizationId, results.data);
  }

  protected async getOrganizationKey(organizationId: string): Promise<SymmetricCryptoKey> {
    return await this.cryptoService.getOrgKey(organizationId);
  }

  protected getAccessPolicyRequest(
    granteeId: string,
    view:
      | UserProjectAccessPolicyView
      | UserServiceAccountAccessPolicyView
      | GroupProjectAccessPolicyView
      | GroupServiceAccountAccessPolicyView
      | ServiceAccountProjectAccessPolicyView
  ) {
    const request = new AccessPolicyRequest();
    request.granteeId = granteeId;
    request.read = view.read;
    request.write = view.write;
    return request;
  }

  protected createBaseAccessPolicyView(
    response:
      | UserProjectAccessPolicyResponse
      | UserServiceAccountAccessPolicyResponse
      | GroupProjectAccessPolicyResponse
      | GroupServiceAccountAccessPolicyResponse
      | ServiceAccountProjectAccessPolicyResponse
  ) {
    return {
      id: response.id,
      read: response.read,
      write: response.write,
      creationDate: response.creationDate,
      revisionDate: response.revisionDate,
    };
  }

  private async createPotentialGranteeViews(
    organizationId: string,
    results: PotentialGranteeResponse[]
  ): Promise<PotentialGranteeView[]> {
    const orgKey = await this.getOrganizationKey(organizationId);
    return await Promise.all(
      results.map(async (r) => {
        const view = new PotentialGranteeView();
        view.id = r.id;
        view.type = r.type;
        view.email = r.email;

        if (r.type === "serviceAccount") {
          view.name = await this.encryptService.decryptToUtf8(new EncString(r.name), orgKey);
        } else {
          view.name = r.name;
        }
        return view;
      })
    );
  }
}
