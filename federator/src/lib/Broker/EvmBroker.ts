import { Broker } from './Broker';
import { LogWrapper } from '../logWrapper';
import { ConfigData } from '../config';
import { HathorException, CreateProposalResponse, TransactionTypes } from '../../types';
import { IBridgeV4, FederationFactory, BridgeFactory } from '../../contracts';
import { HathorWallet } from '../HathorWallet';

export class EvmBroker extends Broker {
  constructor(
    config: ConfigData,
    logger: LogWrapper,
    bridgeFactory: BridgeFactory,
    federationFactory: FederationFactory,
  ) {
    super(config, logger, bridgeFactory, federationFactory);
  }

  async sendTokens(
    senderAddress: string,
    receiverAddress: string,
    amount: string,
    tokenAddress: string,
    txHash: string,
  ) {
    const [destinationChainTokenAddress, originalChainId] = await this.getSideChainTokenAddress(tokenAddress);
    const isTokenEvmNative = originalChainId == this.config.mainchain.chainId;
    const transactionType = isTokenEvmNative ? TransactionTypes.MINT : TransactionTypes.TRANSFER;
    await super.sendTokens(
      senderAddress,
      receiverAddress,
      amount,
      tokenAddress,
      txHash,
      transactionType,
      isTokenEvmNative,
    );
  }

  async validateTx(txHex: string, txHash: string): Promise<boolean> {
    const proposalTx = await this.decodeTxHex(txHex);
    const evmTx = await this.getWeb3(this.config.mainchain.host).eth.getTransaction(txHash);
    const bridge = (await this.bridgeFactory.createInstance(this.config.mainchain)) as IBridgeV4;
    const events = await bridge.getPastEvents('Cross', this.config.sidechain[0].chainId, {
      fromBlock: evmTx.blockNumber,
      toBlock: evmTx.blockNumber,
    });
    const event = events.find((e) => e.transactionHash === txHash);

    if (!event) {
      this.logger.error(`Invalid tx. Unable to find event on EVM. HEX: ${txHex} | HASH: ${txHash}`);
      return false;
    }

    const tokenAddress = event.returnValues['_tokenAddress'];

    const [destinationChainTokenAddress, originalChainId] = await this.getSideChainTokenAddress(tokenAddress);

    const tokenDecimals = await this.getTokenDecimals(tokenAddress, originalChainId);

    const convertedQuantity = this.convertToHathorDecimals(event.returnValues['_amount'], tokenDecimals);

    const isTokenEvmNative = originalChainId == this.config.mainchain.chainId;

    const proposalInfo = await this.getTransactionInfo(proposalTx);

    this.validateTokensOutput(proposalTx.outputs);
    this.validateOutputReceiver(proposalTx.outputs);

    if (isTokenEvmNative) {
      // MINT
      if (!proposalInfo.canMint[destinationChainTokenAddress]) {
        throw Error('Multisig does not have mint authority.');
      }
      if (proposalInfo.balances[destinationChainTokenAddress] <= 0) {
        throw Error('Not a mint operation.');
      }
      if (proposalInfo.balances[destinationChainTokenAddress] != convertedQuantity) {
        throw Error('Proposal cannot differ amount from original Tx.');
      }
    } else {
      // TRANSFER
      if (proposalInfo.balances[destinationChainTokenAddress] != 0) {
        throw Error('Not a transfer operation.');
      }

      const sumOutputs = this.sumByAddressAndToken(proposalTx.outputs);

      if (sumOutputs[`${event.returnValues['_to']}:${destinationChainTokenAddress}`] != convertedQuantity) {
        throw Error('Proposal cannot differ amount from original Tx.');
      }
    }

    return true;
  }

  async sendEvmNativeTokenProposal(receiverAddress: string, qtd: string, token: string): Promise<string> {
    const wallet = HathorWallet.getInstance(this.config, this.logger);
    const tokenDecimals = await this.getTokenDecimals(token, this.config.mainchain.chainId);
    const [destinationToken] = await this.getSideChainTokenAddress(token);
    const data = {
      address: `${receiverAddress}`,
      amount: this.convertToHathorDecimals(qtd, tokenDecimals),
      token: `${destinationToken}`,
    };

    const response = await wallet.requestWallet<CreateProposalResponse>(
      true,
      'multi',
      'wallet/p2sh/tx-proposal/mint-tokens',
      data,
    );
    if (response.status == 200 && response.data.success) {
      return response.data.txHex;
    }
    throw new HathorException(
      `Unable to send a mint proposal ${response.status} - ${response.statusText} - ${JSON.stringify(response.data)}`,
      response.data.message ?? response.data.error,
    );
  }

  async sendHathorNativeTokenProposal(receiverAddress: string, qtd: string, token: string): Promise<string> {
    const wallet = HathorWallet.getInstance(this.config, this.logger);
    const tokenDecimals = await this.getTokenDecimals(token, this.config.sidechain[0].chainId);
    const destinationToken = await this.getSideChainTokenAddress(token);

    const output = {
      address: `${receiverAddress}`,
      value: this.convertToHathorDecimals(qtd, tokenDecimals),
      token: `${destinationToken}`,
    };
    const outputs = [];
    outputs.push(output);

    const response = await wallet.requestWallet<CreateProposalResponse>(true, 'multi', 'wallet/tx-proposal', {
      outputs,
    });

    if (response.status == 200 && response.data.success) {
      return response.data.txHex;
    }
    throw new HathorException(
      `Unable to send a transaction proposal ${response.status} - ${response.statusText} - ${JSON.stringify(
        response.data,
      )}`,
      response.data.message ?? response.data.error,
    );
  }

  async getSideChainTokenAddress(tokenAddress: string): Promise<[string, number]> {
    const originBridge = (await this.bridgeFactory.createInstance(this.config.mainchain)) as IBridgeV4;
    const hathorTokenAddress = await originBridge.EvmToHathorTokenMap(tokenAddress);
    const originalToken = await originBridge.HathorToEvmTokenMap(hathorTokenAddress);

    return [hathorTokenAddress, originalToken.originChainId];
  }
}
