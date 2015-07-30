var expect = require('expect.js');
var jsonRpcServerStream = require('..');
var stream = require('stream');

describe('JSON RPC 2.0 server stream', function() {
  var duplex = null;

  beforeEach(function() {
    duplex = new stream.Duplex();
    duplex._read = function(size) {};
  });

  afterEach(function() {
    duplex = null;
  });

  describe('with default options', function() {
    var jsonRpcServer = null;

    beforeEach(function() {
      jsonRpcServer = jsonRpcServerStream();
      duplex.pipe(jsonRpcServer).pipe(duplex);
    });

    afterEach(function() {
      jsonRpcServer = null;
    });

    it('should emit notification without params', function(done) {
      jsonRpcServer.emitter.on('update', function() {
        done();
      });

      duplex.push('{"jsonrpc":"2.0","method":"update"}');
    });

    it('should emit notification without params when sending notification with invalid JSON and then sending valid notification', function(done) {
      jsonRpcServer.emitter.on('update', function() {
        done();
      });

      duplex.push('{"jsonrpc":"2.0","method":"update"');
      duplex.push('{"jsonrpc":"2.0","method":"update"}');
    });

    it('should emit received notification with params', function(done) {
      jsonRpcServer.emitter.on('update', function(params) {
        expect(params).to.eql([1, 2]);
        done();
      });
      duplex.push('{"jsonrpc":"2.0","method":"update","params":[1,2]}');
    });

    it('should emit several notification received in batch', function(done) {
      var fooCalled = false;
      var barCalled = false;

      jsonRpcServer.emitter.on('foo', function() {
        fooCalled = true;
        if (fooCalled && barCalled) done();
      });

      jsonRpcServer.emitter.on('bar', function() {
        barCalled = true;
        if (fooCalled && barCalled) done();
      });

      duplex.push('[{"jsonrpc":"2.0","method":"foo"},{"jsonrpc":"2.0","method":"bar"}]');
    });

    it('should emit several notification received consecutively', function(done) {
      var fooCalled = false;
      var barCalled = false;

      jsonRpcServer.emitter.on('foo', function() {
        fooCalled = true;
        if (fooCalled && barCalled) done();
      });

      jsonRpcServer.emitter.on('bar', function() {
        barCalled = true;
        if (fooCalled && barCalled) done();
      });

      duplex.push('{"jsonrpc":"2.0","method":"foo"}');
      duplex.push('{"jsonrpc":"2.0","method":"bar"}');
    });

    it('should send response with handled request', function(done) {
      jsonRpcServer.emitter.on('add', function(params, fn) {
        fn(null, params[0] + params[1]);
      });

      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql({
          jsonrpc: '2.0',
          result: 3,
          id: 1
        });

        done();
      };

      duplex.push('{"jsonrpc":"2.0","method":"add","params":[1,2],"id":1}');
    });

    it('should send parse error if request is invalid JSON', function(done) {
      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql({
          jsonrpc: '2.0',
          error: {
            code: -32700,
            message: 'Parse error'
          },
          id: null
        });

        done();
      };

      duplex.push('{"jsonrpc": "2.0", "method": "foobar, "params": "bar", "baz]');
    });

    it('should send invalid request error if it request has an invalid version', function(done) {
      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid Request'
          },
          id: 1
        });

        done();
      };

      duplex.push('{"method":"update","id":1}');
    });

    it('should not send response if notification has an invalid version', function(done) {
      var callCount = 0;

      duplex._write = function(chunk, encoding, callback) {
        callCount += 1;
      };

      setTimeout(function() {
        expect(callCount).to.be(0);
        done();
      }, 0);

      duplex.push('{"method":"update"}');
    });

    it('should not emit event if request has invalid version', function(done) {
      var callCount = 0;

      duplex._write = function(chunk, encoding, callback) {};

      jsonRpcServer.emitter.on('update', function() {
        callCount += 1;
      });

      setTimeout(function() {
        expect(callCount).to.be(0);
        done();
      }, 0);

      duplex.push('{"method":"update","id":1}');
    });

    it('should not emit event if notification has invalid version', function(done) {
      var callCount = 0;

      duplex._write = function(chunk, encoding, callback) {};

      jsonRpcServer.emitter.on('update', function() {
        callCount += 1;
      });

      setTimeout(function() {
        expect(callCount).to.be(0);
        done();
      }, 0);

      duplex.push('{"method":"update"}');
    });

    it('should send method not found error for non-existent request method', function(done) {
      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found'
          },
          id: 1
        });

        done();
      };

      duplex.push('{"jsonrpc":"2.0","method":"foo","id":1}');
    });

    it('should not send method not found error for non-existent notification method', function(done) {
      var callCount = 0;

      duplex._write = function(chunk, encoding, callback) {
        callCount += 1;
      };

      setTimeout(function() {
        expect(callCount).to.be(0);
        done();
      }, 0);

      duplex.push('{"jsonrpc":"2.0","method":"foo"}');
    });

    it('should send invalid request error if request method is not a string', function(done) {
      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid Request'
          },
          id: 1
        });

        done();
      };

      duplex.push('{"jsonrpc":"2.0","method":1,"id":1}');
    });

    it('should send invalid request error if receiving empty batch', function(done) {
      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid Request'
          },
          id: null
        });

        done();
      };

      duplex.push('[]');
    });

    it('should send invalid request error if receiving valid JSON that is not a plain object', function(done) {
      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid Request'
          },
          id: null
        });

        done();
      };

      duplex.push('1');
    });

    it('should send request errors in batch if receiving invalid requests in batch', function(done) {
      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql([{
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found'
          },
          id: 1
        }, {
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid Request'
          },
          id: 2
        }, {
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid Request'
          },
          id: null
        }]);

        done();
      };

      duplex.push('[{"jsonrpc":"2.0","method":"foo","id":1},{"jsonrpc":"2.0","method":1,"id":2},1]');
    });

    it('should send responses in batch if receiving requests in batch', function() {
      jsonRpcServer.emitter.on('add', function(params, fn) {
        fn(null, params[0] + params[1]);
      });

      jsonRpcServer.emitter.on('subtract', function(params, fn) {
        fn(null, params[0] - params[1]);
      });

      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql([{
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found'
          },
          id: 1
        }, {
          jsonrpc: '2.0',
          result: 3,
          id: 2
        }, {
          jsonrpc: '2.0',
          result: -1,
          id: 3
        }]);

        done();
      };

      duplex.push('[{"jsonrpc":"2.0","method":"foo","id":1},{"jsonrpc":"2.0","method":"add","params":[1,2],"id":2},{"jsonrpc":"2.0","method":"subtract","params":[1,2],"id":3}]');
    });
  });

  describe('with non-default options', function() {
    var jsonRpcServer = null;

    beforeEach(function() {
      jsonRpcServer = jsonRpcServerStream({
        ignoreVersion: true
      });

      duplex.pipe(jsonRpcServer).pipe(duplex);
    });

    afterEach(function() {
      jsonRpcServer = null;
    });

    it('should emit event if request has invalid version', function(done) {
      duplex._write = function(chunk, encoding, callback) {};

      jsonRpcServer.emitter.on('update', function() {
        done();
      });

      duplex.push('{"method":"update","id":1}');
    });

    it('should emit event if notification has invalid version', function(done) {
      duplex._write = function(chunk, encoding, callback) {};

      jsonRpcServer.emitter.on('update', function() {
        done();
      });

      duplex.push('{"method":"update"}');
    });

    it('should send response with handled request if request has invalid version', function(done) {
      jsonRpcServer.emitter.on('add', function(params, fn) {
        fn(null, params[0] + params[1]);
      });

      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql({
          jsonrpc: '2.0',
          result: 3,
          id: 1
        });

        done();
      };

      duplex.push('{"method":"add","params":[1,2],"id":1}');
    });
  });
});
