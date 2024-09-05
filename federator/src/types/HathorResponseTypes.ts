import { Data } from './hathorEvent';

export type HathorResponse = {
  success: boolean;
  message?: string;
  error?: string;
  errorCode?: string;
};
export type CreateProposalResponse = HathorResponse & { txHex: string };
export type GetAddressResponse = HathorResponse & { address: string };
export type GetConfirmationResponse = HathorResponse & { confirmationNumber: number };
export type GetMySignatureResponse = HathorResponse & { signatures: string };
export type SignAndPushResponse = HathorResponse & { hash: string };
export type StatusResponse = HathorResponse & { statusCode: number; statusMessage: string; message: string };
export type DecodeResponse = HathorResponse & { tx: Data };
