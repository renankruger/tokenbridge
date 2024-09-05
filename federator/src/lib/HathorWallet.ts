import axios, { AxiosResponse } from 'axios';
import EventEmmiter from 'node:events';
import { HathorResponse, StatusResponse } from '../types/HathorResponseTypes';
import { LogWrapper } from './logWrapper';
import { ConfigChain } from './configChain';
import { ConfigData } from './config';

export type Wallet = {
  ready: boolean;
  lastCheck: Date;
};

export class HathorWallet {
  private static wallet: HathorWallet;

  private WALLET_STATUS_CONNECTING = 1;
  private WALLET_STATUS_SYNCING = 2;
  private WALLET_STATUS_READY = 3;

  public logger: LogWrapper;
  public chainConfig: ConfigChain;
  private wallets: Map<string, Wallet>;
  public walletEmmiter: EventEmmiter;

  private baseDelay = 10000;

  private constructor(config: ConfigData, logger: LogWrapper) {
    logger.info('New instance of the wallet class');
    this.walletEmmiter = new EventEmmiter();
    this.logger = logger;
    this.chainConfig = config.sidechain[0];
    this.wallets = new Map<string, Wallet>();
    this.wallets.set('multisig', { ready: false, lastCheck: new Date(0) });
    this.wallets.set('single', { ready: false, lastCheck: new Date(0) });
  }

  public static getInstance(config: ConfigData, logger: LogWrapper): HathorWallet {
    if (!HathorWallet.wallet) {
      HathorWallet.wallet = new HathorWallet(config, logger);
    }
    return HathorWallet.wallet;
  }

  public async areWalletsReady(): Promise<[boolean, EventEmmiter]> {
    const multisig = this.wallets.get('multisig');
    const single = this.wallets.get('single');
    const currentTime = new Date();
    const oneHourAgo = currentTime.getTime() - 10 * 60 * 1000;

    // The ideia is to do this asyncronously, but for some reason,
    // it is not working on the google cloud, so it stays syncronous for the time being
    if (multisig.lastCheck.getTime() < oneHourAgo || single.lastCheck.getTime() < oneHourAgo) {
      const multisigReady = await this.isReady(true);
      const singleReady = await this.isReady(false);
      return [multisigReady && singleReady, this.walletEmmiter];
    }

    if (multisig.ready && single.ready) {
      return [true, null];
    }

    return [false, this.walletEmmiter];
  }

  private setWalletReady(wallet: string) {
    this.wallets.set(wallet, { ready: true, lastCheck: new Date() });
    this.logger.info(`Setting ${wallet} wallet as ready`);
    if (this.wallets.get('multisig').ready && this.wallets.get('single').ready) {
      this.logger.info('All wallets are ready');
      this.logger.info(`From HathorWallet.ts, we have ${this.walletEmmiter.listenerCount('wallets-ready')} listeners`);
      this.walletEmmiter.emit('wallets-ready');
    }
  }

  private async isReady(multisig: boolean, retry = 1): Promise<boolean> {
    const id = multisig ? 'multi' : 'single';
    if (retry > 5) {
      this.logger.error(`Fail to start ${id} wallet: Maximum number of retries reached.`);
      return false;
    }
    this.logger.info(`Checking ${id} wallet status for the ${retry} time`);
    try {
      const response = await this.requestWallet<StatusResponse>(false, id, 'wallet/status');
      if (response.data.statusCode === this.WALLET_STATUS_READY) {
        this.logger.info(`${id} wallet is ready.`);
        this.setWalletReady(multisig ? 'multisig' : 'single');
        return true;
      }
      if ([this.WALLET_STATUS_CONNECTING, this.WALLET_STATUS_SYNCING].includes(response.data.statusCode)) {
        this.logger.info(`${id} wallet is ${response.data.statusMessage ?? response.data.message}.`);
        await this.delay(this.baseDelay * retry);
        return this.isReady(multisig, ++retry);
      }
      if (!response.data.success && response.data.statusMessage === '') {
        this.logger.info(`${id} wallet looks stopped.`);
        await this.start(multisig);
        await this.delay(this.baseDelay * retry);
        return this.isReady(multisig, ++retry);
      }
    } catch (error) {
      throw Error(`Fail to get status of ${id} wallet: ${error}`);
    }
  }

  private async start(multisig: boolean): Promise<boolean> {
    const id = multisig ? 'multi' : 'single';
    const seedKey = multisig ? this.chainConfig.multisigSeedKey : this.chainConfig.singleSeedKey;
    const data = {
      'wallet-id': id,
      seedKey: seedKey,
      multisig: multisig,
    };
    this.logger.info(`Trying to start ${id} wallet.`);
    try {
      const response = await this.requestWallet<HathorResponse>(true, id, 'start', data);
      return response.status == 200 && response.data.success;
    } catch (error) {
      throw Error(`Fail to start wallet: ${error}`);
    }
  }

  public async requestWallet<Type>(
    post: boolean,
    id: string,
    path: string,
    data?: any,
    params?: any,
  ): Promise<AxiosResponse<Type>> {
    const url = `${process.env.WALLET_URL}/${path}`;
    const config = {
      headers: {
        'Content-type': 'application/json',
        'x-api-key': process.env.HEADLESS_API_KEY,
        'x-wallet-id': id,
      },
      params: params,
    };

    try {
      if (post) return await axios.post<Type>(url, data, config);
      return await axios.get<Type>(url, config);
    } catch (error) {
      throw Error(`Fail to request to hathor wallet endpoint: ${error}`);
    }
  }

  private async delay(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }
}
