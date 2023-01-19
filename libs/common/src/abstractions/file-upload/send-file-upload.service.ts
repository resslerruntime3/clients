import { EncArrayBuffer } from "../../models/domain/enc-array-buffer";
import { Send } from "../../models/domain/send";
import { SendResponse } from "../../models/response/send.response";

export abstract class SendFileUploadService {
  abstract upload(sendData: [Send, EncArrayBuffer]): Promise<SendResponse>;
}
