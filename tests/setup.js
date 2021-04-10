const { EventEmitter } = require('events')
const { NetworkSetup, Peer: PeerBase, Connection } = require('@geut/network-setup')

const { Deluge } = require('..')

class Peer extends PeerBase {
  constructor (node, opts = {}) {
    super(node)

    const { filter, ...broadcastOpts } = opts

    this.broadcast = new Deluge({
      onPacket: this._onPacket.bind(this),
      onSend: this._onSend.bind(this),
      ...broadcastOpts
    })

    this._filter = filter && filter(this.broadcast)

    this.broadcast.on('packet', packet => {
      this.emit('packet', packet)
    })
    this.broadcast.on('peer-send', packet => {
      this.emit('send', packet)
    })
  }

  get bufferId () {
    return this.broadcast.id
  }

  get peers () {
    return this.broadcast.peers
  }

  send (ch, data) {
    this.broadcast.send(ch, data)
  }

  async connect (peer, send) {
    const fromPeer = new EventEmitter()
    fromPeer.id = this.id
    const toPeer = new EventEmitter()
    toPeer.id = peer.id

    await this.broadcast.addPeer(peer.bufferId, handler(fromPeer, toPeer))
    await peer.broadcast.addPeer(this.bufferId, handler(toPeer, fromPeer))

    function handler (from, to) {
      return {
        send (packet) {
          if (send) {
            return send(from, to, packet)
          }

          process.nextTick(() => to.emit('message', packet.buffer))
        },
        subscribe (next) {
          from.on('message', msg => next(msg))
        }
      }
    }
  }

  async _open () {
    await this.broadcast.open()
    await super._open()
  }

  _onPacket (...args) {
    if (this._filter && this._filter.onPacket) {
      return this._filter.onPacket(...args)
    }

    return true
  }

  _onSend (...args) {
    if (this._filter && this._filter.onSend) {
      return this._filter.onSend(...args)
    }

    return true
  }
}

function createNetworkSetup (opts = {}) {
  const { onPeer, onSend, ...peerOpts } = opts

  return new NetworkSetup({
    onPeer (node) {
      const peer = new Peer(node, peerOpts)
      onPeer && onPeer(peer)
      return peer
    },
    onConnection (link, fromPeer, toPeer) {
      const conn = new Connection(link, {
        open () {
          return fromPeer.connect(toPeer, onSend)
        }
      })

      conn.on('closed', () => {
        Promise.all([
          fromPeer.broadcast.deletePeer(toPeer.bufferId),
          toPeer.broadcast.deletePeer(fromPeer.bufferId)
        ])
          .then(() => {
            conn.emit('close')
          })
          .catch(err => {
            console.error(err)
          })
      })
      return conn
    }
  })
}

module.exports = { createNetworkSetup, Peer }
