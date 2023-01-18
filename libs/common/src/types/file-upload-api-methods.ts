export type FileUploadApiMethods = {
  postFile: (itemId: string, fileId: string, fileData: FormData) => Promise<any>;
  renewFileUploadUrl: (itemId: string, fileId: string) => Promise<any>;
  delete: (itemId: string, attachmentId?: string, isAdmin?: boolean) => Promise<any>;
};
