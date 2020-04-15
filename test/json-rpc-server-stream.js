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
      jsonRpcServer.rpc.on('update', function() {
        done();
      });

      duplex.push('{"jsonrpc":"2.0","method":"update"}');
    });

    it('should emit notification without params when sending notification with invalid JSON and then sending valid notification', function(done) {
      jsonRpcServer.rpc.on('update', function() {
        done();
      });

      duplex.push('{"jsonrpc":"2.0","method":"update"');
      duplex.push('{"jsonrpc":"2.0","method":"update"}');
    });

    it('should emit received notification with params', function(done) {
      jsonRpcServer.rpc.on('update', function(params) {
        expect(params).to.eql([1, 2]);
        done();
      });
      duplex.push('{"jsonrpc":"2.0","method":"update","params":[1,2]}');
    });

    it('should emit several notification received in batch', function(done) {
      var fooCalled = false;
      var barCalled = false;

      jsonRpcServer.rpc.on('foo', function() {
        fooCalled = true;
        if (fooCalled && barCalled) done();
      });

      jsonRpcServer.rpc.on('bar', function() {
        barCalled = true;
        if (fooCalled && barCalled) done();
      });

      duplex.push('[{"jsonrpc":"2.0","method":"foo"},{"jsonrpc":"2.0","method":"bar"}]');
    });

    it('should emit several notification received consecutively', function(done) {
      var fooCalled = false;
      var barCalled = false;

      jsonRpcServer.rpc.on('foo', function() {
        fooCalled = true;
        if (fooCalled && barCalled) done();
      });

      jsonRpcServer.rpc.on('bar', function() {
        barCalled = true;
        if (fooCalled && barCalled) done();
      });

      duplex.push('{"jsonrpc":"2.0","method":"foo"}');
      duplex.push('{"jsonrpc":"2.0","method":"bar"}');
    });

    it('should emit several notification received as line separated json', function(done) {
      var fooCalled = false;
      var barCalled = false;

      jsonRpcServer.rpc.on('foo', function() {
        fooCalled = true;
        if (fooCalled && barCalled) done();
      });

      jsonRpcServer.rpc.on('bar', function() {
        barCalled = true;
        if (fooCalled && barCalled) done();
      });

      duplex.push('{"jsonrpc":"2.0","method":"foo"}\n{"jsonrpc":"2.0","method":"bar"}\n');
    });

    it('should send response with handled request', function(done) {
      jsonRpcServer.rpc.on('add', function(params, fn) {
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

    it('should send response with handled request including new line character as delimiter', function(done) {
      jsonRpcServer.rpc.on('add', function(params, fn) {
        fn(null, params[0] + params[1]);
      });

      duplex._write = function(chunk, encoding, callback) {
        expect(chunk.toString()).to.eql('{"result":3,"jsonrpc":"2.0","id":1}\n');
        done();
      };

      duplex.push('{"jsonrpc":"2.0","method":"add","params":[1,2],"id":1}');
    });

    it('should send internal error with passed on error message if invoking error callback with native error', function(done) {
      jsonRpcServer.rpc.on('add', function(params, fn) {
        fn(new Error('some internal error'));
      });

      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'some internal error'
          },
          id: 1
        });

        done();
      };

      duplex.push('{"jsonrpc":"2.0","method":"add","params":[1,2],"id":1}');
    });

    it('should send internal error with error as message if invoking error callback with string', function(done) {
      jsonRpcServer.rpc.on('add', function(params, fn) {
        fn('some error message');
      });

      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'some error message'
          },
          id: 1
        });

        done();
      };

      duplex.push('{"jsonrpc":"2.0","method":"add","params":[1,2],"id":1}');
    });

    it('should send error if invoking error callback with valid JSON RPC error', function(done) {
      jsonRpcServer.rpc.on('add', function(params, fn) {
        fn({ code: -1, message: 'meltdown'});
      });

      duplex._write = function(chunk, encoding, callback) {
        expect(JSON.parse(chunk)).to.eql({
          jsonrpc: '2.0',
          error: {
            code: -1,
            message: 'meltdown'
          },
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

      jsonRpcServer.rpc.on('update', function() {
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

      jsonRpcServer.rpc.on('update', function() {
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

    it('should send responses in batch if receiving requests in batch', function(done) {
      jsonRpcServer.rpc.on('add', function(params, fn) {
        fn(null, params[0] + params[1]);
      });

      jsonRpcServer.rpc.on('subtract', function(params, fn) {
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

    it('should send multiple batch responses if receiving multiple batch requests', function(done) {
      var callCount = 0;

      jsonRpcServer.rpc.on('add', function(params, fn) {
        fn(null, params[0] + params[1]);
      });

      jsonRpcServer.rpc.on('subtract', function(params, fn) {
        fn(null, params[0] - params[1]);
      });

      jsonRpcServer.rpc.on('multiply', function(params, fn) {
        fn(null, params[0] * params[1]);
      });

      jsonRpcServer.rpc.on('divide', function(params, fn) {
        fn(null, params[0] / params[1]);
      });

      duplex._write = function(chunk, encoding, callback) {
        callback();

        callCount += 1;

        if (callCount === 1) {
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
        }

        if (callCount === 2) {
          expect(JSON.parse(chunk)).to.eql([{
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: 'Method not found'
            },
            id: 4
          }, {
            jsonrpc: '2.0',
            result: 2,
            id: 5
          }, {
            jsonrpc: '2.0',
            result: 0.5,
            id: 6
          }]);
        }

        if (callCount === 2) {
          done();
        }
      };

      duplex.push('[' +
        '{"jsonrpc":"2.0","method":"foo","id":1},' +
        '{"jsonrpc":"2.0","method":"add","params":[1,2],"id":2},' +
        '{"jsonrpc":"2.0","method":"subtract","params":[1,2],"id":3}' +
        ']');

      duplex.push('[' +
        '{"jsonrpc":"2.0","method":"foo","id":4},' +
        '{"jsonrpc":"2.0","method":"multiply","params":[1,2],"id":5},' +
        '{"jsonrpc":"2.0","method":"divide","params":[1,2],"id":6}' +
        ']');
    });

    it('should send multiple batch responses if receiving multiple batch requests separated by new line character', function(done) {
      var callCount = 0;

      jsonRpcServer.rpc.on('add', function(params, fn) {
        fn(null, params[0] + params[1]);
      });

      jsonRpcServer.rpc.on('subtract', function(params, fn) {
        fn(null, params[0] - params[1]);
      });

      jsonRpcServer.rpc.on('multiply', function(params, fn) {
        fn(null, params[0] * params[1]);
      });

      jsonRpcServer.rpc.on('divide', function(params, fn) {
        fn(null, params[0] / params[1]);
      });

      duplex._write = function(chunk, encoding, callback) {
        callback();

        callCount += 1;

        if (callCount === 1) {
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
        }

        if (callCount === 2) {
          expect(JSON.parse(chunk)).to.eql([{
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: 'Method not found'
            },
            id: 4
          }, {
            jsonrpc: '2.0',
            result: 2,
            id: 5
          }, {
            jsonrpc: '2.0',
            result: 0.5,
            id: 6
          }]);
        }

        if (callCount === 2) {
          done();
        }
      };

      duplex.push('[' +
        '{"jsonrpc":"2.0","method":"foo","id":1},' +
        '{"jsonrpc":"2.0","method":"add","params":[1,2],"id":2},' +
        '{"jsonrpc":"2.0","method":"subtract","params":[1,2],"id":3}' +
        ']\n[' +
        '{"jsonrpc":"2.0","method":"foo","id":4},' +
        '{"jsonrpc":"2.0","method":"multiply","params":[1,2],"id":5},' +
        '{"jsonrpc":"2.0","method":"divide","params":[1,2],"id":6}' +
        ']');
    });

    it('should send batch response with new line character as delimiter', function(done) {
      jsonRpcServer.rpc.on('add', function(params, fn) {
        fn(null, params[0] + params[1]);
      });

      jsonRpcServer.rpc.on('subtract', function(params, fn) {
        fn(null, params[0] - params[1]);
      });

      duplex._write = function(chunk, encoding, callback) {
        expect(chunk.toString()).to.be('[{"error":{"message":"Method not found","code":-32601},"jsonrpc":"2.0","id":1},{"result":3,"jsonrpc":"2.0","id":2},{"result":-1,"jsonrpc":"2.0","id":3}]\n')
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

      jsonRpcServer.rpc.on('update', function() {
        done();
      });

      duplex.push('{"method":"update","id":1}');
    });

    it('should emit event if notification has invalid version', function(done) {
      duplex._write = function(chunk, encoding, callback) {};

      jsonRpcServer.rpc.on('update', function() {
        done();
      });

      duplex.push('{"method":"update"}');
    });

    it('should send response with handled request if request has invalid version', function(done) {
      jsonRpcServer.rpc.on('add', function(params, fn) {
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
