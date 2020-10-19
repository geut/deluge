/**
 * @typedef {import('./packet')} Packet
 * @typedef {import('./peer')} Peer
 */

/**
 * @callback FilterCallback
 * @param {Peer} peer
 * @param {Packet} packet
 * @returns {boolean}
 */

const { EventEmitter } = require('events')
const crypto = require('crypto')
const LRU = require('tiny-lru')
const assert = require('nanocustomassert')

const Peer = require('./peer')
const Packet = require('./packet')

/**
 * @callback OnPeer
 * @param {Buffer} id
 * @param {Peer.Handler} handler
 * @returns {Peer}
 */

/** @type {OnPeer} */
const peerCallback = (id, handler) => new Peer(id, handler)

class Deluge extends EventEmitter {
  /**
   * @constructor
   * @param {object} [opts]
   * @param {Buffer} opts.id
   * @param {number} opts.maxAge
   * @param {number} opts.maxSize
   * @param {FilterCallback} opts.filter
   */
  constructor (opts = {}) {
    super()

    const { id = crypto.randomBytes(32), maxAge = 10 * 1000, maxSize = 1000, filter = () => true, onPeer = peerCallback } = opts

    /** @type {Buffer} */
    this.id = id
    /** @type {LRU} */
    this._seenSeqs = LRU(maxSize, maxAge)
    /** @type {Map} */
    this._peers = new Map()
    /** @type {FilterCallback} */
    this._filter = filter
    /** @type {OnPeer} */
    this._onPeer = onPeer

    this._readPacket = this._readPacket.bind(this)
  }

  /**
   * @type {Array<Peer>}
   */
  get peers () {
    return Array.from(this._peers.values())
  }

  /**
   * @param {FilterCallback} filter
   */
  setFilter (filter) {
    this._filter = filter
  }

  /**
   * @param {OnPeer} onPeer
   */
  setOnPeer (onPeer) {
    this._onPeer = onPeer
  }

  /**
   * @param {Buffer} id
   * @returns {Peer|undefined}
   */
  getPeer (id) {
    return this._peers.get(id.toString('hex'))
  }

  /**
   * @param {Buffer} id
   * @param {Peer.Handler} handler
   * @returns {Peer}
   */
  addPeer (id, handler) {
    assert(Buffer.isBuffer(id) && id.length === 32, 'id must be a buffer of 32 bytes')
    assert(handler.send, 'handler.send is required')
    assert(handler.subscribe, 'handler.subscribe is required')

    const idStr = id.toString('hex')

    // delete previous peer if exists
    if (this._peers.has(idStr)) {
      this.deletePeer(id)
    }

    const peer = this._onPeer(id, handler)
    this._peers.set(idStr, peer)
    peer.subscribe(this._readPacket, (packet) => {
      this.emit('send', packet)
    })
    this.emit('peer-added', peer)
  }

  /**
   * @param {Buffer} id
   */
  deletePeer (id) {
    assert(Buffer.isBuffer(id) && id.length === 32, 'id must be a buffer of 32 bytes')

    const idStr = id.toString('hex')
    if (!this._peers.has(idStr)) return
    const peer = this._peers.get(idStr)
    this._peers.delete(id)
    peer.unsubscribe()
    this.emit('peer-deleted', peer)
  }

  /**
   * Broadcast a flooding message into the network.
   *
   * @param {number} channel
   * @param {Buffer} data
   * @returns {Packet}
   */
  send (channel, data) {
    const packet = new Packet({ channel, origin: this.id, data })
    this._publish(packet)
    return packet
  }

  /**
   * Update internal cache options
   *
   * @param {{ maxAge: number, maxSize: number }} opts
   */
  updateCache (opts = {}) {
    if (opts.maxAge) {
      this._seenSeqs.ttl = opts.maxAge
    }

    if (opts.maxSize) {
      this._seenSeqs.max = opts.maxSize
    }
  }

  /**
   * Prune the internal cache items in timeout
   */
  pruneCache () {
    const time = Date.now()
    for (const item of Object.values(this._seenSeqs.items)) {
      if (this._seenSeqs.ttl > 0 && item.expiry <= time) {
        this._seenSeqs.delete(item.key)
      }
    }
  }

  /**
   * @param {Packet} packet
   */
  _publish (packet) {
    this.peers
      .filter(peer => {
        // don't send the message to the origin
        if (packet.origin.equals(peer.id)) return false

        // don't send the message back to the sender
        if (!packet.initiator && packet.from.equals(peer.id)) return false

        return this._filter(peer, packet)
      })
      .forEach(peer => {
        peer.send(packet)
      })
  }

  /**
   * @param {Buffer} buf
   * @param {Buffer} from
   * @returns {(Packet|undefined)}
   */
  _readPacket (buf, from) {
    const packet = Packet.createFromBuffer(buf, from)
    if (!packet) return

    // Ignore packets produced by me and forwarded by others
    if (packet.origin.equals(this.id)) return

    const packetId = packet.toString()

    // Check if I already see this packet.
    if (this._seenSeqs.get(packetId)) return
    this._seenSeqs.set(packetId, 1)

    this.emit('packet', packet)
    this._publish(packet)
    return packet
  }
}

module.exports = Deluge
