import * as script from '../utils/scripts';
import web3 from 'web3';

export class HathorUtxo {
  script: string;
  token: string;
  value: number;
  decoded: decodeInput;
  spent_by: string;

  customData?: CustomUtxoData;
  haveCustomData: boolean;

  constructor(script: string, token?: string, value?: number, decoded?: decodeInput, spent_by?: string) {
    this.script = script;
    this.token = token;
    this.value = value;
    this.decoded = decoded;
    this.spent_by = spent_by;
    this.haveCustomData = false;

    this.decodeScript();
  }

  private decodeScript() {
    const buffer = Buffer.from(this.script, 'base64');
    try {
      const decodedData = script.parseScriptData(buffer).data;
      this.customData = new CustomUtxoData(decodedData);
      this.haveCustomData = this.customData.hasData;
    } catch (error) {
      // If false, we don't have custom data. If true, an unexpected error ocurred, so we log it
      if (error.toString().indexOf('Invalid output script.') == -1) {
        console.log(error);
      }
      // Nothing else to do here, let's leave
      return;
    }
  }
}

class CustomUtxoData {
  data: string;
  hasData = false;

  constructor(decodedData: string) {
    if (web3.utils.isAddress(decodedData)) {
      this.data = decodedData;
      this.hasData = true;
    }
  }
}

interface decodeInput {
  type: string;
  address: string;
  timelock: any;
}

export default HathorUtxo;
