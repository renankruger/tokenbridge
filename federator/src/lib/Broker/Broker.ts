import Web3 from 'web3';
import { LogWrapper } from '../logWrapper';
import { ConfigData } from '../config';
import {
  Data,
  HathorException,
  DecodeResponse,
  GetConfirmationResponse,
  GetMySignatureResponse,
  TransactionTypes,
  SignAndPushResponse,
} from '../../types';
import {
  BridgeFactory,
  TokenFactory,
  ITokenV0,
  FederationFactory,
  IBridgeV4,
  IHathorFederationV1,
  HathorFederationFactory,
} from '../../contracts';
import { ConfigChain } from '../configChain';
import { HathorWallet } from '../HathorWallet';
import { TransactionSender } from '../TransactionSender';

const TOKEN_MELT_MASK = 0b00000010;
const TOKEN_MINT_MASK = 0b00000001;
const TOKEN_AUTHORITY_MASK = 0b10000000;

type Token = { tokenAddress: string; senderAddress: string; receiverAddress: string; amount: number };

export abstract class Broker {
  public logger: LogWrapper;
  public config: ConfigData;
  public bridgeFactory: BridgeFactory;
  public federationFactory: FederationFactory;
  private hathorFederationFactory: HathorFederationFactory;
  protected hathorFederationContract: IHathorFederationV1;
  private transactionSender: TransactionSender;
  protected chainConfig: ConfigChain;
  private wallet: HathorWallet;

  constructor(
    config: ConfigData,
    logger: LogWrapper,
    bridgeFactory: BridgeFactory,
    federationFactory: FederationFactory,
  ) {
    this.config = config;
    this.logger = logger;
    this.bridgeFactory = bridgeFactory;
    this.federationFactory = federationFactory;
    this.chainConfig = config.sidechain[0];

    this.web3ByHost = new Map<string, Web3>();
    this.transactionSender = new TransactionSender(
      this.getWeb3(process.env.HATHOR_STATE_CONTRACT_HOST_URL),
      this.logger,
      this.config,
    );

    this.wallet = HathorWallet.getInstance(this.config, this.logger);
    this.hathorFederationFactory = new HathorFederationFactory();
    this.hathorFederationContract = this.hathorFederationFactory.createInstance() as IHathorFederationV1;
  }

  public web3ByHost: Map<string, Web3>;

  getWeb3(host: string): Web3 {
    let hostWeb3 = this.web3ByHost.get(host);
    if (!hostWeb3) {
      hostWeb3 = new Web3(host);
      this.web3ByHost.set(host, hostWeb3);
    }
    return hostWeb3;
  }

  abstract validateTx(txHex: string, originalTxId: string, contractTxId: string): Promise<boolean>;
  abstract getSideChainTokenAddress(tokenAddress: string): Promise<[string, number]>;
  abstract sendEvmNativeTokenProposal(receiverAddress, amount, tokenAddress);
  abstract sendHathorNativeTokenProposal(receiverAddress, amount, tokenAddress);

  public async sendTokens(
    senderAddress: string,
    receiverAddress: string,
    amount: string,
    tokenAddress: string,
    txHash: string,
    transactionType: TransactionTypes,
    isTokenEvmNative: boolean,
  ) {
    const transactionId = await this.hathorFederationContract.getTransactionId(
      tokenAddress,
      txHash,
      amount,
      senderAddress,
      receiverAddress,
      transactionType,
    );

    const isProcessed = await this.hathorFederationContract.isProcessed(transactionId);

    if (isProcessed) {
      return;
    }

    const isSigned = await this.hathorFederationContract.isSigned(transactionId, process.env.FEDERATOR_ADDRESS);

    if (isSigned) {
      const txHex = await this.hathorFederationContract.transactionHex(transactionId);
      await this.pushProposal(
        txHex,
        transactionId,
        tokenAddress,
        txHash,
        amount,
        senderAddress,
        receiverAddress,
        transactionType,
        transactionId,
      );
      return;
    }

    const isProposed = await this.hathorFederationContract.isProposed(transactionId);

    if (isProposed) {
      // the transaction if proposed but not signed
      const txHex = await this.hathorFederationContract.transactionHex(transactionId);
      await this.signProposal(
        tokenAddress,
        txHash,
        amount,
        senderAddress,
        receiverAddress,
        transactionType,
        txHex,
        transactionId,
      );
      return;
    }

    const txHex = isTokenEvmNative
      ? await this.sendEvmNativeTokenProposal(receiverAddress, amount, tokenAddress)
      : await this.sendHathorNativeTokenProposal(receiverAddress, amount, tokenAddress);

    this.sendProposal(
      tokenAddress,
      txHash,
      amount,
      senderAddress,
      receiverAddress,
      transactionType,
      txHex,
      transactionId,
    );
  }

