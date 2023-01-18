import { LogService } from "../../abstractions/log.service";
import { SendFileUploadDataResponse } from "../../models/response/send-file-upload-data.response";
import { FileUploadApiMethods } from "../../types/fileUploadApiMethods";

import { FileUploadService } from "./fileUpload.service";
import { SendFileApiMethods } from "./send-api-upload-methods";

export class SendFileUploadService extends FileUploadService {
  constructor(protected logService: LogService) {
    super(logService);
  }

  post(
    uploadData: SendFileUploadDataResponse,
    data: FormData,
    fileUploadMethods: SendFileApiMethods
  ): Promise<any> {
    return fileUploadMethods.postFile(
      uploadData.sendResponse.id,
      uploadData.sendResponse.file.id,
      data
    );
  }

  async rollback(
    uploadData: SendFileUploadDataResponse,
    fileUploadMethods: FileUploadApiMethods
  ): Promise<any> {
    return await fileUploadMethods.delete(uploadData.sendResponse.id);
  }

  async renew(
    uploadData: SendFileUploadDataResponse,
    fileUploadMethods: FileUploadApiMethods
  ): Promise<any> {
    return await fileUploadMethods.renewFileUploadUrl(
      uploadData.sendResponse.id,
      uploadData.sendResponse.file.id
    );
  }
}
