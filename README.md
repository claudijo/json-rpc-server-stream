# JSON RPC Server Stream

JSON 2.0 RPC server implementation with streaming I/O and event driven API for
endpoint implementers. For the corresponding client implementation see
[json-rpc-client-stream](https://github.com/claudijo/json-rpc-client-stream).

## Line-delimited JSON
JSON is streamed with new line character `\n` as delimiter from the server, which 
enables sensible client side parsing even if several JSON encoded responses are 
streamed in the same chunk from the server. Several incoming JSON encoded 
requests or notification objects are also expected to be delimited with new line 
characters if sent in the same chunk.

For gereral info about new line encoded JSON, see 
[http://jsonlines.org/](http://jsonlines.org/).

## JSON RPC 2.0 Architecture

The [JSON RPC 2.0 protocol](http://www.jsonrpc.org/specification) uses a
client-server-architecture, in contrast to the peer-to-peer oriented 1.0
version, where peers act as both clients and server. However, it is still
possible to use JSON RPC 2.0 in a peer-to-peer fashion.

### Using JSON RPC 2.0 in a Peer-to-peer Fashion

A server and client pair must be installed on each node in order to use JSON RPC
2.0 in a peer-to-peer fashion. Additionally, full-duplex communication between
node endpoint is required, for instance using
[WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API).
The question then becomes: How to separate incoming requests from incoming
responses?

This problem could be handled by the protocol implementation, since it is quite
straight forward to separate well-formed requests from well-formed responses.
Consequently, messages could be inspected by the implementation and either be
handled as requests or as responses. However, such an approach is not optimal –
It violates the idea of _separation of concerns_. Furthermore, there are
malformed JSON RPC 2.0 messages, such as an empty array `"[]"`, that cannot be
distinguished as a malformed request that requires an error response or a
malformed response that should be left unanswered.

A better approach when a JSON RPC 2.0 server and client on the same node share a
common bidirectional channel is to multiplex and demultiplex (mux/demux) the
transmission, so that each message only hits the intended endpoint
implementation. The module
[mux-demux-stream](https://github.com/claudijo/mux-demux-stream) can be used to
achieve this.

## Installation

```js
npm install json-rpc-server-stream
```

## Usage

Create a JSON RPC server stream and add event listeners for incoming
requests or notifications.

Do some stream plumbing, such as: Readable connection stream -> RPC server ->
Writable connection stream.

As mentioned above, it is recommended to pipe the streaming JSON RPC 2.0 server
and client through a mux/demux before piping it to a channel stream if using
JSON RPC 2.0 in a peer-to-peer fashion.

### jsonRpcServerStream()

The module exports a factory function that returns a JSON RPC server stream
instance, which is a
[duplex stream](https://nodejs.org/api/stream.html#stream_class_stream_duplex).

### jsonRpcServerStreamInstance.rpc.on(event, listener)

Add listener for an RPC method. The listener takes a `parameter` argument and a
`reply` argument. The reply argument is a callback that should be invoked with
an error and a result if the RPC was a request. If the reply callback is
provided with an error, the result argument must be left undefined. If the RPC
was a notification (which should not be replied to) the reply callback is a
noop.

## Basic Example

The following examples shows the basic use cases for a JSON RPC 2.0 Server.

```js
var jsonRpcServerStream = require('json-rpc-server-stream')();

// A request
jsonRpcServerStream.rpc.on('divide', function(params, reply) {
  if (params.denominator === 0) {
    return reply(new Error('Division by zero'));
  }

  reply(null, params.numerator / params.denominator);
});

// A notification
jsonRpcServerStream.rpc.on('log', function(params) {
  console.log(params);
});

getSomeReadableStreamSomehow()
  .pipe(jsonRpcServerStream)
  .pipe(getWritableStreamSomehow());
```

## Advanced Example

The following example shows how to implement a JSON RPC 2.0 client and server
in node.js where websockets are used as a shared bi-directional channel, with
multiplexed and demultiplexed transmission. Additional modules
[ws](https://github.com/websockets/ws),
[json-rpc-client-stream](https://github.com/claudijo/json-rpc-client-stream),
[websocket-connection-stream](https://github.com/claudijo/websocket-connection-stream),
and [mux-demux-stream](https://github.com/claudijo/mux-demux-stream) are used.

```js
var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ port: 8080 });
var mux = require('mux-demux-stream');

wss.on('connection', function connection(ws) {
  var websocketConnectionStream = require('websocket-connection-stream')().attach(ws);
  var jsonRpcServerStream = require('json-rpc-server-stream')();
  var jsonRpcClientStream = require('json-rpc-client-stream')();

  mux(jsonRpcServerStream, jsonRpcClientStream)
    .pipe(websocketConnectionStream)
    .demux(jsonRpcServerStream, jsonRpcClientStream);

  jsonRpcServerStream.rpc.on('join', function(params, reply) {
    if (checkIfUserIsAllowedToJoinRoomSomehow(params.roomId, jsonRpcClientStream)) {
      placeJsonRpcClientStreamInARoomCollectionSomehow(params.roomId, jsonRpcClientStream);
      return reply(null, 'OK';
    }

    reply(new Error('Not allowed'));
  });

  jsonRpcServerStream.rpc.on('chat', function(params) {
    var jsonRpcClientStreams = getAllJsonRpcClientInstancesForRoomSomehow(params.to);

    jsonRpcClientStreams.forEach(function(jsonRpcClientStream) {
      jsonRpcClientStream.rpc.emit('chat', {
        from: params.from,
        message: params.message
      });
    });
  });
});

```

## Related packages

* [ws](https://github.com/websockets/ws)
* [json-rpc-client-stream](https://github.com/claudijo/json-rpc-client-stream)
* [websocket-connection-stream](https://github.com/claudijo/websocket-connection-stream)
* [mux-demux-stream](https://github.com/claudijo/mux-demux-stream)

## Test

Run unit tests;

`$ npm test`

Create test coverage report:

`$ npm run-script test-cov`

# License

[MIT](LICENSE)
