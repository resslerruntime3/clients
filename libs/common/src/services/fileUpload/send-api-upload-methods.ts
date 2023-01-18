import { SendApiService } from "../../abstractions/send/send-api.service.abstraction";
import { SendFileUploadDataResponse } from "../../models/response/send-file-upload-data.response";
import { FileUploadApiMethods } from "../../types/file-upload-api-methods";

export class SendFileApiMethods implements FileUploadApiMethods {
  constructor(private sendApiService: SendApiService) {}

  postFile(sendId: string, fileId: string, fileData: FormData): Promise<any> {
    return this.sendApiService.postSendFile(sendId, fileId, fileData);
  }

  renewFileUploadUrl(sendId: string, fileId: string): Promise<SendFileUploadDataResponse> {
    return this.sendApiService.renewSendFileUploadUrl(sendId, fileId);
  }

  delete(sendId: string): Promise<any> {
    return this.sendApiService.deleteSend(sendId);
  }
}
