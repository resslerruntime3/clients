import { Injectable } from "@angular/core";
import { Subject } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { EncryptService } from "@bitwarden/common/abstractions/encrypt.service";
import { EncString } from "@bitwarden/common/models/domain/enc-string";
import { SymmetricCryptoKey } from "@bitwarden/common/models/domain/symmetric-crypto-key";

import {
  GroupProjectAccessPolicyView,
  ServiceAccountProjectAccessPolicyView,
  UserProjectAccessPolicyView,
  ProjectAccessPoliciesView,
} from "../../models/view/access-policy.view";
import { BaseAccessPolicyService } from "../../shared/access-policies/access-policy.service";
import { AccessPoliciesCreateRequest } from "../../shared/access-policies/models/requests/access-policies-create.request";
import {
  GroupProjectAccessPolicyResponse,
  ServiceAccountProjectAccessPolicyResponse,
  UserProjectAccessPolicyResponse,
} from "../../shared/access-policies/models/responses/access-policy.response";
import { ProjectAccessPoliciesResponse } from "../../shared/access-policies/models/responses/project-access-policies.response";

@Injectable({
  providedIn: "root",
})
export class ProjectAccessPolicyService extends BaseAccessPolicyService<ProjectAccessPoliciesView> {
  protected _changes$ = new Subject<ProjectAccessPoliciesView>();
  readonly changes$ = this._changes$.asObservable();

  constructor(
    cryptoService: CryptoService,
    apiService: ApiService,
    encryptService: EncryptService
  ) {
    super(cryptoService, apiService, encryptService);
  }

  async getAccessPolicies(
    organizationId: string,
    projectId: string
  ): Promise<ProjectAccessPoliciesView> {
    const r = await this.apiService.send(
      "GET",
      "/projects/" + projectId + "/access-policies",
      null,
      true,
      true
    );

    const results = new ProjectAccessPoliciesResponse(r);
    return await this.createProjectAccessPoliciesView(organizationId, results);
  }

  async createAccessPolicies(
    organizationId: string,
    projectId: string,
    projectAccessPoliciesView: ProjectAccessPoliciesView
  ): Promise<ProjectAccessPoliciesView> {
    const request = this.getAccessPoliciesCreateRequest(projectAccessPoliciesView);
    const r = await this.apiService.send(
      "POST",
      "/projects/" + projectId + "/access-policies",
      request,
      true,
      true
    );
    const results = new ProjectAccessPoliciesResponse(r);
    const view = await this.createProjectAccessPoliciesView(organizationId, results);
    this._changes$.next(view);
    return view;
  }

  private async createProjectAccessPoliciesView(
    organizationId: string,
    projectAccessPoliciesResponse: ProjectAccessPoliciesResponse
  ): Promise<ProjectAccessPoliciesView> {
    const orgKey = await this.getOrganizationKey(organizationId);
    const view = new ProjectAccessPoliciesView();

    view.userAccessPolicies = projectAccessPoliciesResponse.userAccessPolicies.map((ap) => {
      return this.createUserProjectAccessPolicyView(ap);
    });
    view.groupAccessPolicies = projectAccessPoliciesResponse.groupAccessPolicies.map((ap) => {
      return this.createGroupProjectAccessPolicyView(ap);
    });
    view.serviceAccountAccessPolicies = await Promise.all(
      projectAccessPoliciesResponse.serviceAccountAccessPolicies.map(async (ap) => {
        return await this.createServiceAccountProjectAccessPolicyView(orgKey, ap);
      })
    );
    return view;
  }

  private getAccessPoliciesCreateRequest(
    projectAccessPoliciesView: ProjectAccessPoliciesView
  ): AccessPoliciesCreateRequest {
    const createRequest = new AccessPoliciesCreateRequest();

    if (projectAccessPoliciesView.userAccessPolicies?.length > 0) {
      createRequest.userAccessPolicyRequests = projectAccessPoliciesView.userAccessPolicies.map(
        (ap) => {
          return this.getAccessPolicyRequest(ap.organizationUserId, ap);
        }
      );
    }

    if (projectAccessPoliciesView.groupAccessPolicies?.length > 0) {
      createRequest.groupAccessPolicyRequests = projectAccessPoliciesView.groupAccessPolicies.map(
        (ap) => {
          return this.getAccessPolicyRequest(ap.groupId, ap);
        }
      );
    }

    if (projectAccessPoliciesView.serviceAccountAccessPolicies?.length > 0) {
      createRequest.serviceAccountAccessPolicyRequests =
        projectAccessPoliciesView.serviceAccountAccessPolicies.map((ap) => {
          return this.getAccessPolicyRequest(ap.serviceAccountId, ap);
        });
    }
    return createRequest;
  }

  private createUserProjectAccessPolicyView(
    response: UserProjectAccessPolicyResponse
  ): UserProjectAccessPolicyView {
    const view = <UserProjectAccessPolicyView>this.createBaseAccessPolicyView(response);
    view.grantedProjectId = response.grantedProjectId;
    view.organizationUserId = response.organizationUserId;
    view.organizationUserName = response.organizationUserName;
    return view;
  }

  private createGroupProjectAccessPolicyView(
    response: GroupProjectAccessPolicyResponse
  ): GroupProjectAccessPolicyView {
    const view = <GroupProjectAccessPolicyView>this.createBaseAccessPolicyView(response);
    view.grantedProjectId = response.grantedProjectId;
    view.groupId = response.groupId;
    view.groupName = response.groupName;
    return view;
  }

  private async createServiceAccountProjectAccessPolicyView(
    organizationKey: SymmetricCryptoKey,
    response: ServiceAccountProjectAccessPolicyResponse
  ): Promise<ServiceAccountProjectAccessPolicyView> {
    const view = <ServiceAccountProjectAccessPolicyView>this.createBaseAccessPolicyView(response);
    view.grantedProjectId = response.grantedProjectId;
    view.serviceAccountId = response.serviceAccountId;
    view.serviceAccountName = await this.encryptService.decryptToUtf8(
      new EncString(response.serviceAccountName),
      organizationKey
    );
    return view;
  }
}