  private async sendProposal(
    tokenAddress,
    transactionHash,
    value,
    sender,
    receiver,
    transactionType,
    txHex,
    contractTxId,
  ) {
    if (!(await this.validateTx(txHex, transactionHash, contractTxId))) {
      throw new HathorException('Invalid tx', 'Invalid tx');
    }
    const sendProposalArgs = await this.hathorFederationContract.getSendTransactionProposalArgs(
      tokenAddress,
      transactionHash,
      value,
      sender,
      receiver,
      transactionType,
      txHex,
    );
    const receipt = await this.transactionSender.sendTransaction(
      process.env.HATHOR_STATE_CONTRACT_ADDR,
      sendProposalArgs,
      0,
      this.config.privateKey,
    );

    if (!receipt) {
      this.logger.error(`Failed to send proposal for transaction ${transactionHash}`);
    }
  }

  private async signProposal(
    tokenAddress,
    transactionHash,
    amount,
    senderAddress,
    receiverAddress,
    transactionType,
    txHex,
    contractTxId,
  ) {
    if (!(await this.validateTx(txHex, transactionHash, contractTxId))) {
      throw new HathorException('Invalid tx', 'Invalid tx');
    }
    const signature = await this.getMySignatures(txHex);

    const args = await this.hathorFederationContract.getUpdateSignatureStateArgs(
      tokenAddress,
      transactionHash,
      amount,
      senderAddress,
      receiverAddress,
      transactionType,
      signature,
      true,
    );

    const receipt = await this.transactionSender.sendTransaction(
      process.env.HATHOR_STATE_CONTRACT_ADDR,
      args,
      0,
      this.config.privateKey,
    );

    if (!receipt.status) {
      this.logger.error(`Sending tokens from evm to hathor failed`, receipt);
    }
  }

  private async pushProposal(
    txHex: string,
    transactionId: string,
    tokenAddress,
    transactionHash,
    amount,
    senderAddress,
    receiverAddress,
    transactionType,
    contractTxId,
  ) {
    const arrayLength = await this.hathorFederationContract.getSignatureCount(transactionId);

    if (arrayLength < process.env.HEADLESS_MULTISIG_SEED_DEFAULT_NUM_SIGNATURES) return;

    if (!(await this.validateTx(txHex, transactionHash, contractTxId))) {
      throw new HathorException('Invalid tx', 'Invalid tx');
    }
    const signatures = await this.getSignaturesFromArray(transactionId);

    let txId;

    try {
      txId = await this.hathorPushProposal(txHex, signatures);
    } catch (error) {
      if (error instanceof HathorException) {
        const exception = error as HathorException;
        if (
          exception.getOriginalMessage() === 'Invalid transaction. At least one of your inputs has already been spent.'
        ) {
          txId = '4d616e75616c20436865636b205472616e73616374696f6e0000000000000000';
        }
      }
    }

    const args = await this.hathorFederationContract.getUpdateTransactionStateArgs(
      tokenAddress,
      transactionHash,
      amount,
      senderAddress,
      receiverAddress,
      transactionType,
      true,
      txId,
    );

    const receipt = await this.transactionSender.sendTransaction(
      process.env.HATHOR_STATE_CONTRACT_ADDR,
      args,
      0,
      this.config.privateKey,
    );

    if (!receipt.status) {
      this.logger.error(`Sending tokens from evm to hathor failed`, receipt);
    }
  }

