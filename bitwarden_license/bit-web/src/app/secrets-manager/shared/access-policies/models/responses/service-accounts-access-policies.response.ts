import { BaseResponse } from "@bitwarden/common/models/response/base.response";

import {
  GroupServiceAccountAccessPolicyResponse,
  UserServiceAccountAccessPolicyResponse,
} from "./access-policy.response";

export class ServiceAccountAccessPoliciesResponse extends BaseResponse {
  userAccessPolicies: UserServiceAccountAccessPolicyResponse[];
  groupAccessPolicies: GroupServiceAccountAccessPolicyResponse[];

  constructor(response: any) {
    super(response);
    this.userAccessPolicies = this.getResponseProperty("UserAccessPolicies");
    this.groupAccessPolicies = this.getResponseProperty("GroupAccessPolicies");
  }
}
