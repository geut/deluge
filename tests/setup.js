const { EventEmitter } = require('events')
const { NetworkSetup, Peer: PeerBase } = require('@geut/network-setup')

const { Deluge } = require('..')

class Peer extends PeerBase {
  constructor (node, opts = {}) {
    super(node)

    this.broadcast = new Deluge(opts)
    this.broadcast.on('packet', packet => {
      this.emit('packet', packet)
    })
    this.broadcast.on('send', packet => {
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

  connect (peer, send) {
    const fromPeer = new EventEmitter()
    fromPeer.id = this.id
    const toPeer = new EventEmitter()
    toPeer.id = peer.id

    this.broadcast.addPeer(peer.bufferId, handler(fromPeer, toPeer))
    peer.broadcast.addPeer(this.bufferId, handler(toPeer, fromPeer))

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
    onConnection (_, fromPeer, toPeer) {
      fromPeer.connect(toPeer, onSend)
    }
  })
}

module.exports = { createNetworkSetup, Peer }
