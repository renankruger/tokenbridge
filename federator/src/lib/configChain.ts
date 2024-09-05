const DEFAULT_BLOCK_TIME_MS = 15000;
const DEFAULT_FROM_BLOCK = 0;

export interface ConfigChainParams {
  name: string;
  chainId: number;
  bridge?: string;
  allowTokens?: string;
  federation?: string;
  host?: string;
  testToken?: string;
  fromBlock?: number;
  blockTimeMs?: number;
  isHathor?: boolean;
  walletUrl?: string;
  walletKey?: string;
  singleWalletId?: string;
  singleSeedKey?: string;
  multisigWalletId?: string;
  multisigSeedKey?: string;
  multisigRequiredSignatures?: number;
  multisigOrder?: number;
  minimumConfirmations?: number;
  eventQueueType?: string;
  pubsubProjectId?: string;
}

export class ConfigChain {
  name: string;
  chainId: number;
  bridge?: string;
  allowTokens?: string;
  federation?: string;
  testToken?: string;
  host?: string;
  fromBlock: number;
  blockTimeMs: number;
  isHathor: boolean;
  walletUrl?: string;
  walletKey?: string;
  singleWalletId?: string;
  singleSeedKey?: string;
  multisigWalletId?: string;
  multisigSeedKey?: string;
  multisigRequiredSignatures?: number;
  multisigOrder?: number;
  minimumConfirmations?: number;
  eventQueueType?: string;
  pubsubProjectId?: string;

  constructor(chainConfig: ConfigChainParams) {
    this.name = chainConfig.name;
    this.chainId = chainConfig.chainId;
    this.bridge = chainConfig.bridge;
    this.federation = chainConfig.federation;
    this.allowTokens = chainConfig.allowTokens;
    this.host = chainConfig.host;
    this.testToken = chainConfig?.testToken;
    this.fromBlock = chainConfig?.fromBlock ?? DEFAULT_FROM_BLOCK;
    this.blockTimeMs = chainConfig?.blockTimeMs ?? DEFAULT_BLOCK_TIME_MS;
    this.isHathor = chainConfig?.isHathor ?? false;
    this.walletUrl = chainConfig?.walletUrl;
    this.walletKey = chainConfig?.walletKey;
    this.singleWalletId = chainConfig?.singleWalletId;
    this.singleSeedKey = chainConfig?.singleSeedKey;
    this.multisigWalletId = chainConfig?.multisigWalletId;
    this.multisigSeedKey = chainConfig?.multisigSeedKey;
    this.multisigRequiredSignatures = chainConfig?.multisigRequiredSignatures;
    this.multisigOrder = chainConfig?.multisigOrder;
    this.minimumConfirmations = chainConfig?.minimumConfirmations;
    this.eventQueueType = chainConfig?.eventQueueType;
    this.pubsubProjectId = chainConfig?.pubsubProjectId;
  }
}
