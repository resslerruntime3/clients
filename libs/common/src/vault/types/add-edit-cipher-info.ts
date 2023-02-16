import { CipherView } from "../models/view/cipher.view";

export type AddEditCipherInfo = {
  cipher: CipherView;
  collectionIds?: string[];
};
