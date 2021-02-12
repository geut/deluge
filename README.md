# deluge

Send broadcast messages on top of p2p networks

[![Build Status](https://travis-ci.com/geut/deluge.svg?branch=main)](https://travis-ci.com/geut/deluge)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

[![Made by GEUT][geut-badge]][geut-url]

## Install

$ npm install @geut/deluge

## Usage

```javascript
const { Deluge } = require('@geut/deluge')
const deluge = new Deluge()

// add your peers into deluge
deluge.addPeer(peer.id, {
  send(packet) {
    // send data
    peer.write(packet.buffer)
  },
  subscribe(next) {
    // subscribe for incoming data
    peer.on('data', next)

    // returns unsubscribe function
    return () => {
      peer.off('data', next)
    }
  }
})
deluge.addPeer(...)

// listen for incoming packets
deluge.on('packet', (packet) => {
  console.log(packet.data.toString()) // ping
})

// send a broadcast ping message in the channel = 0
deluge.send(0, Buffer.from('ping'))
```

## API

[//]: # "apiness-api"

#### `deluge = new Deluge([opts])`

*   `opts: Object | null`
    *   `onPeer: OnPeerCallback | null` Callback to pre-process a new peer.
    *   `onPacket: OnPacketCallback | null` Async callback to filter incoming packets.
    *   `onSend: OnSendCallback | null` Async callback to filter peers before to send a packet.

#### `deluge.ready() => Promise<any>`

Wait for the deluge to be opened.

#### `deluge.open([id]) => Promise<any>`

Open deluge with a Buffer ID.

*   `id: Buffer | null`

#### `deluge.onPeer(callback) => void`

*   `callback: OnPeerCallback`

#### `deluge.onPacket(callback) => void`

*   `callback: OnPacketCallback`

#### `deluge.onSend(callback) => void`

*   `callback: OnSendCallback`

#### `deluge.getPeer(key) => Peer | undefined`

Get a peer by key.

*   `key: Buffer | string`

#### `deluge.addPeer(key, handler) => Promise<Peer>`

Add a new peer into the deluge network.

*   `key: Buffer | string`
*   `handler: Peer.Handler`

#### `deluge.deletePeer(key) => Promise<any>`

*   `key: Buffer | string`

#### `deluge.send(channel, data) => Packet | undefined`

Broadcast a flooding message into the deluge network.

*   `channel: number`
*   `data: Buffer`

#### `deluge.createDuplexStream(opts) => Duplex`

Create a new Duplex Streamx.

*   `opts: any`

#### `deluge.id: Buffer`

#### `deluge.peers: Peer[] (R)`

#### `OnPacketCallback(packet) => Promise<boolean>`

*   `packet: Packet`

#### `OnPeerCallback(id, handler) => Peer`

*   `id: Buffer`
*   `handler: Peer.Handler`

#### `OnSendCallback(packet, peer) => Promise<boolean>`

*   `packet: Packet`
*   `peer: Peer`

#### `packet = new Packet(opts)`

*   `opts: Object`
    *   `origin: Buffer`
    *   `data: Uint8Array`
    *   `channel: number | null = 0`
    *   `seqno: TimestampSeq | null`
    *   `buffer: Buffer | null`

#### `Packet.createFromBuffer(buf, from) => Packet`

*   `buf: Buffer`
*   `from: Buffer`

#### `packet.toString() => string`

Returns the unique ID serialized.

#### `packet.origin: Buffer`

#### `packet.data: Uint8Array`

#### `packet.channel: number`

#### `packet.seqno: TimestampSeq`

#### `packet.from: any`

#### `packet.initiator: boolean (R)`

#### `packet.buffer: Buffer (R)`

#### `Handler: {}`

*   `send: (packet: any) => undefined`
*   `subscribe: (data: Buffer) => UnsubscribeFunction`

#### `peer = new Peer(id, handler)`

*   `id: Buffer`
*   `handler: Handler`

#### `peer.send(packet) => void`

*   `packet: Packet`

#### `peer.subscribe(next, onSend) => void`

*   `next: (data: (Buffer | null)) => UnsubscribeFunction`
*   `onSend: any`

#### `peer.unsubscribe() => void`

#### `peer.id: Buffer`

#### `peer.idStr: string`

#### `peer.handler: Handler`

#### `UnsubscribeFunction() => any`

## Issues

:bug: If you found an issue we encourage you to report it on [github](https://github.com/geut/deluge/issues). Please specify your OS and the actions to reproduce it.

## Contributing

:busts_in_silhouette: Ideas and contributions to the project are welcome. You must follow this [guideline](https://github.com/geut/deluge/blob/main/CONTRIBUTING.md).

## License

MIT © A [**GEUT**](http://geutstudio.com/) project

[geut-url]: https://geutstudio.com

[geut-badge]: https://img.shields.io/badge/Made%20By-GEUT-4f5186?style=for-the-badge&link=https://geutstudio.com&labelColor=white&logo=data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCABAAEADASIAAhEBAxEB/8QAGwAAAgIDAQAAAAAAAAAAAAAABAYDBQACBwH/xAA0EAACAQMBBAcGBgMAAAAAAAABAgMABBEFBhIhQRMiMVFhgcEUIzJxkbFCUmKh0fAkcuH/xAAYAQADAQEAAAAAAAAAAAAAAAABAwQCAP/EACARAAMAAwACAgMAAAAAAAAAAAABAgMRIRIxBEEiM1H/2gAMAwEAAhEDEQA/AOgVlau6xoXdgqqMkk8AKV9U2oYs0WngBRw6VhxPyFamXXoDeiz1PUbmzuujQIUKgjIqGLXnz72FSO9TikfVbi6uXWSSaWRuzixNBx3VzCepNIvgTw+hpjwv+iGr3tM6xa30F2PdP1uangRRNc70fUbi4JLIVaPskXgM/wA076Ze+2W+WwJF4MPWlNaemajI2/GvYbWVlZQHCptZqLNKLGJsKoDSY5nkKorKzlvrlYIRlm5nsA7zWX8pnv55SfikJ/emPZGDcs7m6CguTuL5DPrVf64Me2F2mzNhAg6ZTO/MsSB9BW15s1pt1GVEPRHvQ+hqbTNT9sZ0kCpIOIA5ij5ZEijaSRgqqMkmpVkb7sMuWtoV73S49L3I4B7kjq57c881BZ6vFpuoKjq7dIvYBw8PtUOqX1xcSxoJXw8mQuewVW3vX1eFR+Fcn96OLVvpFzz8kM020kp4QwIvixzVpot5Je2bSTEFw5HAY7qUKadnIymm7x/G5I+3pTskzM8G4rqq6JGpI8E1wi8HR2H0NT7P6rcRKUEzYR9/czgEf0VabV2JgvhdKPdzdvg399aVG37K4Esfw/3hTU1S2NpNrSHqax9q/wAzTm3lY5KA4ZTQl2mo9CWljncL+cnA+tVVhqeSGt5mik5qDg/9o+XVb6aFonuDusMHqjP2qavjbfGTPX3xgTstrm4uGDSEYVV+woWPMKy3dzwd+JHcOQrdkgtyZpXJb87nJ8qqr68a7cKgIjB4DmadGNQjohs9i1C66Xqtvbx+EjIp10jaOMLBaPasDwRTGc5PyNJ1rb9EN5/jP7U17KaaZJvbpV6icI88z3+VG0vH8ipJJ8Ga8tIr22eCYZVh5g94pC1TTJtPmMU67yH4XxwYV0So54IriIxzRrIh7QwzSIyOTbWzlElkCcxtjwNedHeKMCVseDmnq72UgkJa1maL9LDeH81XvspfA9WSBh/sR6U9XD+zDQp+yTSNmR/MnJomG3SLiBlu80zQ7JXTH31xEg/Tlj6Vb2OzljaEO6meQc5OweVc8koOmUGjaFLfuss4MdsOOewv8v5p0ijSGNY41CoowAOQrbsr2p7t0zSWj//Z
