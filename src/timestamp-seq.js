const varint = require('varint')

class TimestampSeq {
  static createFromBuffer (buf, bufOffset = 0) {
    let bytes = 0
    const timestamp = varint.decode(buf, bufOffset)
    bytes += varint.decode.bytes
    const offset = varint.decode(buf, bufOffset + bytes)
    bytes += varint.decode.bytes
    const seq = new TimestampSeq(timestamp, offset)
    seq.bytes = bytes
    return seq
  }

  constructor (timestamp, offset) {
    this.timestamp = timestamp
    this.offset = offset
    this.bytes = 0
    this._length = 0
  }

  get length () {
    if (!this._length) {
      this._length = varint.encodingLength(this.timestamp) + varint.encodingLength(this.offset)
    }

    return this._length
  }

  toString () {
    if (!this._str) {
      this._str = `${this.timestamp}/${this.offset}`
    }

    return this._str
  }

  write (buf, bufOffset = 0) {
    this.bytes = 0
    varint.encode(this.timestamp, buf, bufOffset)
    this.bytes += varint.encode.bytes
    varint.encode(this.offset, buf, bufOffset + this.bytes)
    this.bytes += varint.encode.bytes
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
    if (this.timestamp === value.timestamp) {
      if (this.offset === value.offset) return 0
      if (this.offset > value.offset) return 1
      return -1
    }
    if (this.timestamp > value.timestamp) return 1
    return -1
  }
}

module.exports = function generator (limit = 10000) {
  let timestamp = 0
  let offset = 0

  function reset () {
    timestamp = Date.now()
    offset = 0
  }

  reset()

  return function generate (buf, bufOffset = 0) {
    if (buf) {
      return TimestampSeq.createFromBuffer(buf, bufOffset)
    }

    if (offset > limit) {
      reset()
    }

    return new TimestampSeq(timestamp, offset++)
  }
}
