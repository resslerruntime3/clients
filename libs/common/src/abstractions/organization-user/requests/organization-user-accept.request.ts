import { OrganizationKeysRequest } from "../../../models/request/organization-keys.request";

export class OrganizationUserAcceptRequest {
  token: string;
  // Used to auto-enroll in master password reset
  resetPasswordKey: string;
  key: string;
  keys: OrganizationKeysRequest;
}
