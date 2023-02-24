import { Component } from "@angular/core";
import { ActivatedRoute, Params, Router } from "@angular/router";

import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { OrganizationUserService } from "@bitwarden/common/abstractions/organization-user/organization-user.service";
import { OrganizationUserAcceptInitRequest } from "@bitwarden/common/abstractions/organization-user/requests";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { OrganizationKeysRequest } from "@bitwarden/common/models/request/organization-keys.request";

import { BaseAcceptComponent } from "../app/common/base.accept.component";

@Component({
  selector: "app-accept-init-organization",
  templateUrl: "accept-init-organization.component.html",
})
export class AcceptInitOrganizationComponent extends BaseAcceptComponent {
  orgName: string;

  protected requiredParameters: string[] = ["organizationId", "organizationUserId", "token"];

  constructor(
    router: Router,
    platformUtilsService: PlatformUtilsService,
    i18nService: I18nService,
    route: ActivatedRoute,
    stateService: StateService,
    private cryptoService: CryptoService,
    private organizationUserService: OrganizationUserService,
    private messagingService: MessagingService
  ) {
    super(router, platformUtilsService, i18nService, route, stateService);
  }

  async authedHandler(qParams: Params): Promise<void> {
    const needsReAuth = (await this.stateService.getOrganizationInvitation()) != null;
    if (!needsReAuth) {
      // Accepting an org invite requires authentication from a logged out state
      this.messagingService.send("logout", { redirect: false });
      await this.prepareOrganizationInvitation(qParams);
      return;
    }

    // User has already logged in and passed the Master Password policy check
    this.actionPromise = this.prepareAcceptRequest(qParams).then(async (request) => {
      await this.organizationUserService.postOrganizationUserAcceptInit(
        qParams.organizationId,
        qParams.organizationUserId,
        request
      );
    });

    await this.stateService.setOrganizationInvitation(null);
    await this.actionPromise;
    this.platformUtilService.showToast(
      "success",
      this.i18nService.t("inviteAccepted"),
      this.i18nService.t("inviteInitAcceptedDesc"),
      { timeout: 10000 }
    );

    this.router.navigate(["/vault"]);
  }

  async unauthedHandler(qParams: Params): Promise<void> {
    await this.prepareOrganizationInvitation(qParams);
  }

  private async prepareAcceptRequest(qParams: Params): Promise<OrganizationUserAcceptInitRequest> {
    const request = new OrganizationUserAcceptInitRequest();
    request.token = qParams.token;

    const shareKey = await this.cryptoService.makeShareKey();
    const key = shareKey[0].encryptedString;
    const orgKeys = await this.cryptoService.makeKeyPair(shareKey[1]);

    request.key = key;
    request.keys = new OrganizationKeysRequest(orgKeys[0], orgKeys[1].encryptedString);

    return request;
  }

  private async prepareOrganizationInvitation(qParams: Params): Promise<void> {
    this.orgName = qParams.organizationName;
    if (this.orgName != null) {
      // Fix URL encoding of space issue with Angular
      this.orgName = this.orgName.replace(/\+/g, " ");
    }
    await this.stateService.setOrganizationInvitation(qParams);
  }
}
