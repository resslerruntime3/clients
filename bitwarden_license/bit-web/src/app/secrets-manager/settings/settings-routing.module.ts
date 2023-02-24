import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { Provider } from "@bitwarden/common/models/domain/provider";

import { ProviderPermissionsGuard } from "../../providers/guards/provider-permissions.guard";

import { SecretsManagerExportComponent } from "./porting/sm-export.component";
import { SecretsManagerImportComponent } from "./porting/sm-import.component";

const routes: Routes = [
  {
    path: "import",
    component: SecretsManagerImportComponent,
    canActivate: [ProviderPermissionsGuard],
    data: {
      titleId: "importData",
      providerPermissions: (provider: Provider) => provider.isProviderAdmin,
    },
  },
  {
    path: "export",
    component: SecretsManagerExportComponent,
    canActivate: [ProviderPermissionsGuard],
    data: {
      titleId: "exportData",
      providerPermissions: (provider: Provider) => provider.isProviderAdmin,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SettingsRoutingModule {}
