/** @typedef {import('./timestamp-seq').TimestampSeq} TimestampSeq */

const varint = require('varint')
const { generator } = require('./timestamp-seq')

const generateSeqno = generator()

class Packet {
  /**
   * @param {Buffer} buf
   * @param {Buffer} from
   * @returns {Packet}
   */
  static createFromBuffer (buf, from) {
    if (buf.length < 32) return

    let offset = 0
    const channel = varint.decode(buf, offset)
    offset += varint.decode.bytes
    const seqno = generateSeqno(buf, offset)
    offset += seqno.bytes
    const origin = buf.slice(offset, offset + 32)
    offset += 32
    const data = buf.slice(offset)
    return new Packet({
      channel,
      seqno,
      origin,
      data,
      from,
      buffer: buf
    })
  }

  /**
   * @constructor
   * @param {Object} opts
   * @param {Buffer} opts.origin
   * @param {Uint8Array} opts.data
   * @param {number} [opts.channel=0]
   * @param {TimestampSeq} [opts.seqno]
   * @param {Buffer} [opts.buffer]
   */
  constructor (opts) {
    const { origin, data, channel = 0, seqno = generateSeqno(), from, buffer } = opts

    this.origin = origin
    this.data = data
    this.channel = channel
    this.seqno = seqno
    this.from = from
    this._buffer = buffer
  }

  /**
   * @type {boolean}
   */
  get initiator () {
    return this.from === undefined
  }

  /**
   * @type {Buffer}
   */
  get buffer () {
    if (!this._buffer) {
      this._buffer = this._encode()
    }

    return this._buffer
  }

  /**
   * Returns the unique ID serialized.
   *
   * @returns {string}
   */
  toString () {
    if (!this._str) {
      this._str = `${this.origin.toString('hex')}/${this.seqno.toString()}`
    }

    return this._str
  }

  /**
   * Encode packet into a buffer.
   *
   * @returns {Buffer}
   */
  _encode () {
    let offset = 0
    // channel<*> + seqno<*> + origin<32> + data<*>
    const buf = Buffer.allocUnsafe(varint.encodingLength(this.channel) + this.seqno.length + 32 + this.data.length)
    varint.encode(this.channel, buf, offset)
    offset += varint.encode.bytes
    this.seqno.write(buf, offset)
    offset += this.seqno.bytes
    buf.set(this.origin, offset)
    offset += this.origin.length
    buf.set(this.data, offset)
    return buf
  }
}

module.exports = Packet
