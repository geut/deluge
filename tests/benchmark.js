//
// Copyright 2019 DXOS.org
//

import bench from 'nanobench-utils/nanobench.js'

import { networkSetup } from './network-setup.js'

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
  const setup = networkSetup({
    filter
  })

  const direct = await setup.complete(2)
  const watz = await setup.wattsStrogatz(15, 10, 0)
  const tree = await setup.balancedBinTree(5)

  bench('10000 requests: broadcast direct (2 nodes)', async (b) => {
    b.start()
    for (let i = 0; i < 10000; i++) {
      const done = new Promise(resolve => direct.peers[1].once('packet', resolve))
      await direct.peers[0].send(0, Buffer.from('test'))
      await done
    }
    b.end()
  })

  bench('10000 requests: broadcast watz of 15 nodes with 10 connections x peer', async (b) => {
    b.start()
    for (let i = 0; i < 10000; i++) {
      const done = Promise.all(watz.peers.slice(1).map(peer => new Promise(resolve => peer.once('packet', resolve))))
      await watz.peers[0].send(0, Buffer.from('test'))
      await done
    }
    b.end()
  })

  bench('10000 requests: broadcast tree of 15 nodes', async (b) => {
    b.start()
    for (let i = 0; i < 10000; i++) {
      const done = Promise.all(tree.peers.slice(1).map(peer => new Promise(resolve => peer.once('packet', resolve))))
      await tree.peers[0].send(0, Buffer.from('test'))
      await done
    }
    b.end()
  })
})()
