import { Component, NgZone, OnDestroy, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { Subject, takeUntil } from "rxjs";
import { first } from "rxjs/operators";

import { LoginComponent as BaseLoginComponent } from "@bitwarden/angular/auth/components/login.component";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AppIdService } from "@bitwarden/common/abstractions/appId.service";
import { CryptoFunctionService } from "@bitwarden/common/abstractions/cryptoFunction.service";
import { EnvironmentService } from "@bitwarden/common/abstractions/environment.service";
import { FormValidationErrorsService } from "@bitwarden/common/abstractions/formValidationErrors.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { PasswordGenerationService } from "@bitwarden/common/abstractions/passwordGeneration.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { PolicyApiServiceAbstraction } from "@bitwarden/common/abstractions/policy/policy-api.service.abstraction";
import { InternalPolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { LoginService } from "@bitwarden/common/auth/abstractions/login.service";
import { MasterPasswordPolicyOptions } from "@bitwarden/common/models/domain/master-password-policy-options";
import { Policy } from "@bitwarden/common/models/domain/policy";
import { ListResponse } from "@bitwarden/common/models/response/list.response";
import { PolicyResponse } from "@bitwarden/common/models/response/policy.response";

import { RouterService, StateService } from "../../app/core";
import { flagEnabled } from "../../utils/flags";

@Component({
  selector: "app-login",
  templateUrl: "login.component.html",
})
export class LoginComponent extends BaseLoginComponent implements OnInit, OnDestroy {
  showResetPasswordAutoEnrollWarning = false;
  enforcedPasswordPolicyOptions: MasterPasswordPolicyOptions;
  policies: ListResponse<PolicyResponse>;
  showPasswordless = false;

  private destroy$ = new Subject<void>();

  constructor(
    apiService: ApiService,
    appIdService: AppIdService,
    authService: AuthService,
    router: Router,
    i18nService: I18nService,
    route: ActivatedRoute,
    platformUtilsService: PlatformUtilsService,
    environmentService: EnvironmentService,
    passwordGenerationService: PasswordGenerationService,
    cryptoFunctionService: CryptoFunctionService,
    protected policyApiService: PolicyApiServiceAbstraction,
    protected policyService: InternalPolicyService,
    logService: LogService,
    ngZone: NgZone,
    protected stateService: StateService,
    private messagingService: MessagingService,
    private routerService: RouterService,
    formBuilder: FormBuilder,
    formValidationErrorService: FormValidationErrorsService,
    loginService: LoginService
  ) {
    super(
      apiService,
      appIdService,
      authService,
      router,
      platformUtilsService,
      i18nService,
      stateService,
      environmentService,
      passwordGenerationService,
      cryptoFunctionService,
      logService,
      ngZone,
      formBuilder,
      formValidationErrorService,
      route,
      loginService,
      policyService,
      policyApiService
    );
    this.onSuccessfulLogin = async () => {
      this.messagingService.send("setFullWidth");
    };
    this.onSuccessfulLoginNavigate = this.goAfterLogIn;
    this.showPasswordless = flagEnabled("showPasswordless");
  }

  async ngOnInit() {
    // eslint-disable-next-line rxjs-angular/prefer-takeuntil, rxjs/no-async-subscribe
    this.route.queryParams.pipe(first()).subscribe(async (qParams) => {
      if (qParams.premium != null) {
        this.routerService.setPreviousUrl("/settings/premium");
      } else if (qParams.org != null) {
        const route = this.router.createUrlTree(["create-organization"], {
          queryParams: { plan: qParams.org },
        });
        this.routerService.setPreviousUrl(route.toString());
      }

      // Are they coming from an email for sponsoring a families organization
      if (qParams.sponsorshipToken != null) {
        const route = this.router.createUrlTree(["setup/families-for-enterprise"], {
          queryParams: { token: qParams.sponsorshipToken },
        });
        this.routerService.setPreviousUrl(route.toString());
      }
      await super.ngOnInit();
    });

    const invite = await this.stateService.getOrganizationInvitation();
    if (invite != null) {
      let policyList: Policy[] = null;
      try {
        this.policies = await this.policyApiService.getPoliciesByToken(
          invite.organizationId,
          invite.token,
          invite.email,
          invite.organizationUserId
        );
        policyList = this.policyService.mapPoliciesFromToken(this.policies);
      } catch (e) {
        this.logService.error(e);
      }

      if (policyList != null) {
        const resetPasswordPolicy = this.policyService.getResetPasswordPolicyOptions(
          policyList,
          invite.organizationId
        );
        // Set to true if policy enabled and auto-enroll enabled
        this.showResetPasswordAutoEnrollWarning =
          resetPasswordPolicy[1] && resetPasswordPolicy[0].autoEnrollEnabled;

        this.policyService
          .masterPasswordPolicyOptions$(policyList)
          .pipe(takeUntil(this.destroy$))
          .subscribe((enforcedPasswordPolicyOptions) => {
            this.enforcedPasswordPolicyOptions = enforcedPasswordPolicyOptions;
          });
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async goAfterLogIn() {
    const masterPassword = this.formGroup.value.masterPassword;

    // Check master password against policy
    if (this.enforcedPasswordPolicyOptions != null) {
      const strengthResult = this.passwordGenerationService.passwordStrength(
        masterPassword,
        this.getPasswordStrengthUserInput()
      );
      const masterPasswordScore = strengthResult == null ? null : strengthResult.score;

      // If invalid, save policies and require update
      if (
        !this.policyService.evaluateMasterPassword(
          masterPasswordScore,
          masterPassword,
          this.enforcedPasswordPolicyOptions
        )
      ) {
        await this.savePolicies(this.policies);
        this.router.navigate(["update-password"]);
        return;
      }
    }

    const previousUrl = this.routerService.getPreviousUrl();
    if (previousUrl) {
      this.router.navigateByUrl(previousUrl);
    } else {
      this.loginService.clearValues();
      this.router.navigate([this.successRoute]);
    }
  }

  goToHint() {
    this.setFormValues();
    this.router.navigateByUrl("/hint");
  }

  goToRegister() {
    const email = this.formGroup.value.email;

    if (email) {
      this.router.navigate(["/register"], { queryParams: { email: email } });
      return;
    }

    this.router.navigate(["/register"]);
  }

  async submit() {
    const rememberEmail = this.formGroup.value.rememberEmail;

    if (!rememberEmail) {
      await this.stateService.setRememberedEmail(null);
    }
    await super.submit(false);
  }
}
