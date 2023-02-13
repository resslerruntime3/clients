import { PolicyType } from "../../enums/policyType";

import Domain from "./domain-base";
import { Policy } from "./policy";

export class MasterPasswordPolicyOptions extends Domain {
  minComplexity = 0;
  minLength = 0;
  requireUpper = false;
  requireLower = false;
  requireNumbers = false;
  requireSpecial = false;

  /**
   * Flag to indicate if the policy should be enforced on login.
   * If true, and the user's password does not meet the policy requirements,
   * the user will be forced to update their password.
   */
  enforceOnLogin = false;

  static fromPolicy(policy: Policy): MasterPasswordPolicyOptions {
    if (policy.type !== PolicyType.MasterPassword || policy.data == null) {
      return null;
    }
    const options = new MasterPasswordPolicyOptions();
    options.minComplexity = policy.data.minComplexity;
    options.minLength = policy.data.minLength;
    options.requireUpper = policy.data.requireUpper;
    options.requireLower = policy.data.requireLower;
    options.requireNumbers = policy.data.requireNumbers;
    options.requireSpecial = policy.data.requireSpecial;
    options.enforceOnLogin = policy.data.enforceOnLogin;
    return options;
  }
}
