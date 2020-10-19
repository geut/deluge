const ForceGraph = require('./force-graph')
const { createNetworkSetup } = require('../../tests/setup')

const peersTitle = document.getElementById('peers-title')
const connectionsTitle = document.getElementById('connections-title')
const packetsSendedTitle = document.getElementById('packets-sended-title')
const packetsReadedTitle = document.getElementById('packets-readed-title')
const view = ForceGraph()(document.getElementById('graph'))

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

;(async () => {
  let packetsSended = 0
  let packetsReaded = 0

  const setup = createNetworkSetup({
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
      view.pushParticle(from.id, to.id, { speed: 0.02, color: 'red' })
      delay(800).then(() => to.emit('message', packet.buffer))
    }
  })

  const network = await setup.balancedBinTree(15)

  view
    .nodeVal(4)
    .nodeLabel('id')
    .nodeColor(node => (node.destroyed ? 'red' : node.color))
    .graphData({ nodes: network.peers, links: network.connections.map(c => ({ source: c.fromId, target: c.toId })) })
    .onNodeRightClick(async (node) => {
      packetsSended = 0
      packetsReaded = 0
      network.peers.forEach((peer) => {
        peer.color = null
      })
      node.color = '#d950cd'
      node.send(0, Buffer.from('hello'))
    })
    .nodeCanvasObjectMode(node => node.color ? 'before' : undefined)
    .nodeCanvasObject((node, ctx) => {
      // add ring just for highlighted nodes
      ctx.beginPath()
      ctx.arc(node.x, node.y, 6 * 1.4, 0, 2 * Math.PI, false)
      ctx.fillStyle = node.color || 'blue'
      ctx.fill()
    })

  peersTitle.innerHTML = network.peers.length
  connectionsTitle.innerHTML = network.connections.length
})()
