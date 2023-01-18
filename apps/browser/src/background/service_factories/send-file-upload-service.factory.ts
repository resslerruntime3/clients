import { FileUploadService as AbstractFileUploadService } from "@bitwarden/common/abstractions/file-upload.service";
import { SendFileUploadService } from "@bitwarden/common/services/fileUpload/send-file-upload.service";

import { FactoryOptions, CachedServices, factory } from "./factory-options";
import { logServiceFactory, LogServiceInitOptions } from "./log-service.factory";

type SendFileUploadServiceFactoyOptions = FactoryOptions;

export type SendFileUploadServiceInitOptions = SendFileUploadServiceFactoyOptions &
  LogServiceInitOptions;

export function sendFileUploadServiceFactory(
  cache: { fileUploadService?: AbstractFileUploadService } & CachedServices,
  opts: SendFileUploadServiceInitOptions
): Promise<AbstractFileUploadService> {
  return factory(
    cache,
    "sendFileUploadService",
    opts,
    async () => new SendFileUploadService(await logServiceFactory(cache, opts))
  );
}
