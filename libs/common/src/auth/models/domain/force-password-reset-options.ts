export enum ForceResetPasswordReason {
  /**
   * Occurs when an organization admin forces a user to reset their password.
   */
  AdminForcePasswordReset,

  /**
   * Occurs when a user logs in with a master password that does not meet an organization's master password policy that
   * is enforced on login.
   */
  WeakMasterPasswordOnLogin,
}

/**
 * Options that describe the reason/cause for forcing a password reset.
 */
export class ForcePasswordResetOptions {
  /**
   * The reason the user is being forced to reset their password.
   */
  reason: ForceResetPasswordReason;

  /**
   * Optional organization ID that is forcing the password reset.
   */
  orgId?: string;

  constructor(reason: ForceResetPasswordReason, orgId?: string) {
    this.reason = reason;
    this.orgId = orgId;
  }
}
