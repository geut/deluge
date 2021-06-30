/** @typedef {import('./packet')} Packet */
/** @typedef {import('./peer')} Peer */
/** @typedef {import('streamx').Duplex} Duplex */

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

import { Duplex } from 'streamx'
import crypto from 'crypto'
import assert from 'nanocustomassert'
import { NanoresourcePromise } from 'nanoresource-promise/emitter.js'
import nextTick from 'proc-nexttick'

import { Peer } from './peer.js'
import { Packet } from './packet.js'
import { generator } from './timestamp-seq.js'

/** @type {OnPeerCallback} */
const peerCallback = (id, handler) => new Peer(id, handler)
const pass = () => true
const byteLength = (packet) => packet.buffer.byteLength

export class Deluge extends NanoresourcePromise {
  /**
   * @constructor
   * @param {Object} [opts]
   * @param {Buffer} [opts.id]
   * @param {OnPeerCallback} [opts.onPeer] Callback to pre-process a new peer.
   * @param {OnPacketCallback} [opts.onPacket] Async callback to filter incoming packets.
   * @param {OnSendCallback} [opts.onSend] Async callback to filter peers before to send a packet.
   * @param {boolean} [opts.copy=false] Creates copy packet buffers.
   */
  constructor (opts = {}) {
    const { id = crypto.randomBytes(32), onPeer = peerCallback, onPacket = pass, onSend = pass, copy = false } = opts

    super()

    /** @type {Buffer|null} */
    this._id = id
    /** @type {Map} */
    this._peers = new Map()
    /** @type {OnPeerCallback} */
    this._onPeer = onPeer

    this._copy = copy

    /** @type {Set<Duplex>} */
    this._streams = new Set()
    this._generators = new Map()

    this.onPacket(onPacket)
    this.onSend(onSend)

    this._readPacket = this._readPacket.bind(this)
    this._readPacketStream = this._readPacketStream.bind(this)
    this._getSeqnoGenerator = this._getSeqnoGenerator.bind(this)
  }

  get id () {
    return this._id
  }

  /**
   * @type {Array<Peer>}
   */
  get peers () {
    return Array.from(this._peers.values())
  }

  /**
   * Wait for the deluge to be opened.
   *
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
   * Open deluge with a Buffer ID.
   *
   * @param {Buffer} [id]
   * @returns {Promise}
   */
  open (id = this._id) {
    this._id = id
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
   * Get a peer by key.
   *
   * @param {Buffer|String} key
   * @returns {Peer|undefined}
   */
  getPeer (key) {
    return this._peers.get(key)
  }

  /**
   * Add a new peer into the deluge network.
   *
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
      await this.deletePeer(key)
    }

    const peer = this._onPeer(id, handler)
    this._peers.set(key, peer)
    peer.subscribe(this._readPacket, (packet) => {
      this.emit('peer-send', packet)
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
   * Broadcast a flooding message into the deluge network.
   *
   * @param {number} channel
   * @param {Buffer} data
   * @param {Object} [opts]
   * @returns {Promise<Packet|undefined>}
   */
  async send (channel, data, opts = {}) {
    assert(Number.isInteger(channel))
    assert(data)

    await this.ready()

    const { packetFilter } = opts

    const packet = new Packet({
      seqno: this._getSeqnoGenerator(channel)(),
      data,
      origin: this._id,
      channel
    })
    await this._publish(packet, packetFilter ? this.peers.filter(packetFilter) : this.peers)
    this.emit('send', packet)
    return packet
  }

  /**
   * Create a new Duplex Streamx.
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
        this.send(data.channel || 0, data.data || data).then(() => cb(null))
      },
      destroy: (cb) => {
        this._streams.delete(stream)
        cb(null)
      }
    })

    this._streams.add(stream)
    return stream
  }

  _getSeqnoGenerator (channel) {
    let generate = this._generators.get(channel)
    if (!generate) {
      generate = generator()
      this._generators.set(channel, generate)
    }
    return generate
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
      nextTick(() => stream.destroy())
      return new Promise(resolve => {
        stream.once('close', resolve)
      })
    }))
    this._streams.clear()
  }

  _readPacketStream (packet) {
    this._streams.forEach(stream => {
      if (stream.destroying || stream.destroyed || Duplex.isPaused(stream)) return
      if (!stream.push(packet)) {
        console.warn('deluge highWaterMark')
      }
    })
  }

  /**
   * @param {Packet} packet
   * @returns {Promise}
   */
  async _publish (packet, peers) {
    if (this.closing || this.closed) return

    return Promise.all(peers
      .filter(peer => {
        // don't send the message to the origin
        if (packet.origin.equals(peer.id)) return false

        // don't send the message back to the sender
        if (!packet.initiator && packet.from.equals(peer.id)) return false

        return true
      })
      .map(peer => {
        return this._onSend(packet, peer)
          .then(valid => valid && peer.send(packet))
          .catch(err => this.emit('peer-send-error', err))
      }))
  }

  /**
   * @param {Buffer} from
   * @param {Buffer} buf
   * @returns {(Packet|undefined)}
   */
  _readPacket (from, buf) {
    if (!buf || this.closing || this.closed) return

    const packet = Packet.createFromBuffer(this._getSeqnoGenerator, buf, from, this._copy)
    if (!packet) return

    // Ignore packets produced by me and forwarded by others
    if (packet.origin.equals(this._id)) return

    // Custom filter.
    this._onPacket(packet)
      .then(valid => {
        if (valid) {
          this.emit('packet', packet)
          return this._publish(packet, this.peers)
        }
      })
      .then(() => {
        this.emit('packet-deluged', packet)
      })
  }
}
