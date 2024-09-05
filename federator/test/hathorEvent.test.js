const hathorTx = require("../src/types/HathorTx");
const hathorUtxo = require("../src/types/HathorUtxo");
const HathorService = require("../src/lib/HathorService");

const logger = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};
const config = {
  sidechain: []
}

describe("Hathor Tx Data tests", () => {
  beforeEach(async function () {
    jest.clearAllMocks();
    config.sidechain.push({});
  });

  it("Should check if can read translate partial outputs", () => {
    const encodedData =
      "TFNoZXgyMzE0ODUyMGQzNmFiZTRmYWM2YmEzYjE4NWI4ZWRkYmU1OTVlYWFmMzNiNzg3NDAzMGJhMjQzNjVjOWZmZjY1NTUzMGQ4MDAwMDAwMDAwMKw";
    let utxo = new hathorUtxo.default(encodedData);
    const translatedData = utxo.customData;
    const decodedData = {
      dataType: "hex",
      index: 2,
      length: 3,
      data: "148520d36abe4fac6ba3b185b8eddbe595eaaf33b7874030ba24365c9fff655530d80000000000",
    };

    expect(translatedData).toEqual(decodedData);
  });

  it("Should check if can find a txHex in a tx", async () => {
    const jsonTx = require("./resources/tx-example.json");
    const utxos = jsonTx.data.outputs.map(
      (o) => new hathorUtxo.default(o.script, o.token, o.value, {
          type: o.decoded?.type,
          address: o.decoded?.address,
          timelock: o.decoded?.timelock,
        })
    );
    let tx = new hathorTx.default(
      jsonTx.data.tx_id,
      jsonTx.data.timestamp,
      utxos
    );
    const hasTx = tx.haveCustomData("hex");
    expect(hasTx).toEqual(true);
  });

  it("Should not find a txHex in a tx", async () => {
    const jsonTx = require('./resources/tx-without-hex-example.json');
    const utxos = jsonTx.data.outputs.map(
      (o) =>
        new hathorUtxo.default(o.script, o.token, o.value, {
          type: o.decoded?.type,
          address: o.decoded?.address,
          timelock: o.decoded?.timelock,
        })
    );
    let tx = new hathorTx.default(
      jsonTx.data.tx_id,
      jsonTx.data.timestamp,
      utxos
    );
    const hasTx = tx.haveCustomData("hex");
    expect(hasTx).toEqual(false);
  });

  it("Should return a complete txHex", async () => {
    const hex =
      "0001010202000001f8107c19b57397acb4d44d66208015b6c0eb6cbc3c46651c6fc1e43cdd00000448b416622900b24325fa9279ffcadb2805a013eae700ad488ad7cfaa6c00000000000f481f2421a04d5021d31cb5834a267766929d0b557e300dd43f85b5cc2b02000000000001010017a9148895e0b178ffd7e2ddf4d5346d2d3c83b506bf9d8700000001810017a9148520d36abe4fac6ba3b185b8eddbe595eaaf33b7874030ba24365c9fff655530d80000000000";

    const jsonTx = require('./resources/tx-example.json');
    const utxos = jsonTx.data.outputs.map(
      (o) => new hathorUtxo.default(o.script, o.token, o.value, {
          type: o.decoded?.type,
          address: o.decoded?.address,
          timelock: o.decoded?.timelock,
        })
    );
    let tx = new hathorTx.default(
      jsonTx.data.tx_id,
      jsonTx.data.timestamp,
      utxos
    );
    expect(tx.getCustomData('hex')).toEqual(hex);
  });

  it("Should correctly convert evm token decimals to hathor", async () => {
      let wallet = new HathorService.default(config, logger, {});
      let originWithDecimals = "200000000000000"; 
      expect(wallet.convertToHathorDecimals(originWithDecimals, 18)).toEqual(0);

      originWithDecimals = "80000000000000000"; 
      expect(wallet.convertToHathorDecimals(originWithDecimals, 18)).toEqual(8);

      originWithDecimals = "3025000000000000000"; 
      expect(wallet.convertToHathorDecimals(originWithDecimals, 18)).toEqual(302);
  });

  it("Should correctly convert hathor token decimals to evm", async () => {
      let wallet = new HathorService.default(config, logger, {});

      let originWithDecimals = 8; 
      expect(wallet.convertToEvmDecimals(originWithDecimals, 18)).toEqual("80000000000000000");

      originWithDecimals = 302; 
      expect(wallet.convertToEvmDecimals(originWithDecimals, 18)).toEqual("3020000000000000000");
  });

  it("Should find a custom address in a tx", async () => {
    const jsonTx = require("./resources/tx-transfer-to-evm.json");
    const outUtxos = jsonTx.data.outputs.map(
      (o) =>
        new hathorUtxo.default(o.script, o.token, o.value, {
          type: o.decoded?.type,
          address: o.decoded?.address,
          timelock: o.decoded?.timelock,
        })
    );
    const inUtxos = jsonTx.data.inputs.map(
      (i) =>
        new hathorUtxo.default(i.script, i.token, i.value, {
          type: i.decoded.type,
          address: i.decoded.address,
          timelock: i.decoded.timelock,
        })
    );
    let tx = new hathorTx.default(
      jsonTx.data.tx_id,
      jsonTx.data.timestamp,
      outUtxos,
      inUtxos
    );
    const hasTx = tx.haveCustomData("addr");
    expect(hasTx).toEqual(true);
  });

  it("Should get receiver adress from a tx", async () => {
    const jsonTx = require("./resources/tx-transfer-to-evm.json");
    const outUtxos = jsonTx.data.outputs.map(
      (o) => new hathorUtxo.default(o.script, o.token, o.value)
    );
    const inUtxos = jsonTx.data.inputs.map(
      (i) =>
        new hathorUtxo.default(i.script, i.token, i.value, {
          type: i.decoded.type,
          address: i.decoded.address,
          timelock: i.decoded.timelock,
        })
    );
    let tx = new hathorTx.default(
      jsonTx.data.tx_id,
      jsonTx.data.timestamp,
      outUtxos,
      inUtxos
    );
    const senderAddress = tx.getCustomData("addr");
    expect(senderAddress).toEqual("0xE23d59ef0c1F63B53234b00a1e1EaBEf822397D2");
  });

  it("Should get hathor token data from a tx", async () => {
    const jsonTx = require("./resources/tx-transfer-to-evm.json");
    const outUtxos = jsonTx.data.outputs.map(
      (o) =>
        new hathorUtxo.default(o.script, o.token, o.value, {
          type: o.decoded.type,
          address: o.decoded.address,
          timelock: o.decoded.timelock,
        })
    );
    const inUtxos = jsonTx.data.inputs.map(
      (i) =>
        new hathorUtxo.default(i.script, i.token, i.value, {
          type: i.decoded.type,
          address: i.decoded.address,
          timelock: i.decoded.timelock,
        })
    );
    let tx = new hathorTx.default(
      jsonTx.data.tx_id,
      jsonTx.data.timestamp,
      outUtxos,
      inUtxos
    );
    const tokenData = tx.getCustomTokenData()[0];
    expect(tokenData).toEqual({
      value: 1,
      token: "000001f8107c19b57397acb4d44d66208015b6c0eb6cbc3c46651c6fc1e43cdd",
      sender: "WjTMMX5Rs8oinnpRQfyMuxFYYaPWEPSRPm",
    });
  });
});
