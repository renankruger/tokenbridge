import ScriptData from './script_data';
import _ from 'lodash';
import { OP_PUSHDATA1, OP_CHECKSIG } from './opcodes';

/**
 * Parse Data output script
 *
 * @param {Buffer} buff Output script
 *
 * @return {ScriptData} ScriptData object
 */
export const parseScriptData = (buff: Buffer): ScriptData => {
  // We should clone the buffer being sent in order to never mutate
  // what comes from outside the library
  const scriptBuf = _.clone(buff);
  if (scriptBuf.length < 2) {
    // At least 1 byte for len data and 1 byte for OP_CHECKSIG
    throw new Error('Invalid output script. Script must have at least 2 bytes.');
  }

  // The expected len will be at least 2 bytes
  // 1 for the script len and 1 for the OP_CHECKSIG in the end
  let expectedLen = 2;
  let dataBytesLen: number;

  // If we have OP_PUSHDATA1 as first byte, the second byte has the length of data
  // otherwise, the first byte already has the length of data
  if (scriptBuf[0] === OP_PUSHDATA1[0]) {
    expectedLen += 1;
    dataBytesLen = scriptBuf[1];
  } else {
    dataBytesLen = scriptBuf[0];
  }

  // Set the expected length
  expectedLen += dataBytesLen;

  if (expectedLen !== scriptBuf.length) {
    // The script has different qty of bytes than expected
    throw new Error(`Invalid output script. Expected len ${expectedLen} and received len ${scriptBuf.length}.`);
  }

  if (scriptBuf[expectedLen - 1] !== OP_CHECKSIG[0]) {
    // Last byte must be an OP_CHECKSIG
    throw new Error('Invalid output script. Last byte must be OP_CHECKSIG.');
  }

  // Get data from the script
  const data = getPushData(scriptBuf);
  let decodedData: string;

  try {
    decodedData = data.toString('utf-8');
  } catch (e) {
    throw new Error('Invalid output script. Error decoding data to utf-8.');
  }

  return new ScriptData(decodedData);
};

/**
 * Parse buffer to data decoding pushdata opcodes
 *
 * @param {Buffer} buff Buffer to get pushdata
 *
 * @return {Buffer} Data extracted from buffer
 */
export const getPushData = (buff: Buffer): Buffer => {
  // We should clone the buffer being sent in order to never mutate
  // what comes from outside the library
  const scriptBuf = _.clone(buff);

  if (scriptBuf.length === 0) {
    throw new Error('Invalid buffer.');
  }

  let lenData: any, start: number;

  if (scriptBuf[0] > 75) {
    lenData = scriptBuf[1];
    start = 2;
  } else {
    lenData = scriptBuf[0];
    start = 1;
  }
  return scriptBuf.slice(start, start + lenData);
};
