import { FileUploadType } from "../../enums/fileUploadType";
import { EncArrayBuffer } from "../../models/domain/enc-array-buffer";
import { EncString } from "../../models/domain/enc-string";
import { AzureFileUploadService } from "../../services/azureFileUpload.service";
import { BitwardenFileUploadService } from "../../services/bitwardenFileUpload.service";
import { FileUploadApiMethods } from "../../types/file-upload-api-methods";
import { LogService } from "../log.service";

export abstract class FileUploadService {
  private azureFileUploadService: AzureFileUploadService;
  private bitwardenFileUploadService: BitwardenFileUploadService;

  constructor(protected logService: LogService) {
    this.azureFileUploadService = new AzureFileUploadService(logService);
    this.bitwardenFileUploadService = new BitwardenFileUploadService();
  }

  async upload(
    uploadData: { url: string; fileUploadType: FileUploadType },
    fileName: EncString,
    encryptedFileData: EncArrayBuffer,
    fileUploadMethods: FileUploadApiMethods
  ) {
    try {
      switch (uploadData.fileUploadType) {
        case FileUploadType.Direct:
          await this.bitwardenFileUploadService.upload(
            fileName.encryptedString,
            encryptedFileData,
            (fd) => fileUploadMethods.postDirect(fd)
          );
          break;
        case FileUploadType.Azure: {
          await this.azureFileUploadService.upload(
            uploadData.url,
            encryptedFileData,
            fileUploadMethods.renewFileUploadUrl
          );
          break;
        }
        default:
          throw new Error("Unknown file upload type");
      }
    } catch (e) {
      await fileUploadMethods.rollback();
      throw e;
    }
  }
}