  private async hathorPushProposal(txHex: string, signatures: string[]): Promise<string> {
    const data = {
      txHex: `${txHex}`,
      signatures: signatures,
    };
    const response = await this.wallet.requestWallet<SignAndPushResponse>(
      true,
      'multi',
      'wallet/p2sh/tx-proposal/sign-and-push',
      data,
    );

    if (response.status != 200 || !response.data.success) {
      const fullMessage = `${response.status} - ${response.statusText} - ${JSON.stringify(response.data)}`;
      throw new HathorException(fullMessage, response.data.error);
    }

    const result = response.data;
    this.logger.info(`Sign and Push result: ${JSON.stringify(result)}`);

    return result.hash;
  }

  async isTxConfirmed(transactionId: string): Promise<boolean> {
    const confirmations = await this.getTransactionConfirmation(transactionId);
    //so every federator has to wait more than the last one.
    const expectedConfirmations = this.chainConfig.minimumConfirmations * this.chainConfig.multisigOrder;
    const confirmed = confirmations >= expectedConfirmations;
    if (!confirmed) {
      this.logger.info(
        `Not enough confirmations for tx ${transactionId}. Expected ${expectedConfirmations} had ${confirmations}`,
      );
    }
    return confirmed;
  }

  protected async getTransactionConfirmation(transactionId: string): Promise<number> {
    try {
      const response = await this.wallet.requestWallet<GetConfirmationResponse>(
        false,
        'multi',
        'wallet/tx-confirmation-blocks',
        null,
        { id: transactionId },
      );
      if (response.status == 200 && response.data.success) {
        return response.data.confirmationNumber;
      }

      throw Error(`${response.status} - ${response.data}`);
    } catch (error) {
      throw new HathorException(`Fail to getTransactionConfirmation`, error);
    }
  }

  protected async getTransaction(transactionId: string): Promise<boolean | Data> {
    try {
      const response = await this.wallet.requestWallet<any>(false, 'multi', 'wallet/transaction', null, {
        id: transactionId,
      });

      if (response.data.error) {
        return false;
      }

      if (response.status == 200 && response.data) {
        return response.data as Data;
      }
    } catch (error) {
      throw new HathorException(`Fail to getTransaction`, error);
    }
  }

  protected async getTokenDecimals(tokenAddress: string, originalChainId: number): Promise<number> {
    const tokenFactory = new TokenFactory();
    if (originalChainId == this.config.sidechain[0].chainId) {
      const bridge = (await this.bridgeFactory.createInstance(this.config.mainchain)) as IBridgeV4;
      tokenAddress = await bridge.sideTokenByOriginalToken(originalChainId, tokenAddress);
    }
    const tokenContract = (await tokenFactory.createInstance(this.config.mainchain, tokenAddress)) as ITokenV0;
    return await tokenContract.getDecimals();
  }

  protected async decodeTxHex(txHex: string): Promise<Data> {
    try {
      const response = await this.wallet.requestWallet<DecodeResponse>(true, 'multi', 'wallet/decode', {
        txHex: txHex,
      });
      if (response.status == 200 && response.data.success) {
        return response.data.tx;
      }

      throw Error(`${response.status} - ${response.data}`);
    } catch (error) {
      throw Error(`Error on decodeTxHex: ${error}`);
    }
  }

  private async getMySignatures(txHex: string) {
    try {
      const response = await this.wallet.requestWallet<GetMySignatureResponse>(
        true,
        'multi',
        'wallet/p2sh/tx-proposal/get-my-signatures',
        { txHex: txHex },
      );
      if (response.status == 200 && response.data.success) {
        return response.data.signatures;
      }

      throw Error(`${response.status} - ${response.data}`);
    } catch (error) {
      throw Error(`Fail to getMySignature: ${error}`);
    }
  }

  private async getSignaturesFromArray(transactionId: string): Promise<string[]> {
    const arrayLength = await this.hathorFederationContract.getSignatureCount(transactionId);
    const signatures = [];

    for (let i = 0; i < arrayLength; ++i) {
      const signature = await this.hathorFederationContract.transactionSignatures(transactionId, i);
      signatures.push(signature);
    }

    return signatures;
  }

  protected convertToHathorDecimals(originalQtd: string, tokenDecimals: number): number {
    const hathorPrecision = tokenDecimals - 2;
    return Math.floor(Number.parseInt(originalQtd) * Math.pow(10, -hathorPrecision));
  }

