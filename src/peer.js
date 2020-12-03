/** @typedef {import('./packet')} Packet */

/**
 * @callback UnsubscribeFunction
 */

/**
 * @typedef Handler
 * @prop {(packet) => undefined} send
 * @prop {(data: Buffer) => UnsubscribeFunction} subscribe
 */

const { EventEmitter } = require('events')

class Peer extends EventEmitter {
  /**
   * @constructor
   * @param {Buffer} id
   * @param {Handler} handler
   */
  constructor (id, handler) {
    super()

    this.id = id
    this.idStr = id.toString('hex')
    this.handler = handler
  }

  /**
   * @returns {string}
   */
  toString () {
    if (!this._str) {
      this._str = this.id.toString('hex')
    }

    return this._str
  }

  /**
   * @param {Packet} packet
   */
  send (packet) {
    this.emit('send', packet)
    this.handler.send(packet)
  }

  /**
   * @param {(data: (Buffer|null)) => UnsubscribeFunction} next
   */
  subscribe (next, onSend) {
    this.on('send', onSend)
    const unsubscribe = this.handler.subscribe((buf) => next(this.id, buf))
    this._unsubscribe = () => {
      this.removeListener('send', onSend)
      if (unsubscribe) unsubscribe()
    }
  }

  unsubscribe () {
    if (this._unsubscribe) this._unsubscribe()
  }
}

module.exports = Peer
