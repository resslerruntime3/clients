import { BaseResponse } from "../../../models/response/base.response";
import { PolicyResponse } from "../../../models/response/policy.response";
import { TwoFactorProviderType } from "../../enums/two-factor-provider-type";

export class IdentityTwoFactorResponse extends BaseResponse {
  twoFactorProviders: TwoFactorProviderType[];
  twoFactorProviders2 = new Map<TwoFactorProviderType, { [key: string]: string }>();
  captchaToken: string;
  masterPasswordPolicies: PolicyResponse[];

  constructor(response: any) {
    super(response);
    this.captchaToken = this.getResponseProperty("CaptchaBypassToken");
    this.twoFactorProviders = this.getResponseProperty("TwoFactorProviders");
    const twoFactorProviders2 = this.getResponseProperty("TwoFactorProviders2");
    if (twoFactorProviders2 != null) {
      for (const prop in twoFactorProviders2) {
        // eslint-disable-next-line
        if (twoFactorProviders2.hasOwnProperty(prop)) {
          this.twoFactorProviders2.set(parseInt(prop, null), twoFactorProviders2[prop]);
        }
      }
    }
    const masterPasswordPolicies = this.getResponseProperty("MasterPasswordPolicies");
    this.masterPasswordPolicies =
      masterPasswordPolicies == null
        ? []
        : masterPasswordPolicies.map((dr: any) => new PolicyResponse(dr));
  }
}
