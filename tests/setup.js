const { EventEmitter } = require('events')
const { NetworkSetup, Peer: PeerBase, Connection } = require('@geut/network-setup')

const { Deluge } = require('..')

class Peer extends PeerBase {
  constructor (node, opts = {}) {
    super(node)

    const cache = new Set()
    this.broadcast = new Deluge({
      onPacket: (packet) => {
        const id = packet.toString()
        if (cache.has(id)) return false
        cache.add(id)
        return true
      },
      ...opts
    })
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

  async _open () {
    await this.broadcast.open()
    await super._open()
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
}

function createNetworkSetup (opts = {}) {
  const { onPeer, onSend } = opts

  return new NetworkSetup({
    onPeer (node) {
      const peer = new Peer(node)
      onPeer && onPeer(peer)
      return peer
    },
    onConnection (link, fromPeer, toPeer) {
      return new Connection(link, {
        open () {
          return fromPeer.connect(toPeer, onSend)
        }
      })
    }
  })
}

module.exports = { createNetworkSetup, Peer }
