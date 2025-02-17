import { Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { combineLatestWith, Observable, startWith, switchMap } from "rxjs";

import { DialogService } from "@bitwarden/components";

import { SecretListView } from "../models/view/secret-list.view";
import { SecretService } from "../secrets/secret.service";

import {
  SecretHardDeleteDialogComponent,
  SecretHardDeleteOperation,
} from "./dialog/secret-hard-delete.component";
import {
  SecretRestoreDialogComponent,
  SecretRestoreOperation,
} from "./dialog/secret-restore.component";

@Component({
  selector: "sm-trash",
  templateUrl: "./trash.component.html",
})
export class TrashComponent implements OnInit {
  secrets$: Observable<SecretListView[]>;

  private organizationId: string;

  constructor(
    private route: ActivatedRoute,
    private secretService: SecretService,
    private dialogService: DialogService
  ) {}

  ngOnInit() {
    this.secrets$ = this.secretService.secret$.pipe(
      startWith(null),
      combineLatestWith(this.route.params),
      switchMap(async ([_, params]) => {
        this.organizationId = params.organizationId;
        return await this.getSecrets();
      })
    );
  }

  private async getSecrets(): Promise<SecretListView[]> {
    return await this.secretService.getTrashedSecrets(this.organizationId);
  }

  openDeleteSecret(secretIds: string[]) {
    this.dialogService.open<unknown, SecretHardDeleteOperation>(SecretHardDeleteDialogComponent, {
      data: {
        secretIds: secretIds,
        organizationId: this.organizationId,
      },
    });
  }

  openRestoreSecret(secretIds: string[]) {
    this.dialogService.open<unknown, SecretRestoreOperation>(SecretRestoreDialogComponent, {
      data: {
        secretIds: secretIds,
        organizationId: this.organizationId,
      },
    });
  }
}
