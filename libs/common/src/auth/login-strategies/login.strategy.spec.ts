import { mock, MockProxy } from "jest-mock-extended";

import { ApiService } from "../../abstractions/api.service";
import { AppIdService } from "../../abstractions/appId.service";
import { CryptoService } from "../../abstractions/crypto.service";
import { LogService } from "../../abstractions/log.service";
import { MessagingService } from "../../abstractions/messaging.service";
import { PasswordGenerationService } from "../../abstractions/passwordGeneration.service";
import { PlatformUtilsService } from "../../abstractions/platformUtils.service";
import { PolicyService } from "../../abstractions/policy/policy.service.abstraction";
import { StateService } from "../../abstractions/state.service";
import { Utils } from "../../misc/utils";
import { Account, AccountProfile, AccountTokens } from "../../models/domain/account";
import { EncString } from "../../models/domain/enc-string";
import { AuthService } from "../abstractions/auth.service";
import { TokenService } from "../abstractions/token.service";
import { TwoFactorService } from "../abstractions/two-factor.service";
import { TwoFactorProviderType } from "../enums/two-factor-provider-type";
import { AuthResult } from "../models/domain/auth-result";
import { PasswordLogInCredentials } from "../models/domain/log-in-credentials";
import { PasswordTokenRequest } from "../models/request/identity-token/password-token.request";
import { TokenTwoFactorRequest } from "../models/request/identity-token/token-two-factor.request";
import { IdentityCaptchaResponse } from "../models/response/identity-captcha.response";
import { IdentityTokenResponse } from "../models/response/identity-token.response";
import { IdentityTwoFactorResponse } from "../models/response/identity-two-factor.response";

import { PasswordLogInStrategy } from "./password-login.strategy";

const email = "hello@world.com";
const masterPassword = "password";

const deviceId = Utils.newGuid();
const accessToken = "ACCESS_TOKEN";
const refreshToken = "REFRESH_TOKEN";
const encKey = "ENC_KEY";
const privateKey = "PRIVATE_KEY";
const captchaSiteKey = "CAPTCHA_SITE_KEY";
const kdf = 0;
const kdfIterations = 10000;
const userId = Utils.newGuid();
const masterPasswordHash = "MASTER_PASSWORD_HASH";
const name = "NAME";

const decodedToken = {
  sub: userId,
  name: name,
  email: email,
  premium: false,
};

const twoFactorProviderType = TwoFactorProviderType.Authenticator;
const twoFactorToken = "TWO_FACTOR_TOKEN";
const twoFactorRemember = true;

export function identityTokenResponseFactory() {
  return new IdentityTokenResponse({
    ForcePasswordReset: false,
    Kdf: kdf,
    KdfIterations: kdfIterations,
    Key: encKey,
    PrivateKey: privateKey,
    ResetMasterPassword: false,
    access_token: accessToken,
    expires_in: 3600,
    refresh_token: refreshToken,
    scope: "api offline_access",
    token_type: "Bearer",
  });
}

