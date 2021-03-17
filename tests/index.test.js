const { createNetworkSetup } = require('./setup')
const { Deluge } = require('..')

const delay = () => new Promise(resolve => setTimeout(resolve))

test('network complete', async () => {
  const sended = jest.fn()
  const readed = jest.fn()

  const setup = createNetworkSetup({
    onPeer (peer) {
      peer.on('packet', (packet) => {
        readed(packet.data.toString('hex'))
      })

      peer.on('send', (packet) => {
        sended(packet.data.toString('hex'))
      })
    }
  })

  const complete = await setup.complete(3)

  await complete.peers[0].send(0, Buffer.from('ping'))

  await delay()

  expect(sended).toHaveBeenCalledTimes(4)
  expect(readed).toHaveBeenCalledTimes(2)
})

test('stream support', async () => {
  expect.assertions(2)

  const setup = createNetworkSetup()

  const complete = await setup.complete(2)

  const onClose = jest.fn()

  const dp1 = complete.peers[0].broadcast.createDuplexStream()
  const dp2 = complete.peers[1].broadcast.createDuplexStream()
  dp1.on('close', onClose)
  dp2.on('close', onClose)

  dp1.write(Buffer.from('ping'))

  const data = await new Promise(resolve => dp2.once('data', ({ data }) => resolve(data)))

  expect(data.toString()).toEqual('ping')

  await Promise.all([
    complete.peers[0].broadcast.close(),
    complete.peers[1].broadcast.close()
  ])

  expect(onClose).toHaveBeenCalledTimes(2)
})

test('add/delete peer', async () => {
  const deluge = new Deluge()
  await deluge.open()

  const bufferId = Buffer.alloc(32).fill('f')
  await deluge.addPeer(bufferId, {
    send () {},
    subscribe () {}
  })
  expect(deluge.peers.length).toBe(1)
  await deluge.deletePeer(bufferId)
  expect(deluge.peers.length).toBe(0)

  const str = bufferId.toString('hex')
  await deluge.addPeer(str, {
    send () {},
    subscribe () {}
  })
  expect(deluge.peers.length).toBe(1)
  await deluge.deletePeer(str)
  expect(deluge.peers.length).toBe(0)
})

test('distance', async (done) => {
  const packets = []

  const setup = createNetworkSetup({
    onPeer (peer) {
      peer.on('packet', (packet) => {
        packets.push(packet.distance)
        if (packets.length === 4) {
          finish()
        }
      })
    }
  })

  const complete = await setup.path(5)

  await complete.peers[0].send(0, Buffer.from('ping'))

  function finish () {
    expect(packets).toEqual([1, 2, 3, 4])
    done()
  }
})
