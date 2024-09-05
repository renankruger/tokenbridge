export class HathorException extends Error {
  /**
   * Extends a regular error an includes hathor specifc info
   */
  constructor(msg: string, originalMsg: string) {
    super(msg);
    Object.setPrototypeOf(this, HathorException.prototype);
    this.originalMessage = originalMsg;
  }

  private originalMessage: string;
  getOriginalMessage(): string {
    return this.originalMessage;
  }
}

export default HathorException;
