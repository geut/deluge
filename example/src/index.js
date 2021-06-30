// const createGraph = require('ngraph.graph')
import ForceGraph from './force-graph.js'
import { networkSetup } from '../../tests/network-setup.js'

const peersTitle = document.getElementById('peers-title')
const connectionsTitle = document.getElementById('connections-title')
const packetsSendedTitle = document.getElementById('packets-sended-title')
const packetsReadedTitle = document.getElementById('packets-readed-title')
const view = ForceGraph()(document.getElementById('graph'))

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const filter = () => {
  const cache = new Set()

  return {
    onPacket (packet) {
      const seqno = packet.seqno.toString('hex')
      if (cache.has(seqno)) {
        return false
      }

      cache.add(seqno)
      return true
    }
  }
}

;(async () => {
  let packetsSended = 0
  let packetsReaded = 0

  const setup = networkSetup({
    onPeer (peer) {
      peer.on('packet', () => {
        packetsReaded++
        packetsReadedTitle.innerHTML = packetsReaded
        peer.color = '#53c379'
      })
    },
    onSend (from, to, packet) {
      packetsSended++
      packetsSendedTitle.innerHTML = packetsSended
      view.pushParticle(from.id, to.id, { speed: 0.02, color: packet.channel === 0 ? 'blue' : 'red' })
      delay(800).then(() => to.emit('message', packet.buffer))
    },
    filter
  })

  // const g = createGraph()
  // for (let i = 0; i < 7; i++) {
  //   g.addNode(i)
  // }
  // for (let i = 0; i < 7; i++) {
  //   g.addLink(i, (i + 1 < 7) ? i + 1 : 0)
  // }

  const network = await setup.balancedBinTree(3)

  window.network = network

  let double = false
  view
    .nodeVal(4)
    .nodeLabel('id')
    .nodeColor(node => (node.destroyed ? 'red' : node.color))
    .graphData({ nodes: network.peers, links: network.connections.map(c => ({ source: c.fromId, target: c.toId })) })
    .onNodeClick(node => {
      if (!double) {
        double = true
        setTimeout(() => {
          double = false
        }, 300)
        return
      }

      network.deletePeer(node.ref.id)
      double = false
    })
    .onNodeRightClick(async (node) => {
      packetsSended = 0
      packetsReaded = 0
      network.peers.forEach((peer) => {
        peer.color = null
      })
      node.color = '#d950cd'
      node.send(0, Buffer.from('hello'))
    })
    // .nodeCanvasObjectMode(node => node.color ? 'before' : undefined)
    .nodeCanvasObject((node, ctx) => {
      // add ring just for highlighted nodes
      ctx.beginPath()
      ctx.arc(node.x, node.y, 6 * 1.4, 0, 2 * Math.PI, false)
      ctx.fillStyle = node.color || 'blue'
      ctx.fill()

      const label = typeof node.id === 'string' ? node.id.slice(0, 2) : node.id
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'white'
      ctx.fillText(label, node.x, node.y)
    })

  view.d3Force('link').strength(0.08)

  network.graph.on('changed', () => {
    view.graphData({ nodes: network.peers, links: network.connections.map(c => ({ source: c.fromId, target: c.toId })) })
  })

  peersTitle.innerHTML = network.peers.length
  connectionsTitle.innerHTML = network.connections.length
})()
