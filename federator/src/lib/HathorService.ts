import { LogWrapper } from './logWrapper';
import { ConfigData } from './config';
import { PubSub } from '@google-cloud/pubsub';
import { HathorTx } from '../types/HathorTx';
import { HathorUtxo } from '../types/HathorUtxo';
import { HathorException } from '../types/HathorException';
import { BridgeFactory } from '../contracts/BridgeFactory';
import { FederationFactory } from '../contracts/FederationFactory';
import { EvmBroker } from './Broker/EvmBroker';
import { Broker } from './Broker/Broker';
import { ConfigChain } from './configChain';
import { HathorBroker } from './Broker/HathorBroker';

export class HathorService {
  public logger: LogWrapper;
  public config: ConfigData;
  public bridgeFactory: BridgeFactory;
  public federationFactory: FederationFactory;
  protected chainConfig: ConfigChain;

  private nonRetriableErrors = [
    /Invalid transaction. At least one of your inputs has already been spent./,
    /Transaction already exists/,
    /Invalid tx/,
  ];

  constructor(
    config: ConfigData,
    logger: LogWrapper,
    bridgeFactory: BridgeFactory,
    federationFactory: FederationFactory,
  ) {
    this.config = config;
    this.logger = logger;
    this.chainConfig = config.sidechain[0];
    this.bridgeFactory = bridgeFactory;
    this.federationFactory = federationFactory;
  }

  async sendTokensToHathor(receiverAddress: string, qtd: string, tokenAddress: string, txHash: string) {
    if (this.chainConfig.multisigOrder > 1) return;

    const broker = new EvmBroker(this.config, this.logger, this.bridgeFactory, this.federationFactory);
    await broker.sendTokensToHathor(receiverAddress, qtd, tokenAddress, txHash);
  }

  async listenToEventQueue(): Promise<void> {
    switch (this.chainConfig.eventQueueType) {
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
    const pubsub = new PubSub({ projectId: this.chainConfig.pubsubProjectId });

    const [subscriptions] = await pubsub.getSubscriptions();
    const subscription = subscriptions.find(
      (sub) =>
        sub.name ===
        `projects/${this.chainConfig.pubsubProjectId}/subscriptions/hathor-federator-${this.chainConfig.multisigOrder}-sub`,
    );

    if (subscription) {
      subscription.on('message', async (message) => {
        try {
          const response = await this.parseHathorLogs(JSON.parse(message.data.toString()));
          if (response) {
            message.ack();
            return;
          }
          message.nack();
          return;
        } catch (error) {
          // TODO retry policy if fails to parse and resolve
          this.logger.error(`Fail to processing hathor event: ${error}`);
          let isNonRetriable = false;
          if (error instanceof HathorException) {
            const originalError = (error as HathorException).getOriginalMessage();

            for (let index = 0; index < this.nonRetriableErrors.length; index++) {
              const rgxError = this.nonRetriableErrors[index];
              if (originalError.match(rgxError)) {
                isNonRetriable = true;
                break;
              }
            }

            if (isNonRetriable) {
              message.ack();
              return;
            }
          }

          message.nack();
        }
      });
      subscription.on('error', (error) => {
        this.logger.error(
          `Unable to subscribe to topic hathor-federator-${this.chainConfig.multisigOrder}. Make sure it exists. Error: ${error}`,
        );
      });
    } else {
      this.logger.error(
        `Unable to subscribe to topic hathor-federator-${this.chainConfig.multisigOrder}. Make sure it exists.`,
      );
    }
  }

  private async parseHathorLogs(event: any): Promise<boolean> {
    if (event.type !== 'wallet:new-tx') return true;

    const outUtxos = event.data.outputs.map(
      (o) =>
        new HathorUtxo(o.script, o.token, o.value, {
          type: o.decoded?.type,
          address: o.decoded?.address,
          timelock: o.decoded?.timelock,
        }),
    );

    const inUtxos = event.data.inputs.map(
      (o) =>
        new HathorUtxo(o.script, o.token, o.value, {
          type: o.decoded?.type,
          address: o.decoded?.address,
          timelock: o.decoded?.timelock,
        }),
    );
    const tx = new HathorTx(event.data.tx_id, event.data.timestamp, outUtxos, inUtxos);

    const isProposal = tx.haveCustomData('hex');

    if (isProposal) {
      this.logger.info('Evaluating proposal...');
      const txHex = tx.getCustomData('hex');
      const [broker, dataType] = this.getBrokerAndDataType(tx);
      const confirmed = await broker.isTxConfirmed(tx.tx_id);
      if (!confirmed) {
        return false;
      }
      await broker.sendMySignaturesToProposal(txHex, tx.getCustomData(dataType));
      return true;
    }

    const isSignature = tx.haveCustomData('sig');

    if (isSignature && this.chainConfig.multisigOrder >= this.chainConfig.multisigRequiredSignatures) {
      this.logger.info('Evaluating signature...');
      const [broker, dataType] = this.getBrokerAndDataType(tx);

      const confirmed = await broker.isTxConfirmed(tx.tx_id);
      if (!confirmed) {
        return false;
      }

      const txId = tx.getCustomData(dataType);
      const components = await broker.getSignaturesToPush(txId);

      if (components.signatures.length < this.chainConfig.multisigRequiredSignatures) {
        this.logger.info(
          `Number of signatures not reached. Require ${this.chainConfig.multisigRequiredSignatures} signatures, have ${components.signatures.length}`,
        );
        return false;
      }

      await broker.signAndPushProposal(components.hex, txId, components.signatures);
      return true;
    }

    const isHathorToEvm = tx.haveCustomData('addr');

    if (isHathorToEvm) {
      const broker = new HathorBroker(this.config, this.logger, this.bridgeFactory, this.federationFactory);

      const confirmed = await broker.isTxConfirmed(tx.tx_id);
      if (!confirmed) {
        return false;
      }

      const tokenData = tx.getCustomTokenData()[0];

      const result = await broker.sendTokensFromHathor(
        tx.getCustomData('addr'),
        tokenData.value,
        tokenData.token,
        tx.tx_id,
        tokenData.sender,
        tx.timestamp,
      );
      if (!result) {
        throw new HathorException('Invalid tx', 'Invalid tx'); //TODO change exception type
      }
      return true;
    }
  }

  private getBrokerAndDataType(tx: HathorTx): [Broker, string] {
    const customDataType = tx.getCustomDataType();
    switch (customDataType) {
      case 'hsh':
        return [new EvmBroker(this.config, this.logger, this.bridgeFactory, this.federationFactory), customDataType];
      case 'hid':
        return [new HathorBroker(this.config, this.logger, this.bridgeFactory, this.federationFactory), customDataType];
    }
  }
}

export default HathorService;
