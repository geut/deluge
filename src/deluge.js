/**
 * @typedef {import('./packet')} Packet
 * @typedef {import('./peer')} Peer
 */

/**
 * @callback OnPeerCallback
 * @param {Buffer} id
 * @param {Peer.Handler} handler
 * @returns {Peer}
 */

/**
 * @callback OnPacketCallback
 * @param {Packet} packet
 * @returns {Promise<boolean>}
 */

/**
 * @callback OnSendCallback
 * @param {Packet} packet
 * @param {Peer} peer
 * @returns {Promise<boolean>}
 */

/**
 * @typdef PeerReference
 * @prop {Buffer} id
 */

const { Duplex } = require('streamx')
const crypto = require('crypto')
const assert = require('nanocustomassert')
const { NanoresourcePromise } = require('nanoresource-promise/emitter')
const nextTick = require('proc-nexttick')

const Peer = require('./peer')
const Packet = require('./packet')

/** @type {OnPeerCallback} */
const peerCallback = (id, handler) => new Peer(id, handler)
const pass = () => true
const byteLength = (packet) => packet.buffer.byteLength

class Deluge extends NanoresourcePromise {
  /**
   * @constructor
   * @param {Object} [opts]
   * @param {OnPeerCallback} [onPeer]
   * @param {OnPacketCallback} [onPacket]
   * @param {OnSendCallback} [onSend]
   */
  constructor (opts = {}) {
    const { onPeer = peerCallback, onPacket = pass, onSend = pass } = opts

    super()

    /** @type {Buffer|null} */
    this.id = null
    /** @type {Map} */
    this._peers = new Map()
    /** @type {OnPeerCallback} */
    this._onPeer = onPeer
    /** @type {Set<Duplex>} */
    this._streams = new Set()
    this._error = null

    this.onPacket(onPacket)
    this.onSend(onSend)

    this._readPacket = this._readPacket.bind(this)
    this._readPacketStream = this._readPacketStream.bind(this)
  }

  /**
   * @type {Array<Peer>}
   */
  get peers () {
    return Array.from(this._peers.values())
  }

  /**
   * @returns {Promise}
   */
  async ready () {
    if (this.closing || this.closed) throw new Error('deluge closed')
    if (this.opened) return null
    return new Promise((resolve, reject) => {
      const onOpen = () => {
        this.removeListener('opening-error', onError)
        resolve()
      }
      const onError = (err) => {
        this.removeListener('opened', onOpen)
        reject(err)
      }
      this.once('opening-error', onError)
      this.once('opened', onOpen)
    })
  }

  /**
   * @param {Buffer} [id]
   * @returns {Promise}
   */
  open (id = crypto.randomBytes(32)) {
    this.id = id
    return super.open().catch(err => {
      this.emit('opening-error', err)
      throw err
    })
  }

  /**
   * @param {OnPeerCallback} callback
   */
  onPeer (callback) {
    this._onPeer = callback
  }

  /**
   * @param {OnPacketCallback} callback
   */
  onPacket (callback) {
    this._onPacket = async (packet) => callback(packet)
  }

  /**
   * @param {OnSendCallback} callback
   */
  onSend (callback) {
    this._onSend = async (packet, peer) => callback(packet, peer)
  }

  /**
   * @param {Buffer|String} key
   * @returns {Peer|undefined}
   */
  getPeer (key) {
    return this._peers.get(key)
  }

  /**
   * @param {Buffer|String} key
   * @param {Peer.Handler} handler
   * @returns {Promise<Peer>}
   */
  async addPeer (key, handler) {
    await this.ready()

    let id = key
    if (typeof key === 'string') {
      id = Buffer.from(key, 'hex')
    }

    assert(id && Buffer.isBuffer(id) && id.length === 32, 'key must be a buffer of 32 bytes or a valid hexadecimal string of 32 bytes')
    assert(handler.send, 'handler.send is required')
    assert(handler.subscribe, 'handler.subscribe is required')

    // delete previous peer if exists
    if (this._peers.has(key)) {
      this.deletePeer(key)
    }

    const peer = this._onPeer(id, handler)
    this._peers.set(key, peer)
    peer.subscribe(this._readPacket, (packet) => {
      this.emit('send', packet)
    })
    this.emit('peer-added', peer)
    return peer
  }

  /**
   * @param {Buffer|String} key
   * @returns {Promise}
   */
  async deletePeer (key) {
    await this.ready()

    if (!this._peers.has(key)) return
    const peer = this._peers.get(key)
    this._peers.delete(key)
    peer.unsubscribe()
    this.emit('peer-deleted', peer)
  }

  /**
   * Broadcast a flooding message into the network.
   *
   * @param {number} channel
   * @param {Buffer} data
   * @returns {Packet|undefined}
   */
  send (channel, data) {
    if (!this.opened || this.closing || this.closed) return

    const packet = new Packet({ channel, origin: this.id, data })
    this._publish(packet)
    return packet
  }

  /**
   * Create a new Duplex Streamx
   *
   * @param {Object} opts
   * @returns {Duplex}
   */
  createDuplexStream (opts = {}) {
    if (this.closing || this.closed) {
      throw new Error('deluge is closed')
    }

    const stream = new Duplex({
      ...opts,
      byteLength,
      open: (cb) => {
        this.ready()
          .then(() => cb(null))
          .catch(cb)
      },
      write: (data, cb) => {
        if (stream.destroying || stream.destroyed) return cb(null)
        if (!data) return cb(null)
        nextTick(() => this.send(data.channel || 0, data.data || data))
        cb(null)
      },
      destroy: (cb) => {
        this._streams.delete(stream)
        cb(null)
      }
    })

    this._streams.add(stream)
    return stream
  }

  _open () {
    this.on('packet', this._readPacketStream)
  }

  async _close () {
    this.removeListener('packet', this._readPacketStream)

    this._peers.forEach(peer => {
      peer.unsubscribe()
    })
    this._peers.clear()

    await Promise.all(Array.from(this._streams.values()).map(stream => {
      if (stream.destroyed) return null
      stream.push(null)
      stream.destroy()
      return new Promise(resolve => {
        stream.once('close', resolve)
      })
    }))
    this._streams.clear()
  }

  _readPacketStream (packet) {
    this._streams.forEach(stream => {
      if (stream.destroying || stream.destroyed) return
      if (!stream.push(packet)) {
        console.warn('deluge highWaterMark')
      }
    })
  }

  /**
   * @param {Packet} packet
   * @returns {Promise}
   */
  async _publish (packet) {
    if (this.destroying || this.destroyed) return

    this.peers
      .filter(peer => {
        // don't send the message to the origin
        if (packet.origin.equals(peer.id)) return false

        // don't send the message back to the sender
        if (!packet.initiator && packet.from.equals(peer.id)) return false

        return true
      })
      .forEach(peer => {
        this._onSend(packet, peer)
          .then(valid => valid && peer.send(packet))
          .catch(err => this.emit('on-send-error', err))
      })
  }

  /**
   * @param {Buffer} from
   * @param {Buffer} buf
   * @returns {(Packet|undefined)}
   */
  _readPacket (from, buf) {
    if (!buf || this.destroying || this.destroyed) return

    const packet = Packet.createFromBuffer(buf, from)
    if (!packet) return

    // Ignore packets produced by me and forwarded by others
    if (packet.origin.equals(this.id)) return

    // Custom filter.
    this._onPacket(packet)
      .then(valid => {
        if (valid) {
          this.emit('packet', packet)
          this._publish(packet)
        }
      })
      .catch(err => this.emit('on-packet-error', err))
  }
}

module.exports = Deluge
