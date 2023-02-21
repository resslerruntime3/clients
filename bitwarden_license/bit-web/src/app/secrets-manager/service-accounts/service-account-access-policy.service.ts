import { Injectable } from "@angular/core";
import { Subject } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { EncryptService } from "@bitwarden/common/abstractions/encrypt.service";

import {
  GroupServiceAccountAccessPolicyView,
  UserServiceAccountAccessPolicyView,
  ServiceAccountAccessPoliciesView,
} from "../models/view/access-policy.view";
import { BaseAccessPolicyService } from "../shared/access-policies/access-policy.service";
import { AccessPoliciesCreateRequest } from "../shared/access-policies/models/requests/access-policies-create.request";
import {
  GroupServiceAccountAccessPolicyResponse,
  UserServiceAccountAccessPolicyResponse,
} from "../shared/access-policies/models/responses/access-policy.response";
import { ServiceAccountAccessPoliciesResponse } from "../shared/access-policies/models/responses/service-accounts-access-policies.response";

@Injectable({
  providedIn: "root",
})
export class ServiceAccountAccessPolicyService extends BaseAccessPolicyService<ServiceAccountAccessPoliciesView> {
  protected _changes$ = new Subject<ServiceAccountAccessPoliciesView>();
  readonly changes$ = this._changes$.asObservable();

  constructor(
    cryptoService: CryptoService,
    apiService: ApiService,
    encryptService: EncryptService
  ) {
    super(cryptoService, apiService, encryptService);
  }

  async getAccessPolicies(serviceAccountId: string): Promise<ServiceAccountAccessPoliciesView> {
    const r = await this.apiService.send(
      "GET",
      "/service-accounts/" + serviceAccountId + "/access-policies",
      null,
      true,
      true
    );

    const results = new ServiceAccountAccessPoliciesResponse(r);
    return await this.createServiceAccountAccessPoliciesView(results);
  }

  async createAccessPolicies(
    serviceAccountId: string,
    serviceAccountAccessPoliciesView: ServiceAccountAccessPoliciesView
  ): Promise<ServiceAccountAccessPoliciesView> {
    const request = this.getServiceAccountAccessPoliciesCreateRequest(
      serviceAccountAccessPoliciesView
    );
    const r = await this.apiService.send(
      "POST",
      "/service-accounts/" + serviceAccountId + "/access-policies",
      request,
      true,
      true
    );
    const results = new ServiceAccountAccessPoliciesResponse(r);
    const view = await this.createServiceAccountAccessPoliciesView(results);
    this._changes$.next(view);
    return view;
  }

  private getServiceAccountAccessPoliciesCreateRequest(
    serviceAccountAccessPoliciesView: ServiceAccountAccessPoliciesView
  ): AccessPoliciesCreateRequest {
    const createRequest = new AccessPoliciesCreateRequest();

    if (serviceAccountAccessPoliciesView.userAccessPolicies?.length > 0) {
      createRequest.userAccessPolicyRequests =
        serviceAccountAccessPoliciesView.userAccessPolicies.map((ap) => {
          return this.getAccessPolicyRequest(ap.organizationUserId, ap);
        });
    }

    if (serviceAccountAccessPoliciesView.groupAccessPolicies?.length > 0) {
      createRequest.groupAccessPolicyRequests =
        serviceAccountAccessPoliciesView.groupAccessPolicies.map((ap) => {
          return this.getAccessPolicyRequest(ap.groupId, ap);
        });
    }

    return createRequest;
  }

  private async createServiceAccountAccessPoliciesView(
    serviceAccountAccessPoliciesResponse: ServiceAccountAccessPoliciesResponse
  ): Promise<ServiceAccountAccessPoliciesView> {
    const view = new ServiceAccountAccessPoliciesView();
    view.userAccessPolicies = serviceAccountAccessPoliciesResponse.userAccessPolicies.map((ap) => {
      return this.createUserServiceAccountAccessPolicyView(ap);
    });
    view.groupAccessPolicies = serviceAccountAccessPoliciesResponse.groupAccessPolicies.map(
      (ap) => {
        return this.createGroupServiceAccountAccessPolicyView(ap);
      }
    );
    return view;
  }

  private createUserServiceAccountAccessPolicyView(
    response: UserServiceAccountAccessPolicyResponse
  ): UserServiceAccountAccessPolicyView {
    const view = <UserServiceAccountAccessPolicyView>this.createBaseAccessPolicyView(response);
    view.grantedServiceAccountId = response.grantedServiceAccountId;
    view.organizationUserId = response.organizationUserId;
    view.organizationUserName = response.organizationUserName;
    return view;
  }

  private createGroupServiceAccountAccessPolicyView(
    response: GroupServiceAccountAccessPolicyResponse
  ): GroupServiceAccountAccessPolicyView {
    const view = <GroupServiceAccountAccessPolicyView>this.createBaseAccessPolicyView(response);
    view.grantedServiceAccountId = response.grantedServiceAccountId;
    view.groupId = response.groupId;
    view.groupName = response.groupName;
    return view;
  }
}
