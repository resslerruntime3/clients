import { ApiService } from "../../abstractions/api.service";
import { AppIdService } from "../../abstractions/appId.service";
import { CryptoService } from "../../abstractions/crypto.service";
import { LogService } from "../../abstractions/log.service";
import { MessagingService } from "../../abstractions/messaging.service";
import { PasswordGenerationService } from "../../abstractions/passwordGeneration.service";
import { PlatformUtilsService } from "../../abstractions/platformUtils.service";
import { InternalPolicyService } from "../../abstractions/policy/policy.service.abstraction";
import { StateService } from "../../abstractions/state.service";
import { HashPurpose } from "../../enums/hashPurpose";
import { PolicyType } from "../../enums/policyType";
import { PolicyData } from "../../models/data/policy.data";
import { Policy } from "../../models/domain/policy";
import { SymmetricCryptoKey } from "../../models/domain/symmetric-crypto-key";
import { PolicyResponse } from "../../models/response/policy.response";
import { AuthService } from "../abstractions/auth.service";
import { TokenService } from "../abstractions/token.service";
import { TwoFactorService } from "../abstractions/two-factor.service";
import { AuthResult } from "../models/domain/auth-result";
import {
  ForcePasswordResetOptions,
  ForceResetPasswordReason,
} from "../models/domain/force-password-reset-options";
import { PasswordLogInCredentials } from "../models/domain/log-in-credentials";
import { PasswordTokenRequest } from "../models/request/identity-token/password-token.request";
import { TokenTwoFactorRequest } from "../models/request/identity-token/token-two-factor.request";

import { LogInStrategy } from "./login.strategy";

export class PasswordLogInStrategy extends LogInStrategy {
  get email() {
    return this.tokenRequest.email;
  }

  get masterPasswordHash() {
    return this.tokenRequest.masterPasswordHash;
  }

  tokenRequest: PasswordTokenRequest;

  private localHashedPassword: string;
  private key: SymmetricCryptoKey;

  /**
   * Options to track if the user needs to update their password due to a password that does not meet an organization's
   * master password policy.
   */
  private forcePasswordResetOptions?: ForcePasswordResetOptions = undefined;

  constructor(
    cryptoService: CryptoService,
    apiService: ApiService,
    tokenService: TokenService,
    appIdService: AppIdService,
    platformUtilsService: PlatformUtilsService,
    messagingService: MessagingService,
    logService: LogService,
    protected stateService: StateService,
    twoFactorService: TwoFactorService,
    private passwordGenerationService: PasswordGenerationService,
    private policyService: InternalPolicyService,
    private authService: AuthService
  ) {
    super(
      cryptoService,
      apiService,
      tokenService,
      appIdService,
      platformUtilsService,
      messagingService,
      logService,
      stateService,
      twoFactorService
    );
  }

  async setUserKey() {
    await this.cryptoService.setKey(this.key);
    await this.cryptoService.setKeyHash(this.localHashedPassword);
  }

  async logInTwoFactor(
    twoFactor: TokenTwoFactorRequest,
    captchaResponse: string
  ): Promise<AuthResult> {
    this.tokenRequest.captchaResponse = captchaResponse ?? this.captchaBypassToken;
    const result = await super.logInTwoFactor(twoFactor);

    // 2FA was successful, save the force update password options with the state service if defined
    if (
      (await this.stateService.getIsAuthenticated()) &&
      this.forcePasswordResetOptions != undefined
    ) {
      await this.stateService.setForcePasswordResetOptions(this.forcePasswordResetOptions);
      await this.saveMasterPasswordPolicies();
      result.forcePasswordReset = true;
    }

    return result;
  }

  async logIn(credentials: PasswordLogInCredentials) {
    const { email, masterPassword, captchaToken, twoFactor } = credentials;

    this.key = await this.authService.makePreloginKey(masterPassword, email);

    // Hash the password early (before authentication) so we don't persist it in memory in plaintext
    this.localHashedPassword = await this.cryptoService.hashPassword(
      masterPassword,
      this.key,
      HashPurpose.LocalAuthorization
    );
    const hashedPassword = await this.cryptoService.hashPassword(masterPassword, this.key);

    this.tokenRequest = new PasswordTokenRequest(
      email,
      hashedPassword,
      captchaToken,
      await this.buildTwoFactor(twoFactor),
      await this.buildDeviceRequest()
    );

    const result = await this.startLogIn();

    // The identity result can contain master password policies for the user's organizations
    if (this.masterPasswordPolicies.length > 0) {
      // If any policies are active, evaluate the supplied password against them before its no longer in memory
      const [meetsRequirements, orgId] = await this.evaluateMasterPasswordPolicies(
        credentials,
        this.masterPasswordPolicies
      );

      if (!meetsRequirements) {
        const resetOptions = new ForcePasswordResetOptions(
          ForceResetPasswordReason.WeakMasterPasswordOnLogin,
          orgId
        );
        // Authentication was successful, save the force update password options with the state service
        if (await this.stateService.getIsAuthenticated()) {
          await this.stateService.setForcePasswordResetOptions(resetOptions);
          await this.saveMasterPasswordPolicies();
          result.forcePasswordReset = true;
        } else {
          // Authentication was not fully successful (likely 2FA), save the flag to this strategy for later use
          this.forcePasswordResetOptions = resetOptions;
        }
      }
    }

    return result;
  }

  private async evaluateMasterPasswordPolicies(
    { masterPassword, email }: PasswordLogInCredentials,
    policyResponses: PolicyResponse[]
  ): Promise<[boolean, string?]> {
    const passwordStrength = this.passwordGenerationService.passwordStrength(
      masterPassword,
      this.getPasswordStrengthUserInput(email)
    )?.score;

    // We only care about enabled, master password policies, with enforce on login enabled
    const policies = policyResponses
      .map((p) => new Policy(new PolicyData(p)))
      .filter((p) => p.type === PolicyType.MasterPassword && p.enabled && p.data.enforceOnLogin);

    const [meetsRequirements, failedOrgId] = this.policyService.evaluateMasterPasswordByEachPolicy(
      passwordStrength,
      masterPassword,
      policies
    );

    // Password meets the requirements of all required organizations
    if (meetsRequirements) {
      return [true];
    }

    return [meetsRequirements, failedOrgId];
  }

  private async saveMasterPasswordPolicies() {
    const policiesData: { [id: string]: PolicyData } = {};
    this.masterPasswordPolicies.map((p) => (policiesData[p.id] = new PolicyData(p)));
    await this.policyService.replace(policiesData);
  }

  protected getPasswordStrengthUserInput(email: string) {
    let userInput: string[] = [];
    const atPosition = email.indexOf("@");
    if (atPosition > -1) {
      userInput = userInput.concat(
        email
          .substr(0, atPosition)
          .trim()
          .toLowerCase()
          .split(/[^A-Za-z0-9]/)
      );
    }
    return userInput;
  }
}
