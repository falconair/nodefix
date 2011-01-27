var sys = require('sys');
var fs = require('fs');
var net = require('net');
var events = require('events');
var path = require('path');


//-----------------------------Expose server API-----------------------------
exports.createServer = function(func ) {
    var server = new Server(func);
    return server;
};

function Server(func) {
     events.EventEmitter.call(this);

     this.sessions = {};

     var self = this;

     this.stream = net.createServer(function(stream) {

        this.senderCompID = null;
        this.targetCompID = null;
        var session = this;

        stream.on('connect', function() {
            self.emit('connect');
            
            var p = pipe.makePipe(stream);
            p.addHandler(require('./handlers/fixFrameDecoder.js').newFixFrameDecoder());
            p.addHandler(require('./handlers/logonManager.js').newLogonManager(false));
            p.addHandler({outgoing:function(ctx,event){ self.emit('outgoingdata',event); }});
            p.addHandler(require('./handlers/sessionProcessor.js').newSessionProcessor(false));
            p.addHandler({incoming:function(ctx,event){ 
                self.emit('incomingdata',event);
                
                if(event['35'] === 'A'){//if logon
                    session.senderCompID = event['49'];
                    session.targetCompID = event['56'];
                    self.sessions[session.senderCompID + '-' + session.targetCompID] = session;
                    self.emit('logon', session.senderCompID, session.targetCompID);
                }
                
                if(event['35'] === '5'){
                    delete self.sessions[session.senderCompID + '-' + session.targetCompID];
                    self.emit('logoff', session.senderCompID, session.targetCompID);
                }
            }});
        });
        stream.on('data', function(data) { p.pushIncoming(data); });
        


     });

     this.listen = function(port, host) { self.stream.listen(port, host); };
     this.write = function(targetCompID, data) { self.sessions[targetCompID].write(data); };
     this.logoff = function(targetCompID, logoffReason) { self.sessions[targetCompID].write({35:5, 58:logoffReason}); };
     this.kill = function(targetCompID, reason){ self.sessions[targetCompID].end(); };

}
sys.inherits(Server, events.EventEmitter);

//-----------------------------Expose client API-----------------------------
exports.createConnection = function(fixVersion, senderCompID, targetCompID, port, host) {
    return new Client({'8': fixVersion, '56': targetCompID, '49': senderCompID, '35': 'A', '90': '0', '108': '30'}, port, host);
};

exports.createConnectionWithLogonMsg = function(logonmsg, port, host) {
    return new Client(logonmsg, port, host);
};

function Client(logonmsg, port, host) {

    this.session = null;
    var self = this;

    events.EventEmitter.call(this);

    var stream = net.createConnection(port, host);
    stream.on('connect', function() {
        var p = pipe.makePipe(stream);
        p.addHandler(require('./handlers/fixFrameDecoder.js').newFixFrameDecoder());
        p.addHandler(require('./handlers/logonManager.js').newLogonManager(true));
        p.addHandler(require('./handlers/sessionProcessor.js').newSessionProcessor(true));
        
        p.pushOutgoing({'8': fixVersion, '56': targetCompID, '49': senderCompID, '35': 'A', '90': '0', '108': '30'});
    });
    stream.on('data', function(data) { p.pushIncoming(data); });

    stream.on('connect', function() {
        self.emit('connect');
        self.session = new FIX(stream, false);
        self.session.on('data', function(data) { self.emit('data', data); });
        self.session.on('incomingmsg', function(data) { self.emit('incomingmsg', data); });
        self.session.on('outgoingmsg', function(data) { self.emit('outgoingmsg', data); });
        self.session.on('logon', function(sender,target) { self.emit('logon', sender, target); });
        self.session.on('logoff', function(sender,target) { self.emit('logoff', sender, target); });
        self.session.write(logonmsg);
    });
    stream.on('data', function(data) { self.session.onData(data); });
    stream.on('end', function() { self.emit('end');  });
    stream.on('error', function(exception) { self.emit('error', exception); });

    this.write = function(data) { self.session.write(data); };
    this.logoff = function(logoffReason){ self.session.write({35:5, 58:logoffReason}) };
}
sys.inherits(Client, events.EventEmitter);


