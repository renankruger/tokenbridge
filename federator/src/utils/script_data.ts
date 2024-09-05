/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

class ScriptData {
  // String of data to store on the script
  data: string;

  constructor(data: string) {
    if (!data) {
      throw Error('You must provide data.');
    }

    this.data = data;
  }
}

export default ScriptData;
