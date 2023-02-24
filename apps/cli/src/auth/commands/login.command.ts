import * as http from "http";

import * as program from "commander";
import * as inquirer from "inquirer";
import Separator from "inquirer/lib/objects/separator";
import { firstValueFrom } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { CryptoFunctionService } from "@bitwarden/common/abstractions/cryptoFunction.service";
import { EnvironmentService } from "@bitwarden/common/abstractions/environment.service";
import { OrganizationService } from "@bitwarden/common/abstractions/organization/organization.service.abstraction";
import { PasswordGenerationService } from "@bitwarden/common/abstractions/passwordGeneration.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { PolicyApiServiceAbstraction } from "@bitwarden/common/abstractions/policy/policy-api.service.abstraction";
import { PolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { KeyConnectorService } from "@bitwarden/common/auth/abstractions/key-connector.service";
import { TwoFactorService } from "@bitwarden/common/auth/abstractions/two-factor.service";
import { TwoFactorProviderType } from "@bitwarden/common/auth/enums/two-factor-provider-type";
import { AuthResult } from "@bitwarden/common/auth/models/domain/auth-result";
import { ForceResetPasswordReason } from "@bitwarden/common/auth/models/domain/force-password-reset-options";
import {
  PasswordLogInCredentials,
  SsoLogInCredentials,
  UserApiLogInCredentials,
} from "@bitwarden/common/auth/models/domain/log-in-credentials";
import { TokenTwoFactorRequest } from "@bitwarden/common/auth/models/request/identity-token/token-two-factor.request";
import { PasswordRequest } from "@bitwarden/common/auth/models/request/password.request";
import { TwoFactorEmailRequest } from "@bitwarden/common/auth/models/request/two-factor-email.request";
import { UpdateTempPasswordRequest } from "@bitwarden/common/auth/models/request/update-temp-password.request";
import { PolicyType } from "@bitwarden/common/enums/policyType";
import { NodeUtils } from "@bitwarden/common/misc/nodeUtils";
import { Utils } from "@bitwarden/common/misc/utils";
import { EncString } from "@bitwarden/common/models/domain/enc-string";
import { Policy } from "@bitwarden/common/models/domain/policy";
import { SymmetricCryptoKey } from "@bitwarden/common/models/domain/symmetric-crypto-key";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { SyncService } from "@bitwarden/common/vault/abstractions/sync/sync.service.abstraction";

import { Response } from "../../models/response";
import { MessageResponse } from "../../models/response/message.response";

export class LoginCommand {
  protected canInteract: boolean;
  protected clientSecret: string;
  protected email: string;

  private ssoRedirectUri: string = null;
  private options: program.OptionValues;
  private masterPasswordPolicies?: Policy[] = undefined;

  constructor(
    protected authService: AuthService,
    protected apiService: ApiService,
    protected cryptoFunctionService: CryptoFunctionService,
    protected environmentService: EnvironmentService,
    protected passwordGenerationService: PasswordGenerationService,
    protected platformUtilsService: PlatformUtilsService,
    protected stateService: StateService,
    protected cryptoService: CryptoService,
    protected policyService: PolicyService,
    protected twoFactorService: TwoFactorService,
    protected syncService: SyncService,
    protected keyConnectorService: KeyConnectorService,
    protected policyApiService: PolicyApiServiceAbstraction,
    protected orgService: OrganizationService,
    protected logoutCallback: () => Promise<void>
  ) {}

  async run(email: string, password: string, options: program.OptionValues) {
    this.options = options;
    this.email = email;

    this.canInteract = process.env.BW_NOINTERACTION !== "true";

    let ssoCodeVerifier: string = null;
    let ssoCode: string = null;
    let orgIdentifier: string = null;

    let clientId: string = null;
    let clientSecret: string = null;

    let selectedProvider: any = null;

    if (options.apikey != null) {
      const apiIdentifiers = await this.apiIdentifiers();
      clientId = apiIdentifiers.clientId;
      clientSecret = apiIdentifiers.clientSecret;
    } else if (options.sso != null && this.canInteract) {
      const passwordOptions: any = {
        type: "password",
        length: 64,
        uppercase: true,
        lowercase: true,
        numbers: true,
        special: false,
      };
      const state = await this.passwordGenerationService.generatePassword(passwordOptions);
      ssoCodeVerifier = await this.passwordGenerationService.generatePassword(passwordOptions);
      const codeVerifierHash = await this.cryptoFunctionService.hash(ssoCodeVerifier, "sha256");
      const codeChallenge = Utils.fromBufferToUrlB64(codeVerifierHash);
      try {
        const ssoParams = await this.openSsoPrompt(codeChallenge, state);
        ssoCode = ssoParams.ssoCode;
        orgIdentifier = ssoParams.orgIdentifier;
      } catch {
        return Response.badRequest("Something went wrong. Try again.");
      }
    } else {
      if ((email == null || email === "") && this.canInteract) {
        const answer: inquirer.Answers = await inquirer.createPromptModule({
          output: process.stderr,
        })({
          type: "input",
          name: "email",
          message: "Email address:",
        });
        email = answer.email;
      }
      if (email == null || email.trim() === "") {
        return Response.badRequest("Email address is required.");
      }
      if (email.indexOf("@") === -1) {
        return Response.badRequest("Email address is invalid.");
      }
      this.email = email;

      if (password == null || password === "") {
        if (options.passwordfile) {
          password = await NodeUtils.readFirstLine(options.passwordfile);
        } else if (options.passwordenv && process.env[options.passwordenv]) {
          password = process.env[options.passwordenv];
        } else if (this.canInteract) {
          const answer: inquirer.Answers = await inquirer.createPromptModule({
            output: process.stderr,
          })({
            type: "password",
            name: "password",
            message: "Master password:",
          });
          password = answer.password;
        }
      }

      if (password == null || password === "") {
        return Response.badRequest("Master password is required.");
      }
    }

    let twoFactorToken: string = options.code;
    let twoFactorMethod: TwoFactorProviderType = null;
    try {
      if (options.method != null) {
        twoFactorMethod = parseInt(options.method, null);
      }
    } catch (e) {
      return Response.error("Invalid two-step login method.");
    }

    const twoFactor =
      twoFactorToken == null
        ? null
        : new TokenTwoFactorRequest(twoFactorMethod, twoFactorToken, false);

    try {
      await this.validatedParams();

      let response: AuthResult = null;
      if (clientId != null && clientSecret != null) {
        if (!clientId.startsWith("user")) {
          return Response.error("Invalid API Key; Organization API Key currently not supported");
        }
        response = await this.authService.logIn(
          new UserApiLogInCredentials(clientId, clientSecret)
        );
      } else if (ssoCode != null && ssoCodeVerifier != null) {
        response = await this.authService.logIn(
          new SsoLogInCredentials(
            ssoCode,
            ssoCodeVerifier,
            this.ssoRedirectUri,
            orgIdentifier,
            twoFactor
          )
        );
      } else {
        response = await this.authService.logIn(
          new PasswordLogInCredentials(email, password, null, twoFactor)
        );
      }
      if (response.captchaSiteKey) {
        const credentials = new PasswordLogInCredentials(email, password);
        const handledResponse = await this.handleCaptchaRequired(twoFactor, credentials);

        // Error Response
        if (handledResponse instanceof Response) {
          return handledResponse;
        } else {
          response = handledResponse;
        }
      }
      if (response.requiresTwoFactor) {
        const twoFactorProviders = this.twoFactorService.getSupportedProviders(null);
        if (twoFactorProviders.length === 0) {
          return Response.badRequest("No providers available for this client.");
        }

        if (twoFactorMethod != null) {
          try {
            selectedProvider = twoFactorProviders.filter((p) => p.type === twoFactorMethod)[0];
          } catch (e) {
            return Response.error("Invalid two-step login method.");
          }
        }

        if (selectedProvider == null) {
          if (twoFactorProviders.length === 1) {
            selectedProvider = twoFactorProviders[0];
          } else if (this.canInteract) {
            const twoFactorOptions: (string | Separator)[] = twoFactorProviders.map((p) => p.name);
            twoFactorOptions.push(new inquirer.Separator());
            twoFactorOptions.push("Cancel");
            const answer: inquirer.Answers = await inquirer.createPromptModule({
              output: process.stderr,
            })({
              type: "list",
              name: "method",
              message: "Two-step login method:",
              choices: twoFactorOptions,
            });
            const i = twoFactorOptions.indexOf(answer.method);
            if (i === twoFactorOptions.length - 1) {
              return Response.error("Login failed.");
            }
            selectedProvider = twoFactorProviders[i];
          }
          if (selectedProvider == null) {
            return Response.error("Login failed. No provider selected.");
          }
        }

        if (
          twoFactorToken == null &&
          response.twoFactorProviders.size > 1 &&
          selectedProvider.type === TwoFactorProviderType.Email
        ) {
          const emailReq = new TwoFactorEmailRequest();
          emailReq.email = this.authService.email;
          emailReq.masterPasswordHash = this.authService.masterPasswordHash;
          await this.apiService.postTwoFactorEmail(emailReq);
        }

        if (twoFactorToken == null) {
          if (this.canInteract) {
            const answer: inquirer.Answers = await inquirer.createPromptModule({
              output: process.stderr,
            })({
              type: "input",
              name: "token",
              message: "Two-step login code:",
            });
            twoFactorToken = answer.token;
          }
          if (twoFactorToken == null || twoFactorToken === "") {
            return Response.badRequest("Code is required.");
          }
        }

        response = await this.authService.logInTwoFactor(
          new TokenTwoFactorRequest(selectedProvider.type, twoFactorToken),
          null
        );
      }

      if (response.captchaSiteKey) {
        const twoFactorRequest = new TokenTwoFactorRequest(selectedProvider.type, twoFactorToken);
        const handledResponse = await this.handleCaptchaRequired(twoFactorRequest);

        // Error Response
        if (handledResponse instanceof Response) {
          return handledResponse;
        } else {
          response = handledResponse;
        }
      }

      if (response.requiresTwoFactor) {
        return Response.error("Login failed.");
      }

      if (response.resetMasterPassword) {
        return Response.error(
          "In order to log in with SSO from the CLI, you must first log in" +
            " through the web vault to set your master password."
        );
      }

      // Handle updating passwords if NOT using an API Key for authentication
      if (response.forcePasswordReset && clientId == null && clientSecret == null) {
        if (
          response.forcePasswordResetOptions.reason ===
          ForceResetPasswordReason.AdminForcePasswordReset
        ) {
          return await this.updateTempPassword();
        } else if (
          response.forcePasswordResetOptions.reason ===
          ForceResetPasswordReason.WeakMasterPasswordOnLogin
        ) {
          return await this.updateWeakPassword(password, response.forcePasswordResetOptions.orgId);
        }
      }

      return await this.handleSuccessResponse();
    } catch (e) {
      return Response.error(e);
    }
  }

  private async validatedParams() {
    const key = await this.cryptoFunctionService.randomBytes(64);
    process.env.BW_SESSION = Utils.fromBufferToB64(key);
  }

  private async handleSuccessResponse(): Promise<Response> {
    await this.syncService.fullSync(true);

    const usesKeyConnector = await this.keyConnectorService.getUsesKeyConnector();

    if (
      (this.options.sso != null || this.options.apikey != null) &&
      this.canInteract &&
      !usesKeyConnector
    ) {
      const res = new MessageResponse(
        "You are logged in!",
        "\n" + "To unlock your vault, use the `unlock` command. ex:\n" + "$ bw unlock"
      );
      return Response.success(res);
    }

    const res = new MessageResponse(
      "You are logged in!",
      "\n" +
        "To unlock your vault, set your session key to the `BW_SESSION` environment variable. ex:\n" +
        '$ export BW_SESSION="' +
        process.env.BW_SESSION +
        '"\n' +
        '> $env:BW_SESSION="' +
        process.env.BW_SESSION +
        '"\n\n' +
        "You can also pass the session key to any command with the `--session` option. ex:\n" +
        "$ bw list items --session " +
        process.env.BW_SESSION
    );
    res.raw = process.env.BW_SESSION;
    return Response.success(res);
  }

  private async handleUpdatePasswordSuccessResponse(): Promise<Response> {
    await this.logoutCallback();
    this.authService.logOut(() => {
      /* Do nothing */
    });

    // TODO: Run this by product to adjust language if necessary
    const res = new MessageResponse(
      "Your master password has been updated!",
      "\n" + "You have been logged out and must log in again to access the vault."
    );

    return Response.success(res);
  }

  private async updateWeakPassword(currentPassword: string, orgId: string) {
    // Force a sync so we have access to organization details
    await this.syncService.fullSync(true);

    const requestingOrg = this.orgService.get(orgId);

    // If no interaction available, alert user to use web vault
    if (!this.canInteract) {
      await this.logoutCallback();
      this.authService.logOut(() => {
        /* Do nothing */
      });
      return Response.error(
        new MessageResponse(
          `Your master password does not meet the policy requirements of ${requestingOrg.name}. In order to access the vault, you must update your master password now via the web vault. You have been logged out.`,
          null
        )
      );
    }

    try {
      const { newPasswordHash, newEncKey, hint } = await this.collectNewMasterPasswordDetails(
        `Your master password does not meet the policy requirements of ${requestingOrg.name}. In order to access the vault, you must update your master password now.`
      );

      const request = new PasswordRequest();
      request.masterPasswordHash = await this.cryptoService.hashPassword(currentPassword, null);
      request.masterPasswordHint = hint;
      request.newMasterPasswordHash = newPasswordHash;
      request.key = newEncKey[1].encryptedString;

      await this.apiService.postPassword(request);

      return await this.handleUpdatePasswordSuccessResponse();
    } catch (e) {
      await this.logoutCallback();
      this.authService.logOut(() => {
        /* Do nothing */
      });
      return Response.error(e);
    }
  }

  private async updateTempPassword() {
    // If no interaction available, alert user to use web vault
    if (!this.canInteract) {
      await this.logoutCallback();
      this.authService.logOut(() => {
        /* Do nothing */
      });
      return Response.error(
        new MessageResponse(
          "An organization administrator recently changed your master password. In order to access the vault, you must update your master password now via the web vault. You have been logged out.",
          null
        )
      );
    }

    try {
      const { newPasswordHash, newEncKey, hint } = await this.collectNewMasterPasswordDetails(
        "An organization administrator recently changed your master password. In order to access the vault, you must update your master password now."
      );

      const request = new UpdateTempPasswordRequest();
      request.key = newEncKey[1].encryptedString;
      request.newMasterPasswordHash = newPasswordHash;
      request.masterPasswordHint = hint;

      await this.apiService.putUpdateTempPassword(request);

      return await this.handleUpdatePasswordSuccessResponse();
    } catch (e) {
      await this.logoutCallback();
      this.authService.logOut(() => {
        /* Do nothing */
      });
      return Response.error(e);
    }
  }

  /**
   * Collect new master password and hint from the CLI. The collected password
   * is validated against any applicable master password policies and a new encryption
   * key is generated
   * @param prompt - Message that is displayed during the initial prompt
   * @param error
   */
  private async collectNewMasterPasswordDetails(
    prompt: string,
    error?: string
  ): Promise<{
    newPasswordHash: string;
    newEncKey: [SymmetricCryptoKey, EncString];
    hint?: string;
  }> {
    if (this.email == null || this.email === "undefined") {
      this.email = await this.stateService.getEmail();
    }

    // Get New Master Password
    const baseMessage = `${prompt}\n` + "Master password: ";
    const firstMessage = error != null ? error + baseMessage : baseMessage;
    const mp: inquirer.Answers = await inquirer.createPromptModule({ output: process.stderr })({
      type: "password",
      name: "password",
      message: firstMessage,
    });
    const masterPassword = mp.password;

    // Master Password Validation
    if (masterPassword == null || masterPassword === "") {
      return this.collectNewMasterPasswordDetails(prompt, "Master password is required.\n");
    }

    if (masterPassword.length < Utils.minimumPasswordLength) {
      return this.collectNewMasterPasswordDetails(
        prompt,
        `Master password must be at least ${Utils.minimumPasswordLength} characters long.\n`
      );
    }

    // Strength & Policy Validation
    const strengthResult = this.passwordGenerationService.passwordStrength(
      masterPassword,
      this.getPasswordStrengthUserInput()
    );

    // Get New Master Password Re-type
    const reTypeMessage = "Re-type New Master password (Strength: " + strengthResult.score + ")";
    const retype: inquirer.Answers = await inquirer.createPromptModule({ output: process.stderr })({
      type: "password",
      name: "password",
      message: reTypeMessage,
    });
    const masterPasswordRetype = retype.password;

    // Re-type Validation
    if (masterPassword !== masterPasswordRetype) {
      return this.collectNewMasterPasswordDetails(
        prompt,
        "Master password confirmation does not match.\n"
      );
    }

    // Get Hint (optional)
    const hint: inquirer.Answers = await inquirer.createPromptModule({ output: process.stderr })({
      type: "input",
      name: "input",
      message: "Master Password Hint (optional):",
    });
    const masterPasswordHint = hint.input;

    // Ensure master password policies are loaded
    if (this.masterPasswordPolicies == undefined) {
      await this.loadMasterPasswordPolicies();
    }

    const enforcedPolicyOptions = await firstValueFrom(
      this.policyService.masterPasswordPolicyOptions$(this.masterPasswordPolicies)
    );

    // Verify master password meets policy requirements
    if (
      enforcedPolicyOptions != null &&
      !this.policyService.evaluateMasterPassword(
        strengthResult.score,
        masterPassword,
        enforcedPolicyOptions
      )
    ) {
      return this.collectNewMasterPasswordDetails(
        prompt,
        "Your new master password does not meet the policy requirements.\n"
      );
    }
    const kdf = await this.stateService.getKdfType();
    const kdfConfig = await this.stateService.getKdfConfig();

    // Create new key and hash new password
    const newKey = await this.cryptoService.makeKey(
      masterPassword,
      this.email.trim().toLowerCase(),
      kdf,
      kdfConfig
    );
    const newPasswordHash = await this.cryptoService.hashPassword(masterPassword, newKey);

    // Grab user's current enc key
    const userEncKey = await this.cryptoService.getEncKey();

    // Create new encKey for the User
    const newEncKey = await this.cryptoService.remakeEncKey(newKey, userEncKey);

    return { newPasswordHash, newEncKey, hint: masterPasswordHint };
  }

  private async handleCaptchaRequired(
    twoFactorRequest: TokenTwoFactorRequest,
    credentials: PasswordLogInCredentials = null
  ): Promise<AuthResult | Response> {
    const badCaptcha = Response.badRequest(
      "Your authentication request has been flagged and will require user interaction to proceed.\n" +
        "Please use your API key to validate this request and ensure BW_CLIENTSECRET is correct, if set.\n" +
        "(https://bitwarden.com/help/cli-auth-challenges)"
    );

    try {
      const captchaClientSecret = await this.apiClientSecret(true);
      if (Utils.isNullOrWhitespace(captchaClientSecret)) {
        return badCaptcha;
      }

      let authResultResponse: AuthResult = null;
      if (credentials != null) {
        credentials.captchaToken = captchaClientSecret;
        credentials.twoFactor = twoFactorRequest;
        authResultResponse = await this.authService.logIn(credentials);
      } else {
        authResultResponse = await this.authService.logInTwoFactor(
          twoFactorRequest,
          captchaClientSecret
        );
      }

      return authResultResponse;
    } catch (e) {
      if (
        e instanceof ErrorResponse ||
        (e.constructor.name === ErrorResponse.name &&
          (e as ErrorResponse).message.includes("Captcha is invalid"))
      ) {
        return badCaptcha;
      } else {
        return Response.error(e);
      }
    }
  }

  private getPasswordStrengthUserInput() {
    let userInput: string[] = [];
    const atPosition = this.email.indexOf("@");
    if (atPosition > -1) {
      userInput = userInput.concat(
        this.email
          .substr(0, atPosition)
          .trim()
          .toLowerCase()
          .split(/[^A-Za-z0-9]/)
      );
    }
    return userInput;
  }

  private async apiClientId(): Promise<string> {
    let clientId: string = null;

    const storedClientId: string = process.env.BW_CLIENTID;
    if (storedClientId == null) {
      if (this.canInteract) {
        const answer: inquirer.Answers = await inquirer.createPromptModule({
          output: process.stderr,
        })({
          type: "input",
          name: "clientId",
          message: "client_id:",
        });
        clientId = answer.clientId;
      } else {
        clientId = null;
      }
    } else {
      clientId = storedClientId;
    }

    return clientId;
  }

  private async apiClientSecret(isAdditionalAuthentication = false): Promise<string> {
    const additionalAuthenticationMessage = "Additional authentication required.\nAPI key ";
    let clientSecret: string = null;

    const storedClientSecret: string = this.clientSecret || process.env.BW_CLIENTSECRET;
    if (this.canInteract && storedClientSecret == null) {
      const answer: inquirer.Answers = await inquirer.createPromptModule({
        output: process.stderr,
      })({
        type: "input",
        name: "clientSecret",
        message:
          (isAdditionalAuthentication ? additionalAuthenticationMessage : "") + "client_secret:",
      });
      clientSecret = answer.clientSecret;
    } else {
      clientSecret = storedClientSecret;
    }

    return clientSecret;
  }

  private async apiIdentifiers(): Promise<{ clientId: string; clientSecret: string }> {
    return {
      clientId: await this.apiClientId(),
      clientSecret: await this.apiClientSecret(),
    };
  }

  private async openSsoPrompt(
    codeChallenge: string,
    state: string
  ): Promise<{ ssoCode: string; orgIdentifier: string }> {
    return new Promise((resolve, reject) => {
      const callbackServer = http.createServer((req, res) => {
        const urlString = "http://localhost" + req.url;
        const url = new URL(urlString);
        const code = url.searchParams.get("code");
        const receivedState = url.searchParams.get("state");
        const orgIdentifier = this.getOrgIdentifierFromState(receivedState);
        res.setHeader("Content-Type", "text/html");
        if (code != null && receivedState != null && this.checkState(receivedState, state)) {
          res.writeHead(200);
          res.end(
            "<html><head><title>Success | Bitwarden CLI</title></head><body>" +
              "<h1>Successfully authenticated with the Bitwarden CLI</h1>" +
              "<p>You may now close this tab and return to the terminal.</p>" +
              "</body></html>"
          );
          callbackServer.close(() =>
            resolve({
              ssoCode: code,
              orgIdentifier: orgIdentifier,
            })
          );
        } else {
          res.writeHead(400);
          res.end(
            "<html><head><title>Failed | Bitwarden CLI</title></head><body>" +
              "<h1>Something went wrong logging into the Bitwarden CLI</h1>" +
              "<p>You may now close this tab and return to the terminal.</p>" +
              "</body></html>"
          );
          callbackServer.close(() => reject());
        }
      });
      let foundPort = false;
      const webUrl = this.environmentService.getWebVaultUrl();
      for (let port = 8065; port <= 8070; port++) {
        try {
          this.ssoRedirectUri = "http://localhost:" + port;
          callbackServer.listen(port, () => {
            this.platformUtilsService.launchUri(
              webUrl +
                "/#/sso?clientId=" +
                "cli" +
                "&redirectUri=" +
                encodeURIComponent(this.ssoRedirectUri) +
                "&state=" +
                state +
                "&codeChallenge=" +
                codeChallenge
            );
          });
          foundPort = true;
          break;
        } catch {
          // Ignore error since we run the same command up to 5 times.
        }
      }
      if (!foundPort) {
        reject();
      }
    });
  }

  private getOrgIdentifierFromState(state: string): string {
    if (state === null || state === undefined) {
      return null;
    }

    const stateSplit = state.split("_identifier=");
    return stateSplit.length > 1 ? stateSplit[1] : null;
  }

  private checkState(state: string, checkState: string): boolean {
    if (state === null || state === undefined) {
      return false;
    }
    if (checkState === null || checkState === undefined) {
      return false;
    }

    const stateSplit = state.split("_identifier=");
    const checkStateSplit = checkState.split("_identifier=");
    return stateSplit[0] === checkStateSplit[0];
  }

  private async loadMasterPasswordPolicies(): Promise<void> {
    const policiesResponse = await this.policyApiService.getAllPolicies();

    if (policiesResponse == null || policiesResponse.data.length === 0) {
      this.masterPasswordPolicies = [];
      return;
    }

    // We only care about enabled master password policies
    this.masterPasswordPolicies = this.policyService
      .mapPoliciesFromToken(policiesResponse)
      .filter((p) => p.type === PolicyType.MasterPassword && p.enabled);
  }
}
