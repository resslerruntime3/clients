import {
  GroupServiceAccountAccessPolicyView,
  UserServiceAccountAccessPolicyView,
} from "./access-policy.view";

export class ServiceAccountAccessPoliciesView {
  userAccessPolicies: UserServiceAccountAccessPolicyView[];
  groupAccessPolicies: GroupServiceAccountAccessPolicyView[];
}
