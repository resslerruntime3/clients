import { FileUploadService } from "../../abstractions/file-upload/file-upload.service";
import { SendFileUploadService as SendFileUploadServiceAbstraction } from "../../abstractions/file-upload/send-file-upload.service";
import { SendApiService } from "../../abstractions/send/send-api.service.abstraction";
import { SendType } from "../../enums/sendType";
import { Utils } from "../../misc/utils";
import { EncArrayBuffer } from "../../models/domain/enc-array-buffer";
import { Send } from "../../models/domain/send";
import { SendRequest } from "../../models/request/send.request";
import { ErrorResponse } from "../../models/response/error.response";
import { SendFileUploadDataResponse } from "../../models/response/send-file-upload-data.response";
import { SendResponse } from "../../models/response/send.response";
import { FileUploadApiMethods } from "../../types/file-upload-api-methods";

export class SendFileUploadService implements SendFileUploadServiceAbstraction {
  constructor(
    private sendApiService: SendApiService,
    private fileUploadService: FileUploadService
  ) {}

  async upload(sendData: [Send, EncArrayBuffer]): Promise<SendResponse> {
    const request = new SendRequest(sendData[0], sendData[1]?.buffer.byteLength);
    let response: SendResponse;
    if (sendData[0].id == null) {
      if (sendData[0].type === SendType.Text) {
        response = await this.sendApiService.postSend(request);
      } else {
        try {
          const uploadDataResponse = await this.sendApiService.postFileTypeSend(request);
          response = uploadDataResponse.sendResponse;
          await this.fileUploadService.upload(
            uploadDataResponse,
            sendData[0].file.fileName,
            sendData[1],
            this.generateMethods(uploadDataResponse, response)
          );
        } catch (e) {
          alert(e);
          if (e instanceof ErrorResponse && (e as ErrorResponse).statusCode === 404) {
            response = await this.legacyServerSendFileUpload(sendData, request);
          } else if (e instanceof ErrorResponse) {
            throw new Error((e as ErrorResponse).getSingleMessage());
          } else {
            throw e;
          }
        }
        return response;
      }
    }
  }

  private generateMethods(
    uploadData: SendFileUploadDataResponse,
    response: SendResponse
  ): FileUploadApiMethods {
    return {
      postDirect: this.generatePostDirectCallback(response),
      renewFileUploadUrl: this.generateRenewFileUploadUrlCallback(response.id, response.file.id),
      rollback: this.generateRollbackCallback(response.id),
    };
  }

  private generatePostDirectCallback(sendResponse: SendResponse) {
    return (data: FormData) => {
      return this.sendApiService.postSendFile(sendResponse.id, sendResponse.file.id, data);
    };
  }

  private generateRenewFileUploadUrlCallback(sendId: string, fileId: string) {
    return async () => {
      const renewResponse = await this.sendApiService.renewSendFileUploadUrl(sendId, fileId);
      return renewResponse?.url;
    };
  }

  private generateRollbackCallback(sendId: string) {
    return () => {
      return this.sendApiService.deleteSend(sendId);
    };
  }

  /**
   * @deprecated Mar 25 2021: This method has been deprecated in favor of direct uploads.
   * This method still exists for backward compatibility with old server versions.
   */
  async legacyServerSendFileUpload(
    sendData: [Send, EncArrayBuffer],
    request: SendRequest
  ): Promise<SendResponse> {
    const fd = new FormData();
    try {
      const blob = new Blob([sendData[1].buffer], { type: "application/octet-stream" });
      fd.append("model", JSON.stringify(request));
      fd.append("data", blob, sendData[0].file.fileName.encryptedString);
    } catch (e) {
      if (Utils.isNode && !Utils.isBrowser) {
        fd.append("model", JSON.stringify(request));
        fd.append(
          "data",
          Buffer.from(sendData[1].buffer) as any,
          {
            filepath: sendData[0].file.fileName.encryptedString,
            contentType: "application/octet-stream",
          } as any
        );
      } else {
        throw e;
      }
    }
    return await this.sendApiService.postSendFileLegacy(fd);
  }
}
