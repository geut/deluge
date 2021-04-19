const varint = require('varint')

class TimestampSeq {
  static createFromBuffer (buf, bufOffset = 0) {
    let bytes = 0
    const timestamp = varint.decode(buf, bufOffset)
    bytes += varint.decode.bytes
    const offset = varint.decode(buf, bufOffset + bytes)
    bytes += varint.decode.bytes
    const seq = new TimestampSeq(timestamp, offset)
    seq._bytes = bytes
    return seq
  }

  constructor (timestamp, offset) {
    this._timestamp = timestamp
    this._offset = offset
    this._bytes = 0
    this._length = 0
  }

  get timestamp () {
    return this._timestamp
  }

  get offset () {
    return this._offset
  }

  get bytes () {
    return this._bytes
  }

  get length () {
    if (!this._length) {
      this._length = varint.encodingLength(this._timestamp) + varint.encodingLength(this._offset)
    }

    return this._length
  }

  toString () {
    if (!this._str) {
      this._str = `${this._timestamp}/${this._offset}`
    }

    return this._str
  }

  write (buf, bufOffset = 0) {
    this._bytes = 0
    varint.encode(this._timestamp, buf, bufOffset)
    this._bytes += varint.encode.bytes
    varint.encode(this._offset, buf, bufOffset + this._bytes)
    this._bytes += varint.encode.bytes
    return buf
  }

  /**
   * Compare two TimestampSeq (self and value).
   *
   * Returns:
   *  - 0 if they are equals.
   *  - 1 if self is major than value
   *  - -1 if self is minor than value
   *
   * @param {TimestampSeq} value
   * @returns {number}
   */
  compare (value) {
    if (this._timestamp === value._timestamp) {
      if (this._offset === value._offset) return 0
      if (this._offset > value._offset) return 1
      return -1
    }
    if (this._timestamp > value._timestamp) return 1
    return -1
  }
}

/**
 * @callback GenerateCallback
 * @param {Buffer} buf
 * @param {number} offset
 * @returns {TimestampSeq}
 */

/**
 * @param {number} [limit=10000]
 * @returns {GenerateCallback}
 */
function generator (limit = 10000) {
  let timestamp = 0
  let globalOffset = 0

  function reset () {
    timestamp = Date.now()
    globalOffset = 0
  }

  reset()

  return function generate (buf, offset = 0) {
    if (buf) {
      return TimestampSeq.createFromBuffer(buf, offset)
    }

    if (globalOffset > limit) {
      reset()
    }

    return new TimestampSeq(timestamp, globalOffset++)
  }
}

module.exports = { generator, TimestampSeq }
