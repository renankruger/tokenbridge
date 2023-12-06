import axiosCurlirize from 'axios-curlirize';
import axios from 'axios';
import fs from 'fs';
import { LogWrapper } from './logWrapper';
import { ConfigData } from './config';
import { MetricCollector } from './MetricCollector';
import { PubSub } from '@google-cloud/pubsub';
import { HathorTx } from '../types/HathorTx';
import { HathorUtxo } from '../types/HathorUtxo';
import { Data } from '../types/hathorEvent';
import { HathorException } from '../types/HathorException';

// axiosCurlirize(axios);

type Response = {
  success: boolean;
  message?: string;
  error?: string;
  errorCode?: string;
};
type CreateProposalResponse = Response & { txHex: string };
type GetAddressResponse = Response & { address: string };
type GetMySignatureResponse = Response & { signatures: string };
type StatusResponse = Response & { statusCode: number; statusMessage: string };
type DecodeResponse = Response & { tx: Data };

type ProposalComponents = { hex: string; signatures: string[] };

export class HathorWallet {
  public logger: LogWrapper;
  public config: ConfigData;
  public metricCollector: MetricCollector;
  private walletUrl: string;
  private singleWalletId: string;
  private singleSeedKey: string;
  private multisigWalletId: string;
  private multisigSeedKey: string;
  private multisigRequiredSignatures: number;
  private multisigOrder: number;
  private eventQueueType: string;
  private pubsubProjectId: string;

  private WALLET_STATUS_CONNECTING = 1;
  private WALLET_STATUS_SYNCING = 2;
  private WALLET_STATUS_READY = 3;
  private nonRetriableErrors = ['Invalid transaction. At least one of your inputs has already been spent.'];

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor(config: ConfigData, logger: LogWrapper) {
    this.config = config;
    this.logger = logger;

    if (this.logger.upsertContext) {
      this.logger.upsertContext('service', this.constructor.name);
    }

    // const chainConfig = config.sidechain.find((chain) => chain.isHathor);
    const chainConfig = config.sidechain[0];

    this.walletUrl = chainConfig.walletUrl;
    this.singleWalletId = chainConfig.singleWalletId;
    this.singleSeedKey = chainConfig.singleSeedKey;
    this.multisigWalletId = chainConfig.multisigWalletId;
    this.multisigSeedKey = chainConfig.multisigSeedKey;
    this.multisigRequiredSignatures = chainConfig.multisigRequiredSignatures;
    this.multisigOrder = chainConfig.multisigOrder;
    this.eventQueueType = chainConfig.eventQueueType;
    this.pubsubProjectId = chainConfig.pubsubProjectId;
  }

  async sendTokensToHathor(receiverAddress: string, qtd: string, tokenAddress: string, txId: string) {
    if (this.multisigOrder > 1) {
      //TODO Log that ack the request, but is not the correct federator
      // Maybe, save data to evaluate later when signing?
      return;
    }

    await this.isWalletReady(true);
    await this.isWalletReady(false);

    const txHex = await this.sendTransactionProposal(receiverAddress, qtd, tokenAddress);
    await this.broadcastProposal(txHex, txId);
  }

  async listenToEventQueue(): Promise<void> {
    switch (this.eventQueueType) {
      case 'pubsub':
        this.listenToPubSubEventQueue();
        break;
      case 'sqs':
        this.logger.error('AWS SQS not implemented.');
        break;
      case 'asb':
        this.logger.error('Azure Service Bus not implemented.');
        break;
    }
  }

  private async listenToPubSubEventQueue() {
    const pubsub = new PubSub({ projectId: this.pubsubProjectId });

    const [subscriptions] = await pubsub.getSubscriptions();
    const subscription = subscriptions.find(
      (sub) => sub.name === `projects/${this.pubsubProjectId}/subscriptions/hathor-federator-${this.multisigOrder}-sub`,
    );

    if (subscription) {
      subscription.on('message', async (message) => {
        try {
          // this.logger.info(`Evento puro: ${message.data.toString()}`);
          await this.parseHathorLogs(JSON.parse(message.data.toString()));
          message.ack();
        } catch (error) {
          // TODO retry policy if fails to parse and resolve
          this.logger.error(`Fail to processing hathor event: ${error}`);
          if (error instanceof HathorException) {
            if (this.nonRetriableErrors.includes((error as HathorException).getOriginalMessage())) {
              message.ack();
              return;
            }
          }

          message.nack();
        }
      });
      subscription.on('error', (error) => {
        this.logger.error(
          `Unable to subscribe to topic hathor-federator-${this.multisigOrder}. Make sure it exists. Error: ${error}`,
        );
      });
    } else {
      this.logger.error(`Unable to subscribe to topic hathor-federator-${this.multisigOrder}. Make sure it exists.`);
    }
  }

