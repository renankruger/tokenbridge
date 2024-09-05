import { Contract, EventData } from 'web3-eth-contract';
import { CustomError } from '../lib/CustomError';
import { IHathorFederation } from './IHathorFederation';
import Web3 from 'web3';
import { TransactionTypes } from '../types/transactionTypes';

export class IHathorFederationV1 implements IHathorFederation {
  hathorFederationContract: Contract;
  chainId: number;
  web3: Web3;

  constructor(hathorFederationContract: Contract, chainId: number, web3: Web3) {
    this.hathorFederationContract = hathorFederationContract;
    this.chainId = chainId;
    this.web3 = web3;
  }

  async getSignatureCount(transactionId: string): Promise<any> {
    try {
      return this.hathorFederationContract.methods.getSignatureCount(transactionId).call();
    } catch (err) {
      throw new CustomError(`Exception getSignatureCount at hathorFederation Contract`, err);
    }
  }

  async isProcessed(transactionId: string): Promise<boolean> {
    try {
      return this.hathorFederationContract.methods.isProcessed(transactionId).call();
    } catch (err) {
      throw new CustomError(`Exception isProcessed at hathorFederation Contract`, err);
    }
  }

  async isSigned(transactionId: string, federatorAddress: string): Promise<boolean> {
    try {
      return this.hathorFederationContract.methods.isSigned(transactionId, federatorAddress).call();
    } catch (err) {
      throw new CustomError(`Exception isSigned at hathorFederation Contract`, err);
    }
  }

  async isProposed(transactionId: string): Promise<boolean> {
    try {
      return this.hathorFederationContract.methods.isProposed(transactionId).call();
    } catch (err) {
      throw new CustomError(`Exception isProposed at hathorFederation Contract`, err);
    }
  }

  async transactionHex(transactionId: string): Promise<string> {
    try {
      const txHex = await this.hathorFederationContract.methods.transactionHex(transactionId).call();
      return txHex.substring(2);
    } catch (err) {
      throw new CustomError(`Exception transactionHex at hathorFederation Contract`, err);
    }
  }

  async transactionSignatures(transactionId: string, i: number): Promise<string[]> {
    try {
      return await this.hathorFederationContract.methods.transactionSignatures(transactionId, i).call();
    } catch (err) {
      throw new CustomError(`Exception transactionSignatures at hathorFederation Contract`, err);
    }
  }

  async getTransactionId(
    originalTokenAddress,
    transactionHash,
    value,
    sender,
    receiver,
    transactionType: TransactionTypes,
  ) {
    try {
      // Convert the string parameters to bytes32 where necessary
      const bytesOriginalTokenAddress = this.setPadding(originalTokenAddress);
      const bytesTransactionHash = this.setPadding(transactionHash);

      // Call the smart contract method with the formatted parameters
      return await this.hathorFederationContract.methods
        .getTransactionId(
          bytesOriginalTokenAddress,
          bytesTransactionHash,
          value,
          sender,
          receiver,
          transactionType.valueOf(),
        )
        .call();
    } catch (err) {
      throw new CustomError(`Exception getTransactionId at hathorFederation Contract`, err);
    }
  }

  async getSendTransactionProposalArgs(
    originalTokenAddress,
    transactionHash,
    value,
    sender,
    receiver,
    transactionType,
    txHex,
  ) {
    // Convert strings to bytes32 format
    const bytesOriginalTokenAddress = this.setPadding(originalTokenAddress);
    const bytesTransactionHash = this.setPadding(transactionHash);

    // Prepare the ABI-encoded function call
    return this.hathorFederationContract.methods
      .sendTransactionProposal(
        bytesOriginalTokenAddress,
        bytesTransactionHash,
        value,
        sender,
        receiver,
        transactionType,
        `0x${txHex}`,
      )
      .encodeABI();
  }

  async getUpdateSignatureStateArgs(
    originalTokenAddress,
    transactionHash,
    value,
    sender,
    receiver,
    transactionType,
    signature,
    signed,
  ) {
    // Convert strings to bytes32 format
    const bytesOriginalTokenAddress = this.setPadding(originalTokenAddress);
    const bytesTransactionHash = this.setPadding(transactionHash);

    // Prepare the ABI-encoded function call
    return this.hathorFederationContract.methods
      .updateSignatureState(
        bytesOriginalTokenAddress,
        bytesTransactionHash,
        value,
        sender,
        receiver,
        transactionType.valueOf(), // Convert transaction type enum to its underlying value
        signature,
        signed,
      )
      .encodeABI();
  }

  async getUpdateTransactionStateArgs(
    originalTokenAddress,
    transactionHash,
    value,
    sender,
    receiver,
    transactionType,
    sent,
    txId,
  ) {
    // Convert strings to bytes32 format
    const bytesOriginalTokenAddress = this.setPadding(originalTokenAddress);
    const bytesTransactionHash = this.setPadding(transactionHash);

    // Prepare the ABI-encoded function call
    return this.hathorFederationContract.methods
      .updateTransactionState(
        bytesOriginalTokenAddress,
        bytesTransactionHash,
        value,
        sender,
        receiver,
        transactionType,
        sent,
        `0x${txId}`,
      )
      .encodeABI();
  }
  getPastEvents(eventName: string, options: any): Promise<EventData[]> {
    return this.hathorFederationContract.getPastEvents(eventName, options);
  }

  setPadding(param: string) {
    let result = param;
    if (param.indexOf('0x') < 0) {
      result = `0x${param}`;
    }

    if (param.length < 64) {
      result = this.web3.utils.padLeft(result, 64);
    }
    return result;
  }

  getAddress(address) {
    let i = -1;
    let exit = false;
    let result = address;
    while (!exit && i < address.length) {
      i++;
      result = '0x' + address.substring(i);
      exit = this.web3.utils.isAddress(result);
    }

    return this.web3.utils.toChecksumAddress(result);
  }
}
