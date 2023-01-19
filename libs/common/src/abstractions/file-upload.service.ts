import { FileUploadType } from "../enums/fileUploadType";
import { EncArrayBuffer } from "../models/domain/enc-array-buffer";
import { EncString } from "../models/domain/enc-string";
import { AttachmentUploadDataResponse } from "../models/response/attachment-upload-data.response";
import { CipherResponse } from "../models/response/cipher.response";
import { SendFileUploadDataResponse } from "../models/response/send-file-upload-data.response";
import { AzureFileUploadService } from "../services/azureFileUpload.service";
import { BitwardenFileUploadService } from "../services/bitwardenFileUpload.service";
import { FileUploadApiMethods } from "../types/file-upload-api-methods";

import { LogService } from "./log.service";

export abstract class FileUploadService {
  private azureFileUploadService: AzureFileUploadService;
  private bitwardenFileUploadService: BitwardenFileUploadService;

  constructor(protected logService: LogService) {
    this.azureFileUploadService = new AzureFileUploadService(logService);
    this.bitwardenFileUploadService = new BitwardenFileUploadService();
  }

  abstract post(
    uploadData: SendFileUploadDataResponse | AttachmentUploadDataResponse,
    data: FormData,
    fileUploadMethods: FileUploadApiMethods,
    isAdmin?: boolean
  ): Promise<any>;

  abstract rollback(
    uploadData: SendFileUploadDataResponse | AttachmentUploadDataResponse,
    fileUploadMethods: FileUploadApiMethods
  ): Promise<any>;

  abstract renew(
    uploadData: SendFileUploadDataResponse | AttachmentUploadDataResponse,
    fileUploadMethods: FileUploadApiMethods,
    cipherResponse?: CipherResponse
  ): Promise<SendFileUploadDataResponse | AttachmentUploadDataResponse>;

  async upload(
    uploadData: SendFileUploadDataResponse | AttachmentUploadDataResponse,
    fileName: EncString,
    encryptedFileData: EncArrayBuffer,
    fileUploadMethods: FileUploadApiMethods,
    cipherResponse?: CipherResponse
  ) {
    try {
      switch (uploadData.fileUploadType) {
        case FileUploadType.Direct:
          await this.bitwardenFileUploadService.upload(
            fileName.encryptedString,
            encryptedFileData,
            (fd) => this.post(uploadData, fd, fileUploadMethods)
          );
          break;
        case FileUploadType.Azure: {
          const renewalCallback = async () => {
            if (cipherResponse) {
              const r = await this.renew(uploadData, fileUploadMethods, cipherResponse);
              return r.url;
            } else {
              const r = await this.renew(uploadData, fileUploadMethods);
              return r.url;
            }
          };
          await this.azureFileUploadService.upload(
            uploadData.url,
            encryptedFileData,
            renewalCallback
          );
          break;
        }
        default:
          throw new Error("Unknown file upload type");
      }
    } catch (e) {
      await this.rollback(uploadData, fileUploadMethods);
      throw e;
    }
  }
}
