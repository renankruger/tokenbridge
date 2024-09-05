import { Contract } from 'web3-eth-contract';
import { IToken } from './IToken';

export class ITokenV0 implements IToken {
  tokenContract: Contract;
  chainId: any;

  constructor(_tokenContract: Contract, _chainId: number) {
    this.tokenContract = _tokenContract;
    this.chainId = _chainId;
  }

  getDecimals(): Promise<number> {
    return this.tokenContract.methods.decimals().call();
  }
}
