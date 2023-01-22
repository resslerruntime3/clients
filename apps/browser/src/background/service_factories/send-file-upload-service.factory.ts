import { SendFileUploadService as SendFileUploadServiceAbstraction } from "@bitwarden/common/abstractions/file-upload/send-file-upload.service";
import { SendFileUploadService } from "@bitwarden/common/services/file-upload/send-file-upload.service";

import { apiServiceFactory, ApiServiceInitOptions } from "./api-service.factory";
import { FactoryOptions, CachedServices, factory } from "./factory-options";
import { fileUploadServiceFactory } from "./file-upload-service.factory";
import { sendServiceFactory, SendServiceInitOptions } from "./send-service.factory";

type SendFileUploadServiceFactoyOptions = FactoryOptions;

export type SendFileUploadServiceInitOptions = SendFileUploadServiceFactoyOptions &
  SendServiceInitOptions &
  ApiServiceInitOptions;

export function sendFileUploadServiceFactory(
  cache: { sendFileUploadService?: SendFileUploadServiceAbstraction } & CachedServices,
  opts: SendFileUploadServiceInitOptions
): Promise<SendFileUploadServiceAbstraction> {
  return factory(
    cache,
    "sendFileUploadService",
    opts,
    async () =>
      new SendFileUploadService(
        await sendServiceFactory(cache, opts),
        await apiServiceFactory(cache, opts),
        await fileUploadServiceFactory(cache, opts)
      )
  );
}