  private async parseHathorLogs(event: any) {
    if (event.type !== 'wallet:new-tx') return;

    // this.logger.info(JSON.stringify(event));
    const utxos = event.data.outputs.map((o) => new HathorUtxo(o.script));
    const tx = new HathorTx(event.data.tx_id, event.data.timestamp, utxos);
    // TODO: if tx proposal to send to hathor, collect signature, and if last one, get others and sign and push
    const isProposal = tx.haveCustomData('hex');

    if (isProposal) {
      const txHex = tx.getCustomData();
      this.logger.info(txHex);
      await this.isWalletReady(true);
      await this.isWalletReady(false);
      // await this.sendMySignaturesToProposal(txHex);
    }

    if (this.multisigOrder >= this.multisigRequiredSignatures) {
      //TODO: check if tx are not completed before - test if is required
      const components = await this.getSignaturesToPush();
      this.logger.info(components);
      await this.signAndPushProposal(components.hex, components.signatures);
    }

    // TODO: if tokens sent to evm melt and send event to federator here
  }

  // Functions involved in sending tokens from EVM to Hathor

  private async getSignaturesToPush(): Promise<ProposalComponents> {
    const jsonTxs = await this.getHistory();

    const txs: HathorTx[] = [];

    jsonTxs.forEach((data) => {
      const utxos = data.outputs.map((o) => new HathorUtxo(o.script));
      const tx = new HathorTx(data.tx_id, data.timestamp, utxos);
      txs.push(tx);
    });

    //TODO filter by tx-hash
    const hex = txs.find((tx) => tx.haveCustomData('hex'));
    const signatures = txs.filter((tx) => tx.haveCustomData('sig'));

    return { hex: hex.getCustomData(), signatures: signatures.map((sig) => sig.getCustomData()) };
  }

  private async getHistory() {
    const url = `${this.walletUrl}/wallet/tx-history`;
    const config = {
      headers: {
        'X-Wallet-Id': this.multisigWalletId,
        'Content-type': 'application/json',
      },
      params: { limit: 50 },
    };

    try {
      const response = await axios.get<Data[]>(url, config);

      if (response.status == 200) {
        return response.data;
      }

      throw Error(`${response.status} - ${response.data}`);
    } catch (error) {
      throw Error(`Fail to getHistory: ${error}`);
    }
  }

  private async sendTransactionProposal(receiverAddress: string, qtd: string, token: string) {
    const hathorTokenAddress = this.getHathorTokenAddress(token);
    const url = `${this.walletUrl}/wallet/p2sh/tx-proposal/mint-tokens`;
    const config = {
      headers: {
        'X-Wallet-Id': this.multisigWalletId,
        'Content-type': 'application/json',
      },
    };

    const data = {
      address: `${receiverAddress}`,
      amount: qtd,
      token: `${hathorTokenAddress}`,
    };

    try {
      const response = await axios.post<CreateProposalResponse>(url, data, config);
      if (response.status == 200 && response.data.success) {
        return response.data.txHex;
      }
      throw Error(`${response.status} - ${response.statusText} - ${response.data}`);
    } catch (error) {
      throw Error(`Failed to send transaction proposal: ${error}`);
    }
  }

  private async getHathorTokenAddress(evmTokenAddress: string) {
    //TODO this has to change later
    const j = JSON.parse(fs.readFileSync('./db/tokenMapping.json', 'utf8'));
    const hathorTokenAddress = j.tokens.find((token) => token.evmaddress == evmTokenAddress).htraddress;
    this.logger.info(`Getting hathor token: ${hathorTokenAddress} for evm ${evmTokenAddress}`);
    return hathorTokenAddress;
  }

  private async broadcastProposal(txHex: string, txId: string) {
    const data = {
      outputs: await this.wrapData('hex', txHex, txId),
    };
    await this.broadcastDataToMultisig(data);
  }

  private async sendMySignaturesToProposal(txHex: string) {
    // TODO Validate proposal content
    // const transaction = await this.decodeTxHex(txHex);
    // this.logger.info(transaction);
    const signature = await this.getMySignatures(txHex);
    const wrappedSig = await this.wrapData('sig', signature);
    const data = {
      outputs: wrappedSig,
    };
    await this.broadcastDataToMultisig(data);
  }

  private async decodeTxHex(txHex: string): Promise<Data> {
    const url = `${this.walletUrl}/wallet/decode`;
    const config = {
      headers: {
        'X-Wallet-Id': this.multisigWalletId,
        'Content-type': 'application/json',
      },
    };

    try {
      const response = await axios.post<DecodeResponse>(url, { txHex: txHex }, config);

      if (response.status == 200 && response.data.success) {
        return response.data.tx;
      }

      throw Error(`${response.status} - ${response.data}`);
    } catch (error) {
      throw Error(`Error on decodeTxHex: ${error}`);
    }
  }

  private async getMySignatures(txHex: string) {
    const url = `${this.walletUrl}/wallet/p2sh/tx-proposal/get-my-signatures`;
    const config = {
      headers: {
        'X-Wallet-Id': this.multisigWalletId,
        'Content-type': 'application/json',
      },
    };

    try {
      const response = await axios.post<GetMySignatureResponse>(url, { txHex: txHex }, config);

      if (response.status == 200 && response.data.success) {
        return response.data.signatures;
      }

      throw Error(`${response.status} - ${response.data}`);
    } catch (error) {
      throw Error(`Fail to getMySignature: ${error}`);
    }
  }