describe("LogInStrategy", () => {
  let cryptoService: MockProxy<CryptoService>;
  let apiService: MockProxy<ApiService>;
  let tokenService: MockProxy<TokenService>;
  let appIdService: MockProxy<AppIdService>;
  let platformUtilsService: MockProxy<PlatformUtilsService>;
  let messagingService: MockProxy<MessagingService>;
  let logService: MockProxy<LogService>;
  let stateService: MockProxy<StateService>;
  let twoFactorService: MockProxy<TwoFactorService>;
  let authService: MockProxy<AuthService>;
  let policyService: MockProxy<PolicyService>;
  let passwordGenerationService: MockProxy<PasswordGenerationService>;

  let passwordLogInStrategy: PasswordLogInStrategy;
  let credentials: PasswordLogInCredentials;

  beforeEach(async () => {
    cryptoService = mock<CryptoService>();
    apiService = mock<ApiService>();
    tokenService = mock<TokenService>();
    appIdService = mock<AppIdService>();
    platformUtilsService = mock<PlatformUtilsService>();
    messagingService = mock<MessagingService>();
    logService = mock<LogService>();
    stateService = mock<StateService>();
    twoFactorService = mock<TwoFactorService>();
    authService = mock<AuthService>();
    policyService = mock<PolicyService>();
    passwordGenerationService = mock<PasswordGenerationService>();

    appIdService.getAppId.mockResolvedValue(deviceId);
    tokenService.decodeToken.calledWith(accessToken).mockResolvedValue(decodedToken);

    // The base class is abstract so we test it via PasswordLogInStrategy
    passwordLogInStrategy = new PasswordLogInStrategy(
      cryptoService,
      apiService,
      tokenService,
      appIdService,
      platformUtilsService,
      messagingService,
      logService,
      stateService,
      twoFactorService,
      passwordGenerationService,
      policyService,
      authService
    );
    credentials = new PasswordLogInCredentials(email, masterPassword);
  });

  describe("base class", () => {
    it("sets the local environment after a successful login", async () => {
      apiService.postIdentityToken.mockResolvedValue(identityTokenResponseFactory());

      await passwordLogInStrategy.logIn(credentials);

      expect(stateService.addAccount).toHaveBeenCalledWith(
        new Account({
          profile: {
            ...new AccountProfile(),
            ...{
              userId: userId,
              name: name,
              email: email,
              hasPremiumPersonally: false,
              kdfIterations: kdfIterations,
              kdfType: kdf,
            },
          },
          tokens: {
            ...new AccountTokens(),
            ...{
              accessToken: accessToken,
              refreshToken: refreshToken,
            },
          },
        })
      );
      expect(cryptoService.setEncKey).toHaveBeenCalledWith(encKey);
      expect(cryptoService.setEncPrivateKey).toHaveBeenCalledWith(privateKey);
      expect(messagingService.send).toHaveBeenCalledWith("loggedIn");
    });

    it("builds AuthResult", async () => {
      const tokenResponse = identityTokenResponseFactory();
      tokenResponse.forcePasswordReset = true;
      tokenResponse.resetMasterPassword = true;

      apiService.postIdentityToken.mockResolvedValue(tokenResponse);

      const result = await passwordLogInStrategy.logIn(credentials);

      expect(result).toEqual({
        forcePasswordReset: true,
        resetMasterPassword: true,
        twoFactorProviders: null,
        captchaSiteKey: "",
      } as AuthResult);
    });

    it("rejects login if CAPTCHA is required", async () => {
      // Sample CAPTCHA response
      const tokenResponse = new IdentityCaptchaResponse({
        error: "invalid_grant",
        error_description: "Captcha required.",
        HCaptcha_SiteKey: captchaSiteKey,
      });

      apiService.postIdentityToken.mockResolvedValue(tokenResponse);

      const result = await passwordLogInStrategy.logIn(credentials);

      expect(stateService.addAccount).not.toHaveBeenCalled();
      expect(messagingService.send).not.toHaveBeenCalled();

      const expected = new AuthResult();
      expected.captchaSiteKey = captchaSiteKey;
      expect(result).toEqual(expected);
    });

    it("makes a new public and private key for an old account", async () => {
      const tokenResponse = identityTokenResponseFactory();
      tokenResponse.privateKey = null;
      cryptoService.makeKeyPair.mockResolvedValue(["PUBLIC_KEY", new EncString("PRIVATE_KEY")]);

      apiService.postIdentityToken.mockResolvedValue(tokenResponse);

      await passwordLogInStrategy.logIn(credentials);

      // User key must be set before the new RSA keypair is generated, otherwise we can't decrypt the EncKey
      expect(cryptoService.setKey).toHaveBeenCalled();
      expect(cryptoService.makeKeyPair).toHaveBeenCalled();
      expect(cryptoService.setKey.mock.invocationCallOrder[0]).toBeLessThan(
        cryptoService.makeKeyPair.mock.invocationCallOrder[0]
      );

      expect(apiService.postAccountKeys).toHaveBeenCalled();
    });
  });

  describe("Two-factor authentication", () => {
    it("rejects login if 2FA is required", async () => {
      // Sample response where TOTP 2FA required
      const tokenResponse = new IdentityTwoFactorResponse({
        TwoFactorProviders: ["0"],
        TwoFactorProviders2: { 0: null },
        error: "invalid_grant",
        error_description: "Two factor required.",
      });

      apiService.postIdentityToken.mockResolvedValue(tokenResponse);

      const result = await passwordLogInStrategy.logIn(credentials);

      expect(stateService.addAccount).not.toHaveBeenCalled();
      expect(messagingService.send).not.toHaveBeenCalled();

      const expected = new AuthResult();
      expected.twoFactorProviders = new Map<TwoFactorProviderType, { [key: string]: string }>();
      expected.twoFactorProviders.set(0, null);
      expect(result).toEqual(expected);
    });

    it("sends stored 2FA token to server", async () => {
      tokenService.getTwoFactorToken.mockResolvedValue(twoFactorToken);
      apiService.postIdentityToken.mockResolvedValue(identityTokenResponseFactory());

      await passwordLogInStrategy.logIn(credentials);

      expect(apiService.postIdentityToken).toHaveBeenCalledWith(
        expect.objectContaining({
          twoFactor: {
            provider: TwoFactorProviderType.Remember,
            token: twoFactorToken,
            remember: false,
          } as TokenTwoFactorRequest,
        })
      );
    });

    it("sends 2FA token provided by user to server (single step)", async () => {
      // This occurs if the user enters the 2FA code as an argument in the CLI
      apiService.postIdentityToken.mockResolvedValue(identityTokenResponseFactory());
      credentials.twoFactor = new TokenTwoFactorRequest(
        twoFactorProviderType,
        twoFactorToken,
        twoFactorRemember
      );

      await passwordLogInStrategy.logIn(credentials);

      expect(apiService.postIdentityToken).toHaveBeenCalledWith(
        expect.objectContaining({
          twoFactor: {
            provider: twoFactorProviderType,
            token: twoFactorToken,
            remember: twoFactorRemember,
          } as TokenTwoFactorRequest,
        })
      );
    });

    it("sends 2FA token provided by user to server (two-step)", async () => {
      // Simulate a partially completed login
      passwordLogInStrategy.tokenRequest = new PasswordTokenRequest(
        email,
        masterPasswordHash,
        null,
        null
      );

      apiService.postIdentityToken.mockResolvedValue(identityTokenResponseFactory());

      await passwordLogInStrategy.logInTwoFactor(
        new TokenTwoFactorRequest(twoFactorProviderType, twoFactorToken, twoFactorRemember),
        null
      );

      expect(apiService.postIdentityToken).toHaveBeenCalledWith(
        expect.objectContaining({
          twoFactor: {
            provider: twoFactorProviderType,
            token: twoFactorToken,
            remember: twoFactorRemember,
          } as TokenTwoFactorRequest,
        })
      );
    });
  });
});
