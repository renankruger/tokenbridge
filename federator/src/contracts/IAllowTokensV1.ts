import { BN } from 'ethereumjs-util';
import { Contract } from 'web3-eth-contract';
import { CustomError } from '../lib/CustomError';
import { VERSIONS } from './Constants';
import { IAllowTokens } from './IAllowTokens';
import { ConfirmationsReturn } from './IAllowTokensV0';

export interface GetLimitsParams {
  tokenAddress: string;
}

export class IAllowTokensV1 implements IAllowTokens {
  allowTokensContract: Contract;
  mapTokenInfoAndLimits: any;
  chainId: number;
  federatorInstance: number;

  constructor(allowTokensContract: Contract, chainId: number, federatorInstance = 1) {
    this.allowTokensContract = allowTokensContract;
    this.mapTokenInfoAndLimits = {};
    this.chainId = chainId;
    this.federatorInstance = federatorInstance;
  }

  getVersion(): string {
    return VERSIONS.V1;
  }

  async getConfirmations(): Promise<ConfirmationsReturn> {
    const promises = [];
    promises.push(this.getSmallAmountConfirmations());
    promises.push(this.getMediumAmountConfirmations());
    promises.push(this.getLargeAmountConfirmations());
    const result = await Promise.all(promises);
    return {
      smallAmountConfirmations: this.multiplyByFederatorInstance(result[0]),
      mediumAmountConfirmations: this.multiplyByFederatorInstance(result[1]),
      largeAmountConfirmations: this.multiplyByFederatorInstance(result[2]),
    };
  }

  private multiplyByFederatorInstance(confirmation: number): number {
    return confirmation * this.federatorInstance;
  }

  async getSmallAmountConfirmations(): Promise<BN> {
    try {
      return this.allowTokensContract.methods.smallAmountConfirmations().call();
    } catch (err) {
      throw new CustomError(`Exception getSmallAmountConfirmations at AllowTokens Contract`, err);
    }
  }

  async getMediumAmountConfirmations(): Promise<BN> {
    try {
      return this.allowTokensContract.methods.mediumAmountConfirmations().call();
    } catch (err) {
      throw new CustomError(`Exception getMediumAmountConfirmations at AllowTokens Contract`, err);
    }
  }

  async getLargeAmountConfirmations(): Promise<BN> {
    try {
      return this.allowTokensContract.methods.largeAmountConfirmations().call();
    } catch (err) {
      throw new CustomError(`Exception getLargeAmountConfirmations at AllowTokens Contract`, err);
    }
  }

  async getLimits(objParams: GetLimitsParams) {
    try {
      let result = this.mapTokenInfoAndLimits[objParams.tokenAddress];
      if (!result) {
        const infoAndLimits = await this.allowTokensContract.methods.getInfoAndLimits(objParams.tokenAddress).call();
        result = {
          allowed: infoAndLimits.info.allowed,
          mediumAmount: infoAndLimits.limit.mediumAmount,
          largeAmount: infoAndLimits.limit.largeAmount,
        };
        if (result.allowed) {
          this.mapTokenInfoAndLimits[objParams.tokenAddress] = result;
        }
      }
      return result;
    } catch (err) {
      throw new CustomError(`Exception getInfoAndLimits at AllowTokens Contract for ${objParams.tokenAddress}`, err);
    }
  }
}
