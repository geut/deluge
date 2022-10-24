/** @typedef {import('./timestamp-seq').TimestampSeq} TimestampSeq */

import varint from 'varint'
import b4a from 'b4a'

const DISTANCE_OFFSET = varint.encodingLength(Number.MAX_SAFE_INTEGER)

export class Packet {
  /**
   * @param {Deluge} getSeqnoGenerator
   * @param {Buffer} buf
   * @param {Buffer} from
   * @param {boolean} [copy=false]
   * @returns {Packet}
   */
  static createFromBuffer (getSeqnoGenerator, buf, from, copy = false) {
    if (buf.length < 32) return

    if (copy) {
      buf = b4a.from(buf)
    }

    let offset = 0
    const channel = varint.decode(buf, offset)
    offset += varint.decode.bytes
    const seqno = getSeqnoGenerator(channel)(buf, offset)
    offset += seqno._bytes
    const origin = buf.subarray(offset, offset + 32)
    offset += 32
    const distance = varint.decode(buf, offset)
    varint.encode(distance + 1, buf, offset)
    offset += DISTANCE_OFFSET
    const data = buf.subarray(offset)
    return new Packet({
      seqno,
      data,
      origin,
      channel,
      from,
      distance,
      buffer: buf
    })
  }

  /**
   * @constructor
   * @param {Object} opts
   * @param {TimestampSeq} opts.seqno
   * @param {Uint8Array} opts.data
   * @param {Buffer} opts.origin
   * @param {number} [opts.channel=0]
   * @param {Uint8Array} [opts.from]
   * @param {number} [opts.distance=0]
   * @param {Buffer} [opts.buffer]
   */
  constructor (opts) {
    const { seqno, data, origin, channel = 0, from, buffer, distance = 0 } = opts

    this._seqno = seqno
    this._data = data
    this._origin = origin
    this._channel = channel
    this._from = from
    this._distance = distance
    this._buffer = buffer
  }

  get deluge () {
    return this._deluge
  }

  get origin () {
    return this._origin
  }

  get data () {
    return this._data
  }

  get channel () {
    return this._channel
  }

  get seqno () {
    return this._seqno
  }

  get from () {
    return this._from
  }

  get distance () {
    return this._distance
  }

  /**
   * @type {boolean}
   */
  get initiator () {
    return !this._from
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
      this._str = `${this._origin.toString('hex')}/${this._seqno.toString()}`
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
    // channel<*> + seqno<*> + origin<32> + distance<MAX_SAFE_INTEGER> + data<*>
    const buf = b4a.allocUnsafe(varint.encodingLength(this._channel) + this._seqno.length + 32 + DISTANCE_OFFSET + this._data.length)
    varint.encode(this._channel, buf, offset)
    offset += varint.encode.bytes
    this._seqno.write(buf, offset)
    offset += this._seqno._bytes
    buf.set(this._origin, offset)
    offset += this._origin.length
    varint.encode(this._distance + 1, buf, offset)
    offset += DISTANCE_OFFSET
    buf.set(this._data, offset)
    return buf
  }
}