  protected sumByAddressAndToken(transactions) {
    const result = {};
    transactions.forEach((txn) => {
      const address = txn.decoded.address;
      const token = txn.token;
      const key = `${address}:${token}`;
      if (!result[key]) {
        result[key] = 0;
      }
      result[key] += txn.value;
    });
    return result;
  }

  protected checkOutputs(tx: Data, multiSigAddress: string, receiverAddress: string): boolean {
    return tx.outputs.every((output) => {
      const address = output.decoded.address;
      return address === multiSigAddress || address === receiverAddress;
    });
  }

  getCustomTokenData(inputs, outputs): any {
    const tokenData = outputs.filter(
      (output) => output.token && output.spent_by == null && output.token !== '00' && output.decoded.type == 'MultiSig',
    );

    const tokens: Token[] = [];

    tokenData.forEach((data) => {
      const input = inputs.find((inpt) => inpt.token == data.token);

      if (tokens.find((t) => t.tokenAddress != data.token || t.receiverAddress != data.decoded.address) != undefined) {
        throw Error('Invalid transaction, it has more than one token or destination address.');
      }

      if (tokens.length == 0) {
        tokens.push({
          tokenAddress: data.token,
          senderAddress: input.decoded.address,
          receiverAddress: data.decoded.address,
          amount: 0,
        });
      }

      tokens[0].amount += data.value;
    });
    return tokens[0];
  }

  validateTokensOutput(outputs) {
    const tokenData = outputs.filter(
      (output) => output.token && output.spent_by == null && output.token !== '00' && output.decoded.type == 'MultiSig',
    );

    const tokens: Token[] = [];

    tokenData.forEach((data) => {
      if (tokens.find((t) => t.tokenAddress != data.token || t.receiverAddress != data.decoded.address) != undefined) {
        throw Error('Invalid transaction, it has more than one token or destination address.');
      }
    });
  }

  validateOutputReceiver(outputs) {
    const tokenData = outputs.filter(
      (output) => output.token && output.spent_by == null && output.token !== '00' && output.decoded.type != 'MultiSig',
    );

    const tokens: Token[] = [];

    tokenData.forEach((data) => {
      if (tokens.find((t) => t.tokenAddress != data.token || t.receiverAddress != data.decoded.address) != undefined) {
        throw Error('Invalid transaction, it has more than one token or destination address.');
      }
    });
  }

  /**
   * @param {IHistoryTx} tx
   */
  public getTransactionInfo(tx) {
    /** @type {Record<string, number>} */
    const balances = {};
    /** @type {Record<string, boolean>} */
    const canMint = {};
    /** @type {Record<string, boolean>} */
    const canMelt = {};
    for (const output of tx.outputs) {
      if (this.isAuthority(output.token_data)) {
        continue;
      }
      balances[output.token] = (balances[output.token] ?? 0) + output.value;
    }

    for (const input of tx.inputs) {
      if (this.isAuthority(input.token_data)) {
        if (this.isMint(input.token_data, input.value)) {
          canMint[input.token] = true;
        } else if (this.isMelt(input.token_data, input.value)) {
          canMelt[input.token] = true;
        }
        continue;
      }
      balances[input.token] = (balances[input.token] ?? 0) - input.value;
    }

    return { balances: balances, canMelt: canMelt, canMint: canMint };
  }

  /**
   * Check if the output is an authority output
   *
   * @param {Pick<HistoryTransactionOutput, 'token_data'>} output An output with the token_data field
   * @returns {boolean} If the output is an authority output
   */
  isAuthority(token_data: number): boolean {
    return (token_data & TOKEN_AUTHORITY_MASK) > 0;
  }

  /**
   * Check if the output is a mint authority output
   *
   * @param {Pick<HistoryTransactionOutput, 'token_data'|'value'>} output An output with the token_data and value fields
   * @returns {boolean} If the output is a mint authority output
   */
  isMint(token_data: number, value: number): boolean {
    return this.isAuthority(token_data) && (value & TOKEN_MINT_MASK) > 0;
  }

  /**
   * Check if the output is a melt authority output
   *
   * @param {Pick<HistoryTransactionOutput, 'token_data'|'value'>} output An output with the token_data and value fields
   * @returns {boolean} If the output is a melt authority output
   */
  isMelt(token_data: number, value: number): boolean {
    return this.isAuthority(token_data) && (value & TOKEN_MELT_MASK) > 0;
  }
}
