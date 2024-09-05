import abi from './HathorFederation.json';
import { AbiItem } from 'web3-utils';
import { ContractFactory } from './ContractFactory';
import { IHathorFederation } from './IHathorFederation';
import { IHathorFederationV1 } from './IHathorFederationV1';

export class HathorFederationFactory extends ContractFactory {
  public hathorFederationContract: IHathorFederationV1;

  createInstance(): IHathorFederation {
    if (!this.hathorFederationContract) {
      const web3 = this.getWeb3(process.env.HATHOR_STATE_CONTRACT_HOST_URL);
      const chainId = Number.parseInt(process.env.FEDERATION_CHAIN);
      const contract = new web3.eth.Contract(abi as AbiItem[], process.env.HATHOR_STATE_CONTRACT_ADDR);
      this.hathorFederationContract = new IHathorFederationV1(contract, chainId, web3);
    }
    return this.hathorFederationContract;
  }
}
