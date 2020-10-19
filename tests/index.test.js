const { createNetworkSetup } = require('./setup')

const nextTick = () => new Promise(resolve => process.nextTick(resolve))

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

  complete.peers[0].send(0, Buffer.from('ping'))

  await nextTick()

  expect(sended).toHaveBeenCalledTimes(4)
  expect(readed).toHaveBeenCalledTimes(2)
})
