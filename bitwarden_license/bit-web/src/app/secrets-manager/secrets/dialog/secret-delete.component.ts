import { DialogRef, DIALOG_DATA } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";

import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { DialogService } from "@bitwarden/components";

import {
  BulkOperationStatus,
  BulkStatusDetails,
  BulkStatusDialogComponent,
} from "../../shared/dialogs/bulk-status-dialog.component";
import { SecretService } from "../secret.service";

export interface SecretDeleteOperation {
  secretIds: string[];
  organizationId: string;
}

@Component({
  selector: "sm-secret-delete-dialog",
  templateUrl: "./secret-delete.component.html",
})
export class SecretDeleteDialogComponent {
  constructor(
    public dialogRef: DialogRef,
    private secretService: SecretService,
    private i18nService: I18nService,
    private platformUtilsService: PlatformUtilsService,
    @Inject(DIALOG_DATA) private data: SecretDeleteOperation,
    private dialogService: DialogService
  ) {}

  secretIds = this.data.secretIds;

  get title() {
    return this.data.secretIds.length === 1 ? "deleteSecret" : "deleteSecrets";
  }

  get submitButtonText() {
    return this.data.secretIds.length === 1 ? "deleteSecret" : "deleteSecrets";
  }

  delete = async () => {
    const bulkResponses = await this.secretService.delete(
      this.data.secretIds,
      this.data.organizationId
    );

    const message =
      this.data.secretIds.length === 1 ? "softDeleteSuccessToast" : "softDeletesSuccessToast";

    this.dialogRef.close(this.data.secretIds);

    if (bulkResponses.find((response) => response.errorMessage)) {
      this.openBulkStatusDialog(bulkResponses.filter((response) => response.errorMessage));
      return;
    }

    this.platformUtilsService.showToast("success", null, this.i18nService.t(message));
  };

  openBulkStatusDialog(bulkStatusResults: BulkOperationStatus[]) {
    this.dialogService.open<unknown, BulkStatusDetails>(BulkStatusDialogComponent, {
      data: {
        title: "deleteSecrets",
        subTitle: "secrets",
        columnTitle: "secretName",
        message: "bulkDeleteSecretsErrorMessage",
        details: bulkStatusResults,
      },
    });
  }
}
