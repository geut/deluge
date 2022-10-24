import { test } from 'uvu'
import * as assert from 'uvu/assert'
import { spy } from 'tinyspy'
import randomBytes from '@geut/randombytes'

import { Deluge, Peer, Packet } from '../src/index.js'
import { networkSetup } from './network-setup.js'

const delay = (ms = 1) => {
  let clear
  const p = new Promise(resolve => {
    const ref = setTimeout(resolve, ms)
    clear = () => {
      clearTimeout(ref)
      resolve()
    }
  })
  p.clear = () => {
    clear()
  }
  return p
}

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

const assertThrow = async (p, regex) => {
  try {
    await p
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.instance(err, Error)
    assert.ok(regex.test(err.message), `should match with the regex: ${regex}`)
    return err
  }
}

test('network complete', async () => {
  const sended = spy()
  const readed = spy()

  const setup = networkSetup({
    onPeer (peer) {
      peer.on('packet', (packet) => {
        readed(packet.data.toString('hex'))
      })

      peer.on('send', (packet) => {
        sended(packet.data.toString('hex'))
      })
    },
    filter
  })

  const complete = await setup.complete(3)

  await complete.peers[0].send(0, Buffer.from('ping'))

  await delay()

  assert.is(sended.callCount, 4)
  assert.is(readed.callCount, 2)
})

test('stream support', async () => {
  const setup = networkSetup()

  const complete = await setup.complete(2)

  const onClose = spy()

  const dp1 = complete.peers[0].broadcast.createDuplexStream()
  const dp2 = complete.peers[1].broadcast.createDuplexStream()
  dp1.on('close', onClose)
  dp2.on('close', onClose)

  dp1.write(Buffer.from('ping'))

  const data = await new Promise(resolve => dp2.once('data', ({ data }) => resolve(data)))

  assert.is(data.toString(), 'ping')

  await Promise.all([
    complete.peers[0].broadcast.close(),
    complete.peers[1].broadcast.close()
  ])

  assert.is(onClose.callCount, 2)

  assert.throws(() => complete.peers[0].broadcast.createDuplexStream(), /deluge is closed/)
  assert.not.throws(() => complete.peers[0].broadcast.processIncomingMessage())
})

test('add/delete peer', async () => {
  const deluge = new Deluge()
  await deluge.open()

  const bufferId = Buffer.alloc(32).fill('f')
  await deluge.addPeer(bufferId, {
    send () {},
    subscribe () {}
  })

  assert.is(deluge.peers.length, 1)
  await deluge.deletePeer(bufferId)
  assert.is(deluge.peers.length, 0)
})

test('distance', async () => {
  const distances = []

  const done = {}
  done.promise = new Promise(resolve => {
    done.resolve = resolve
  })

  const setup = networkSetup({
    onPeer (peer) {
      peer.on('packet', (packet) => {
        distances.push(packet.distance)

        if (distances.length === 4) {
          done.resolve()
        }
      })
    }
  })

  const complete = await setup.path(5)

  await complete.peers[0].send(0, Buffer.from('ping'))

  const d = delay(100)
  await Promise.race([
    done.promise,
    d.then(() => {
      throw new Error('timeout')
    })
  ]).then(() => {
    d.clear()
  })

  assert.equal(distances, [1, 2, 3, 4])
})

test('ready', async () => {
  {
    const deluge = new Deluge()
    const isReady = deluge.ready()
    await Promise.all([
      await deluge.open(),
      await isReady
    ])
  }

  {
    const deluge = new Deluge()
    deluge.on('open', async () => {
      throw new Error('oh no')
    })

    await Promise.all([
      assertThrow(deluge.ready(), /oh no/),
      assertThrow(deluge.open(), /oh no/)
    ])
  }
})

test('onPeer', async () => {
  const deluge = new Deluge()
  let peer
  const onPeer = spy((id, handler) => {
    peer = new Peer(id, handler)
    return peer
  })
  deluge.onPeer(onPeer)
  await deluge.open()
  const id = randomBytes(32)
  const handler = {
    send () {}
  }
  await deluge.addPeer(id, handler)
  assert.equal(onPeer.calls[0], [id, handler])
  assert.is(deluge.getPeer(id), peer)
  const oldPeer = deluge.getPeer(id)
  await deluge.addPeer(id, handler)
  assert.is(deluge.getPeer(id), peer)
  assert.is.not(deluge.getPeer(id), oldPeer)
})

test('avoid forward back to origin', async () => {
  const d1 = new Deluge()
  await d1.open()
  const packet = await d1.send(1, Buffer.from('test'))
  assert.not.ok(await d1.processIncomingMessage(d1.id, packet.buffer))
})

test('onPacket error', async () => {
  const err = new Error('oh no')
  const d1 = new Deluge({
    onPacket: () => {
      throw err
    }
  })
  await d1.open()
  const d2 = new Deluge()
  await d2.open()

  const packet = await d2.send(1, Buffer.from('test'))
  await Promise.all([
    d1.waitFor('error-packet').then(res => {
      assert.ok(/oh no/.test(res[0].message))
      assert.instance(res[1], Packet)
    }),
    d1.processIncomingMessage(d2, packet.buffer).then(res => assert.not.ok(res))
  ])
})

test.run()
