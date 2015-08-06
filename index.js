var Duplex = require('stream').Duplex;
var EventEmitter = require('events').EventEmitter;
var Response = require('json-rpc-response');
var JsonRpcError = require('json-rpc-error');
var isObject = require('isobject');
var incrementer = require('dead-simple-incrementer');

module.exports = function(opts) {
  opts = opts || {};

  var stream = new Duplex();
  var simpleIdGenerator = incrementer();
  var responseBatchBuffer = {};
  var ignoreVersion = opts.ignoreVersion || false;

  var hasValidRequestId = function(request) {
    return (typeof request.id === 'string' || typeof request.id === 'number');
  };

  var hasValidRequestMethod = function(request) {
    return typeof request.method === 'string';
  };

  var hasListenerForRequestMethod = function(request) {
    return !!stream.rpc.listeners(request.method).length;
  };

  var isExpectingResponse = function(request) {
    return !isObject(request) || hasValidRequestId(request);
  };

  var hasValidVersion = function(request) {
    return ignoreVersion || (request.jsonrpc && request.jsonrpc === '2.0');
  };

  // Returns array with complete batch response or null if not all expected
  // responses are ready.
  var getReadyBatchResponse = function(implicitBatchId) {
    var implicitResponseId, response;
    var batch = [];

    for (implicitResponseId in responseBatchBuffer[implicitBatchId]) {
      response = responseBatchBuffer[implicitBatchId][implicitResponseId];
      if (!response) {
        return null;
      }

      batch.push(response);
    }

    return batch;
  };

  var createReplyCallback = function(request) {
    if (!hasValidRequestId(request)) {
      return function noop() {};
    }

    return function(err, result) {
      // Strings, native errors or other non-JSON RPC 2.0 errors are transformed
      // into JSON RPC 2.0 error of type Internal Error.
      if (typeof err === 'string') {
        err = new JsonRpcError.InternalError({ message: err });
      } else if (err && (!err.code || !err.message)) {
        err = new JsonRpcError.InternalError(err);
      }

      var response = new Response(request.id, err, result);
      pushOutgoingResponse(response);
    };
  };

  var pushOutgoingResponse = function(data, implicitBatchId, implicitResponseId) {
    var batch;

    if (implicitBatchId) {
      responseBatchBuffer[implicitBatchId][implicitResponseId] = data;
      batch = getReadyBatchResponse(implicitBatchId);

      if (batch) {
        stream.push(JSON.stringify(batch));
      }

      return;
    }
    stream.push(JSON.stringify(data));
  };

  var handleIncomingBatch = function(batch) {
    var implicitBatchId;

    if (!batch.length) {
      pushOutgoingResponse(new Response(null, new JsonRpcError.InvalidRequest()));
      return;
    }

    implicitBatchId = simpleIdGenerator.next();

    batch.forEach(function(request) {
      var expectingResponse = isExpectingResponse(request);
      var implicitResponseId = null;

      if (expectingResponse) {
        implicitResponseId = simpleIdGenerator.next();
        responseBatchBuffer[implicitBatchId] = responseBatchBuffer[implicitBatchId] || {};
        responseBatchBuffer[implicitBatchId][implicitResponseId] = null;
      }

      // We need to iterate whole batch and populate response batch buffer
      // before starting to handle each incoming request.
      process.nextTick(function() {
        handleIncomingRequest(request, expectingResponse ? implicitBatchId : null, implicitResponseId);
      });
    });
  };

  var handleIncomingRequest = function(request, implicitBatchId, implicitResponseId) {
    var errorResponse;

    if (isExpectingResponse(request)) {
      if (!isObject(request)) {
        errorResponse = new Response(null, new JsonRpcError.InvalidRequest());
      } else if (!hasValidVersion(request)) {
        errorResponse = new Response(request.id, new JsonRpcError.InvalidRequest());
      } else if (!hasValidRequestMethod(request)) {
        errorResponse = new Response(request.id, new JsonRpcError.InvalidRequest());
      } else if (!hasListenerForRequestMethod(request)) {
        errorResponse = new Response(request.id, new JsonRpcError.MethodNotFound());
      }
    }

    if (errorResponse) {
      pushOutgoingResponse(errorResponse, implicitBatchId, implicitResponseId);
      return;
    }

    if (!hasValidVersion(request)) {
      return;
    }

    stream.rpc.emit(request.method, request.params, createReplyCallback(request));
  };

  stream.rpc = new EventEmitter();

  stream._write = function(chunk, encoding, callback) {
    var data;

    try {
      data = JSON.parse(chunk);
    } catch (err) {
      pushOutgoingResponse(new Response(null, new JsonRpcError.ParseError()));
      return callback();
    }

    if (Array.isArray(data)) {
      handleIncomingBatch(data);
    } else {
      handleIncomingRequest(data);
    }

    callback();
  };

  stream._read = function(size) {};

  return stream;
};