  private async signAndPushProposal(txHex: string, signatures: string[]) {
    const url = `${this.walletUrl}/wallet/p2sh/tx-proposal/sign-and-push`;
    const config = {
      headers: {
        'X-Wallet-Id': this.multisigWalletId,
        'Content-type': 'application/json',
      },
    };

    const data = {
      txHex: `${txHex}`,
      signatures: signatures,
    };

    const response = await axios.post<Response>(url, data, config);

    if (response.status != 200 || !response.data.success) {
      const fullMessage = `${response.status} - ${response.statusText} - ${JSON.stringify(response.data)}`;
      throw new HathorException(fullMessage, response.data.error);
    }
  }

  // Base functions

  private async getMultiSigAddress() {
    // TODO Provide cache strategy
    const url = `${this.walletUrl}/wallet/address`;
    const config = {
      headers: {
        'X-Wallet-Id': this.multisigWalletId,
        'Content-type': 'application/json',
      },
    };

    try {
      const response = await axios.get<GetAddressResponse>(url, config);
      if (response.status == 200) {
        return response.data.address;
      }
      throw Error(`${response.status} - ${response.statusText} | ${response.data}`);
    } catch (error) {
      throw Error(`Fail to getMultiSigAddress: ${error}`);
    }
  }

  private async wrapData(dataType: string, data: string, txId = ''): Promise<any[]> {
    const outputs = [];
    /* dataLimit: the max amount of caracters a data field can get, 
        descounted the hex and positional caracters, ex: hex01{145 caracters}
    */
    const dataLimit = 145;

    const dataLength = data.length;
    const arraySize = Math.ceil(dataLength / dataLimit);

    for (let i = 0; i < arraySize; i++) {
      const start = i * dataLimit;
      const end = start + dataLimit;
      const part = data.substring(start, end);
      outputs.push({
        type: 'data',
        data: `${dataType}${i}${arraySize}${part}`,
      });
    }

    outputs.push({
      address: await this.getMultiSigAddress(),
      value: 1,
    });

    return outputs;
  }

  private async broadcastDataToMultisig(data: any): Promise<boolean> {
    const url = `${this.walletUrl}/wallet/send-tx`;
    const config = {
      headers: {
        'X-Wallet-Id': this.singleWalletId,
        'Content-type': 'application/json',
      },
    };

    try {
      const response = await axios.post<Response>(url, data, config);

      if (response.status != 200) {
        throw Error(`Response status: ${response.status} - status message: ${response.statusText}`);
      }
      if (response.status == 200 && !response.data.success) {
        throw Error(`Error message: ${response.data.error}`);
      }

      return true;
    } catch (error) {
      throw Error(`Fail to broadcast data to multisig: ${error}`);
    }
  }

  private async isWalletReady(multisig: boolean, retry = 1): Promise<boolean> {
    const id = multisig ? this.multisigWalletId : this.singleWalletId;
    if (retry > 3) {
      this.logger.error(`Fail to start ${id} wallet: Maximum number of retries reached.`);
      return false;
    }
    this.logger.info(`Checking ${id} wallet status for the ${retry} time`);
    const url = `${this.walletUrl}/wallet/status`;
    const config = {
      headers: {
        'x-wallet-id': multisig ? this.multisigWalletId : this.singleWalletId,
        'Content-type': 'application/json',
      },
    };

    try {
      const response = await axios.get<StatusResponse>(url, config);
      if (response.data.statusCode === this.WALLET_STATUS_READY) {
        this.logger.info(`${id} wallet is ready.`);
        return true;
      }
      if ([this.WALLET_STATUS_CONNECTING, this.WALLET_STATUS_SYNCING].includes(response.data.statusCode)) {
        this.logger.info(`${id} wallet is ${response.data.statusMessage}.`);
        await this.delay(3000);
        return this.isWalletReady(multisig, ++retry);
      }
      if (!response.data.success && response.data.statusMessage === '') {
        this.logger.info(`${id} wallet looks stopped.`);
        await this.startWallet(multisig);
        await this.delay(3000);
        return this.isWalletReady(multisig, ++retry);
      }
    } catch (error) {
      throw Error(`Fail to get status of ${id} wallet: ${error}`);
    }
  }

  private async startWallet(multisig: boolean): Promise<boolean> {
    const id = multisig ? this.multisigWalletId : this.singleWalletId;
    const seedKey = multisig ? this.multisigSeedKey : this.singleSeedKey;
    this.logger.info(`Trying to start ${id} wallet.`);
    const url = `${this.walletUrl}/start`;
    const config = {
      headers: {
        'Content-type': 'application/json',
      },
    };
    const data = {
      'wallet-id': id,
      seedKey: seedKey,
      multisig: multisig,
    };

    try {
      const response = await axios.post<Response>(url, data, config);
      return response.status == 200 && response.data.success;
    } catch (error) {
      throw Error(`Fail to start wallet: ${error}`);
    }
  }

  private async delay(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }
}
