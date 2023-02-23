import { DialogRef, DIALOG_DATA } from "@angular/cdk/dialog";
import { Component, Inject, OnInit } from "@angular/core";
import { FormControl, FormGroup, Validators } from "@angular/forms";

import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";

import { ProjectListView } from "../../models/view/project-list.view";
import { SecretListView } from "../../models/view/secret-list.view";
import { ServiceAccountView } from "../../models/view/service-account.view";
import { ProjectService } from "../../projects/project.service";
import { SecretService } from "../../secrets/secret.service";
import { ServiceAccountService } from "../service-account.service";

export enum OperationType {
  Add,
  Edit,
}

export interface ServiceAccountOperation {
  organizationId: string;
  serviceAccountId?: string;
  operation: OperationType;
}

@Component({
  selector: "sm-service-account-dialog",
  templateUrl: "./service-account-dialog.component.html",
})
export class ServiceAccountDialogComponent implements OnInit {
  projects: ProjectListView[];
  secrets: SecretListView[];
  showProjectsSecretsInfo = true;

  protected loading = false;

  formGroup = new FormGroup({
    name: new FormControl("", [Validators.required]),
  });

  constructor(
    public dialogRef: DialogRef,
    @Inject(DIALOG_DATA) private data: ServiceAccountOperation,
    private serviceAccountService: ServiceAccountService,
    private i18nService: I18nService,
    private platformUtilsService: PlatformUtilsService,
    private projectService: ProjectService,
    private secretService: SecretService
  ) {}

  async ngOnInit() {
    if (this.data.operation == OperationType.Add) {
      this.projects = await this.projectService.getProjects(this.data.organizationId);
      this.secrets = await this.secretService.getSecrets(this.data.organizationId);
    } else {
      this.showProjectsSecretsInfo = false;
      this.loadData();
    }
  }

  async loadData() {
    this.loading = true;
    const serviceAccount: ServiceAccountView = await (
      await this.serviceAccountService.getServiceAccounts(this.data.organizationId)
    )[0];
    this.formGroup.get("name").setValue(serviceAccount.name);
    this.formGroup.setValue({ name: serviceAccount.name });
    this.loading = false;
  }

  get title() {
    return this.data.operation === OperationType.Add ? "newServiceAccount" : "editServiceAccount";
  }

  submit = async () => {
    this.formGroup.markAllAsTouched();

    if (this.formGroup.invalid) {
      return;
    }

    const serviceAccountView = this.getServiceAccountView();
    let serviceAccountMessage: string;

    if (this.data.operation == OperationType.Add) {
      await this.serviceAccountService.create(this.data.organizationId, serviceAccountView);
      serviceAccountMessage = this.i18nService.t("serviceAccountCreated");
    } else {
      await this.serviceAccountService.update(
        this.data.serviceAccountId,
        this.data.organizationId,
        serviceAccountView
      );
      serviceAccountMessage = this.i18nService.t("serviceAccountUpdated");
    }

    this.platformUtilsService.showToast("success", null, serviceAccountMessage);
    this.dialogRef.close();
  };

  private getServiceAccountView() {
    const serviceAccountView = new ServiceAccountView();
    serviceAccountView.organizationId = this.data.organizationId;
    serviceAccountView.name = this.formGroup.value.name;
    return serviceAccountView;
  }
}
