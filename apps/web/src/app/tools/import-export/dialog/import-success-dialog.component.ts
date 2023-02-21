import { DialogRef, DIALOG_DATA } from "@angular/cdk/dialog";
import { Component, Inject, OnInit } from "@angular/core";

import { ImportResult } from "@bitwarden/common/models/domain/import-result";
import { CipherType } from "@bitwarden/common/vault/enums/cipher-type";
import { TableDataSource } from "@bitwarden/components";

export interface ResultList {
  icon: string;
  type: string;
  count: number;
}

@Component({
  selector: "app-import-success-dialog",
  templateUrl: "./import-success-dialog.component.html",
})
export class ImportSuccessDialogComponent implements OnInit {
  protected dataSource = new TableDataSource<ResultList>();

  constructor(public dialogRef: DialogRef, @Inject(DIALOG_DATA) public data: ImportResult) {}

  ngOnInit(): void {
    if (this.data != null) {
      this.dataSource.data = this.buildResultList();
    }
  }

  private buildResultList(): ResultList[] {
    let logins = 0;
    let cards = 0;
    let identies = 0;
    let secureNotes = 0;
    this.data.ciphers.map((c) => {
      switch (c.type) {
        case CipherType.Login:
          logins++;
          break;
        case CipherType.Card:
          cards++;
          break;
        case CipherType.SecureNote:
          secureNotes++;
          break;
        case CipherType.Identity:
          identies++;
          break;
        default:
          break;
      }
    });

    const list: ResultList[] = [];
    list.push({ icon: "globe", type: "typeLogin", count: logins });
    list.push({ icon: "credit-card", type: "typeCard", count: cards });
    list.push({ icon: "id-card", type: "typeIdentity", count: identies });
    list.push({ icon: "sticky-note", type: "typeSecureNote", count: secureNotes });
    list.push({ icon: "folder", type: "folders", count: this.data.folders.length });
    list.push({ icon: "collection", type: "collections", count: this.data.collections.length });
    return list;
  }
}
