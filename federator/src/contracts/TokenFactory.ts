import { AbiItem } from 'web3-utils';
import abiToken from '../../../bridge/abi/MainToken.json';
import { ConfigChain } from '../lib/configChain';
import { ContractFactory } from './ContractFactory';
import { IToken } from './IToken';
import { ITokenV0 } from './ITokenV0';

export class TokenFactory extends ContractFactory {
  async createInstance(configChain: ConfigChain, tokenAddress: string): Promise<IToken> {
    const web3 = this.getWeb3(configChain.host);
    const chainId = configChain.chainId;
    const tokenContract = this.getContractByAbiAndChainId(abiToken as AbiItem[], tokenAddress, web3, chainId);
    return new ITokenV0(tokenContract, chainId);
  }
}
