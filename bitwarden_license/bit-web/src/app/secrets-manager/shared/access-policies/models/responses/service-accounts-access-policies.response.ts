import { BaseResponse } from "@bitwarden/common/models/response/base.response";

import {
  GroupServiceAccountAccessPolicyResponse,
  ServiceAccountProjectAccessPolicyResponse,
  UserServiceAccountAccessPolicyResponse,
} from "./access-policy.response";

export class ServiceAccountAccessPoliciesResponse extends BaseResponse {
  userAccessPolicies: UserServiceAccountAccessPolicyResponse[];
  groupAccessPolicies: GroupServiceAccountAccessPolicyResponse[];
  projectAccessPolicies: ServiceAccountProjectAccessPolicyResponse[];

  constructor(response: any) {
    super(response);
    this.userAccessPolicies = this.getResponseProperty("UserAccessPolicies");
    this.groupAccessPolicies = this.getResponseProperty("GroupAccessPolicies");

    const projects = this.getResponseProperty("ProjectAccessPolicies");
    this.projectAccessPolicies = projects?.map(
      (p: any) => new ServiceAccountProjectAccessPolicyResponse(p)
    );
  }
}
