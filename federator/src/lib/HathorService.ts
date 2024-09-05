import { LogWrapper } from './logWrapper';
import { ConfigData } from './config';
import { PubSub, Subscription } from '@google-cloud/pubsub';
import * as rabbitmq from 'amqplib';
import { HathorTx } from '../types/HathorTx';
import { HathorUtxo } from '../types/HathorUtxo';
import { HathorException } from '../types/HathorException';
import { BridgeFactory } from '../contracts/BridgeFactory';
import { FederationFactory } from '../contracts/FederationFactory';
import { EvmBroker } from './Broker/EvmBroker';
import { ConfigChain } from './configChain';
import { HathorBroker } from './Broker/HathorBroker';
import TransactionSender from './TransactionSender';

export class HathorService {
  public logger: LogWrapper;
  public config: ConfigData;
  public bridgeFactory: BridgeFactory;
  public federationFactory: FederationFactory;
  public transactionSender: TransactionSender;
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
    transactionSender: TransactionSender,
  ) {
    this.config = config;
    this.logger = logger;
    this.chainConfig = config.sidechain[0];
    this.bridgeFactory = bridgeFactory;
    this.federationFactory = federationFactory;
    this.transactionSender = transactionSender;
  }

  async sendTokensToHathor(
    senderAddress: string,
    receiverAddress: string,
    qtd: string,
    tokenAddress: string,
    txHash: string,
  ) {
    const broker = new EvmBroker(this.config, this.logger, this.bridgeFactory, this.federationFactory);
    await broker.sendTokens(senderAddress, receiverAddress, qtd, tokenAddress, txHash);
  }

  async listenToEventQueue(): Promise<void> {
    switch (this.chainConfig.eventQueueType) {
      case 'pubsub':
        this.listenToPubSubEventQueue();
        break;
      case 'rabbitmq':
        this.listenToRabbitMQEventQueue();
        break;
      case 'sqs':
        this.logger.error('AWS SQS not implemented.');
        break;
      case 'asb':
        this.logger.error('Azure Service Bus not implemented.');
        break;
    }
  }

  private async listenToRabbitMQEventQueue() {
    const queue = 'main_queue';

    try {
      const conn = await rabbitmq.connect(process.env.RABBITMQ_URL);

      if (conn) {
        this.logger.info('Connected to rabbitmq');
      }

      const channel = await conn.createChannel();
      await channel.assertQueue(queue, { deadLetterExchange: 'dlx_exchange', deadLetterRoutingKey: 'dlq_queue' });

      channel.consume(queue, async (message) => {
        if (message !== null) {
          try {
            const response = await this.parseHathorLogs(JSON.parse(message.content.toString()));
            if (response) {
              channel.ack(message);
              return;
            }
            channel.reject(message, false);
          } catch (error) {
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
                channel.ack(message);
                return;
              }
            }
            channel.reject(message, false);
          }
        } else {
          this.logger.error('Consumer cancelled by server');
        }
      });
    } catch (error) {
      this.logger.error(error);
    }
  }

  private async listenToPubSubEventQueue() {
    const subscription = await this.getOrCreateSubscrition();

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
  }

  private async getOrCreateSubscrition(): Promise<Subscription> {
    const pubsub = new PubSub({ projectId: this.chainConfig.pubsubProjectId });

    const [subscriptions] = await pubsub.getSubscriptions();
    const subscriptionName = `projects/${this.chainConfig.pubsubProjectId}/subscriptions/hathor-federator-${this.chainConfig.multisigOrder}-sub`;
    const subscription = subscriptions.find((sub) => sub.name === subscriptionName);

    if (subscription && subscription.topic) {
      return subscription;
    }

    if (subscription) {
      await subscription.delete();
    }

    const topicName = `projects/${this.chainConfig.pubsubProjectId}/topics/hathor-federator-${this.chainConfig.multisigOrder}`;
    const [newSubscription] = await pubsub.createSubscription(topicName, subscriptionName, {
      ackDeadlineSeconds: 60,
      enableMessageOrdering: true,
      enableExactlyOnceDelivery: true,
      retryPolicy: {
        minimumBackoff: {
          seconds: 60,
        },
        maximumBackoff: {
          seconds: 120,
        },
      },
    });

    return newSubscription;
  }

  private async parseHathorLogs(event: any): Promise<boolean> {
    if (event.type !== 'wallet:new-tx') return true;

    const outUtxos = event.data.outputs.map(
      (o) =>
        new HathorUtxo(
          o.script,
          o.token,
          o.value,
          {
            type: o.decoded?.type,
            address: o.decoded?.address,
            timelock: o.decoded?.timelock,
          },
          o.spent_by,
        ),
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

    const isHathorToEvm = tx.haveCustomData();

    if (isHathorToEvm) {
      const broker = new HathorBroker(this.config, this.logger, this.bridgeFactory, this.federationFactory);

      const confirmed = await broker.isTxConfirmed(tx.tx_id);
      if (!confirmed) {
        return false;
      }

      const token = tx.getCustomTokenData();

      const isMulsigAddress = await broker.isMultisigAddress(token.receiverAddress);

      if (!isMulsigAddress) {
        throw Error('Not a multisig address.');
      }

      await broker.sendTokens(token.senderAddress, tx.getCustomData(), token.amount, token.tokenAddress, tx.tx_id);
      return true;
    }
  }
}

export default HathorService;
