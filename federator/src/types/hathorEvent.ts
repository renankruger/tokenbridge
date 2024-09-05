export interface Event {
  type: string;
  walletId: string;
  data: Data;
  balance: Balance;
}

export interface Data {
  tx_id: string;
  version: number;
  weight: number;
  timestamp: string;
  is_voided: boolean;
  inputs: Input[];
  outputs: Output[];
  parents: string[];
}

export interface Input {
  value: number;
  token_data: number;
  script: string;
  decoded: Decoded;
  token: string;
  tx_id: string;
  index: number;
}

export interface Decoded {
  type: string;
  address: string;
  timelock: any;
}

export interface Output {
  value: number;
  token_data: number;
  script: string;
  decoded: Decoded2;
  token: string;
  spent_by?: string;
  type: string;
}

export interface Decoded2 {
  type?: string;
  address?: string;
  timelock: any;
}

export interface Balance {
  '00': N00;
}

export interface N00 {
  tokens: Tokens;
  authorities: Authorities;
}

export interface Tokens {
  locked: number;
  unlocked: number;
}

export interface Authorities {
  mint: Mint;
  melt: Melt;
}

export interface Mint {
  locked: number;
  unlocked: number;
}

export interface Melt {
  locked: number;
  unlocked: number;
}
