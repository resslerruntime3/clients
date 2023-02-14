import { Component, OnInit } from "@angular/core";
import { FormBuilder, FormControl } from "@angular/forms";
import { map, Observable, Subject, takeUntil, tap } from "rxjs";

import { AbstractThemingService } from "@bitwarden/angular/services/theming/theming.service.abstraction";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { PolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { VaultTimeoutSettingsService } from "@bitwarden/common/abstractions/vaultTimeout/vaultTimeoutSettings.service";
import { PolicyType } from "@bitwarden/common/enums/policyType";
import { ThemeType } from "@bitwarden/common/enums/themeType";
import { Utils } from "@bitwarden/common/misc/utils";

@Component({
  selector: "app-preferences",
  templateUrl: "preferences.component.html",
})
export class PreferencesComponent implements OnInit {
  vaultTimeoutPolicyCallout: Observable<{
    timeout: { hours: number; minutes: number };
    action: "lock" | "logOut";
  }>;
  vaultTimeoutOptions: { name: string; value: number }[];
  localeOptions: any[];
  themeOptions: any[];

  private startingLocale: string;
  private startingTheme: ThemeType;
  private destroy$ = new Subject<void>();

  form = this.formBuilder.group({
    vaultTimeout: new FormControl<number>(null),
    vaultTimeoutAction: new FormControl<string>("lock"),
    enableFavicons: new FormControl<boolean>(true),
    enableFullWidth: new FormControl<boolean>(false),
    theme: new FormControl<ThemeType>(ThemeType.Light),
    locale: new FormControl<string>(null),
  });

  constructor(
    private formBuilder: FormBuilder,
    private policyService: PolicyService,
    private stateService: StateService,
    private i18nService: I18nService,
    private vaultTimeoutSettingsService: VaultTimeoutSettingsService,
    private platformUtilsService: PlatformUtilsService,
    private messagingService: MessagingService,
    private themingService: AbstractThemingService
  ) {
    this.vaultTimeoutOptions = [
      { name: i18nService.t("oneMinute"), value: 1 },
      { name: i18nService.t("fiveMinutes"), value: 5 },
      { name: i18nService.t("fifteenMinutes"), value: 15 },
      { name: i18nService.t("thirtyMinutes"), value: 30 },
      { name: i18nService.t("oneHour"), value: 60 },
      { name: i18nService.t("fourHours"), value: 240 },
      { name: i18nService.t("onRefresh"), value: -1 },
    ];
    if (this.platformUtilsService.isDev()) {
      this.vaultTimeoutOptions.push({ name: i18nService.t("never"), value: null });
    }

    const localeOptions: any[] = [];
    i18nService.supportedTranslationLocales.forEach((locale) => {
      let name = locale;
      if (i18nService.localeNames.has(locale)) {
        name += " - " + i18nService.localeNames.get(locale);
      }
      localeOptions.push({ name: name, value: locale });
    });
    localeOptions.sort(Utils.getSortFunction(i18nService, "name"));
    localeOptions.splice(0, 0, { name: i18nService.t("default"), value: null });
    this.localeOptions = localeOptions;
    this.themeOptions = [
      { name: i18nService.t("themeLight"), value: ThemeType.Light },
      { name: i18nService.t("themeDark"), value: ThemeType.Dark },
      { name: i18nService.t("themeSystem"), value: ThemeType.System },
    ];
  }

  async ngOnInit() {
    this.vaultTimeoutPolicyCallout = this.policyService.get$(PolicyType.MaximumVaultTimeout).pipe(
      map((policy) => {
        if (!policy) {
          return null;
        }
        let timeout;
        if (policy.data?.minutes) {
          timeout = {
            hours: Math.floor(policy.data.minutes / 60),
            minutes: policy.data.minutes % 60,
          };
        }
        if (policy.data?.action) {
          this.form.controls.vaultTimeoutAction.disable({ emitEvent: false });
        } else {
          this.form.controls.vaultTimeoutAction.enable({ emitEvent: false });
        }
        return { timeout: timeout, action: policy.data?.action };
      })
    );

    this.form.controls.vaultTimeoutAction.valueChanges
      .pipe(
        tap(async (action) => {
          if (action === "logOut") {
            const confirmed = await this.platformUtilsService.showDialog(
              this.i18nService.t("vaultTimeoutLogOutConfirmation"),
              this.i18nService.t("vaultTimeoutLogOutConfirmationTitle"),
              this.i18nService.t("yes"),
              this.i18nService.t("cancel"),
              "warning"
            );
            if (!confirmed) {
              this.form.controls.vaultTimeoutAction.patchValue("lock", { emitEvent: false });
              return;
            }
          }
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();

    const initialFormValues = {
      vaultTimeout: await this.vaultTimeoutSettingsService.getVaultTimeout(),
      vaultTimeoutAction: await this.vaultTimeoutSettingsService.getVaultTimeoutAction(),
      enableFavicons: !(await this.stateService.getDisableFavicon()),
      enableFullWidth: await this.stateService.getEnableFullWidth(),
      theme: await this.stateService.getTheme(),
      locale: (await this.stateService.getLocale()) ?? null,
    };
    this.startingLocale = initialFormValues.locale;
    this.startingTheme = initialFormValues.theme;
    this.form.setValue(initialFormValues, { emitEvent: false });
  }

  async submit() {
    if (!this.form.controls.vaultTimeout.valid) {
      this.platformUtilsService.showToast(
        "error",
        null,
        this.i18nService.t("vaultTimeoutRangeError")
      );
      return;
    }
    const values = this.form.value;

    await this.vaultTimeoutSettingsService.setVaultTimeoutOptions(
      values.vaultTimeout,
      values.vaultTimeoutAction
    );
    await this.stateService.setDisableFavicon(!values.enableFavicons);
    await this.stateService.setEnableFullWidth(values.enableFullWidth);
    this.messagingService.send("setFullWidth");
    if (values.theme !== this.startingTheme) {
      await this.themingService.updateConfiguredTheme(values.theme);
      this.startingTheme = values.theme;
    }
    await this.stateService.setLocale(values.locale);
    if (values.locale !== this.startingLocale) {
      window.location.reload();
    } else {
      this.platformUtilsService.showToast(
        "success",
        null,
        this.i18nService.t("preferencesUpdated")
      );
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
