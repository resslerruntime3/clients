import { EncArrayBuffer } from "../models/domain/enc-array-buffer";
import { EncString } from "../models/domain/enc-string";
import { AttachmentUploadDataResponse } from "../models/response/attachment-upload-data.response";
import { CipherResponse } from "../models/response/cipher.response";
import { SendFileUploadDataResponse } from "../models/response/send-file-upload-data.response";
import { FileUploadApiMethods } from "../types/fileUploadApiMethods";

export abstract class FileUploadService {
  upload: (
    uploadData: SendFileUploadDataResponse | AttachmentUploadDataResponse,
    fileName: EncString,
    encryptedFileData: EncArrayBuffer,
    fileUploadMethods: FileUploadApiMethods,
    cipherResponse?: CipherResponse
  ) => Promise<any>;
}
