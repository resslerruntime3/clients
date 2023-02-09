import Domain from "./domain-base";

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
}
