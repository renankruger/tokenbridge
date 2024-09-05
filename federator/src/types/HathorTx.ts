import { HathorUtxo } from './HathorUtxo';

type Token = { tokenAddress: string; senderAddress: string; receiverAddress: string; amount: number };

export class HathorTx {
  tx_id: string;
  timestamp: string;
  inputs: HathorUtxo[];
  outputs: HathorUtxo[];
  parents: string[];

  constructor(id: string, timestamp: string, outputs: HathorUtxo[], inputs?: HathorUtxo[]) {
    this.tx_id = id;
    this.timestamp = timestamp;
    this.outputs = outputs;
    this.inputs = inputs;
  }

  haveCustomData(): boolean {
    return this.outputs.some((utxo) => utxo.haveCustomData);
  }

  getCustomData(): string {
    let customData = '';
    const dataOutputs = this.outputs.filter((output) => output.haveCustomData);
    dataOutputs.forEach((output) => {
      customData += output.customData.data;
    });
    return customData;
  }

  getCustomTokenData(): any {
    const tokenData = this.outputs.filter(
      (output) => output.token && output.spent_by == null && output.token !== '00' && output.decoded.type == 'MultiSig',
    );

    const tokens: Token[] = [];

    tokenData.forEach((data) => {
      const input = this.inputs.find((inpt) => inpt.token == data.token);

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
}

export default HathorTx;
