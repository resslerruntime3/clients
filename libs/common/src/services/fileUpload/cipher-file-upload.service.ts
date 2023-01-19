import { FileUploadService } from "../../abstractions/file-upload.service";
import { LogService } from "../../abstractions/log.service";
import { AttachmentUploadDataResponse } from "../../models/response/attachment-upload-data.response";
import { CipherResponse } from "../../models/response/cipher.response";
import { FileUploadApiMethods } from "../../types/file-upload-api-methods";

import { CipherFileApiMethods } from "./cipher-file-upload-methods";
export class CipherFileUploadService extends FileUploadService {
  constructor(protected logService: LogService) {
    super(logService);
  }

  post(
    uploadData: AttachmentUploadDataResponse,
    data: FormData,
    fileUploadMethods: CipherFileApiMethods,
    isAdmin: boolean
  ): Promise<any> {
    const response = isAdmin ? uploadData.cipherMiniResponse : uploadData.cipherResponse;
    return fileUploadMethods.postFile(response.id, uploadData.attachmentId, data);
  }

  async rollback(
    uploadData: AttachmentUploadDataResponse,
    fileUploadMethods: FileUploadApiMethods
  ): Promise<any> {
    return await fileUploadMethods.delete(uploadData.attachmentId);
  }

  async renew(
    uploadData: AttachmentUploadDataResponse,
    fileUploadMethods: FileUploadApiMethods,
    cipherResponse: CipherResponse
  ): Promise<any> {
    return await fileUploadMethods.renewFileUploadUrl(cipherResponse.id, uploadData.attachmentId);
  }
}
