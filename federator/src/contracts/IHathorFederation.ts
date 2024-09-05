import { Contract, EventData } from 'web3-eth-contract';
import { TransactionTypes } from '../types/transactionTypes';

export interface IHathorFederation {
  hathorFederationContract: Contract;

  isProcessed(transactionId: string): Promise<boolean>;
  isSigned(transactionId: string, federatorAddress: string): Promise<boolean>;
  isProposed(transactionId: string): Promise<boolean>;
  getSignatureCount(transactionId: string): Promise<any>;
  transactionHex(transactionId: string): Promise<string>;
  transactionSignatures(transactionId: string, i: number): Promise<string[]>;
  getTransactionId(originalTokenAddress, transactionHash, value, sender, receiver, transactionType): Promise<string>;
  getSendTransactionProposalArgs(
    originalTokenAddress: string,
    transactionHash: string,
    value: number,
    sender: string,
    receiver: string,
    transactionType: TransactionTypes,
    txHex: string,
  ): Promise<any>;
  getUpdateSignatureStateArgs(
    originalTokenAddress,
    transactionHash,
    value,
    sender,
    receiver,
    transactionType,
    signature,
    signed,
  ): Promise<any>;

  getUpdateTransactionStateArgs(
    originalTokenAddress,
    transactionHash,
    value,
    sender,
    receiver,
    transactionType,
    sent,
    txId,
  ): Promise<any>;
  getPastEvents(eventName: string, options: any): Promise<EventData[]>;
}
