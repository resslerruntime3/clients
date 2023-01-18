import { FileUploadService as AbstractFileUploadService } from "@bitwarden/common/abstractions/fileUpload.service";
import { CipherFileUploadService } from "@bitwarden/common/services/fileUpload/cipher-file-upload.service";

import { FactoryOptions, CachedServices, factory } from "./factory-options";
import { logServiceFactory, LogServiceInitOptions } from "./log-service.factory";

type CipherFileUploadServiceFactoyOptions = FactoryOptions;

export type CipherFileUploadServiceInitOptions = CipherFileUploadServiceFactoyOptions &
  LogServiceInitOptions;

export function cipherFileUploadServiceFactory(
  cache: { fileUploadService?: AbstractFileUploadService } & CachedServices,
  opts: CipherFileUploadServiceInitOptions
): Promise<AbstractFileUploadService> {
  return factory(
    cache,
    "cipherFileUploadService",
    opts,
    async () => new CipherFileUploadService(await logServiceFactory(cache, opts))
  );
}
