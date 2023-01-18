import { ApiService } from "../../abstractions/api.service";
import { AttachmentUploadDataResponse } from "../../models/response/attachment-upload-data.response";
import { FileUploadApiMethods } from "../../types/file-upload-api-methods";

export class CipherFileApiMethods implements FileUploadApiMethods {
  constructor(private apiService: ApiService) {}

  postFile(cipherId: string, fileId: string, fileData: FormData): Promise<any> {
    return this.apiService.postAttachmentFile(cipherId, fileId, fileData);
  }

  renewFileUploadUrl(cipherId: string, fileId: string): Promise<AttachmentUploadDataResponse> {
    return this.apiService.renewAttachmentUploadUrl(cipherId, fileId);
  }

  delete(cipherId: string, attachmentId: string, isAdmin: boolean): Promise<any> {
    if (isAdmin) {
      return this.apiService.deleteCipherAttachmentAdmin(cipherId, attachmentId);
    } else {
      return this.apiService.deleteCipherAttachment(cipherId, attachmentId);
    }
  }
}
