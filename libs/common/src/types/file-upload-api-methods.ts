export type FileUploadApiMethods = {
  postDirect: (fileData: FormData) => Promise<void>;
  renewFileUploadUrl: () => Promise<string>;
  rollback: () => Promise<void>;
};
