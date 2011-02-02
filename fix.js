var sys = require('sys');
var fs = require('fs');
var net = require('net');
var events = require('events');
var path = require('path');
var pipe = require('./lib/nodepipe.js');


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

        var session = this;

        this.senderCompID = null;
        this.targetCompID = null;
        this.p = null;
        function SessionEmitterObj(){
            events.EventEmitter.call(this);
            this.write = function(data){session.p.pushOutgoing(data);};
        }
        sys.inherits(SessionEmitterObj,events.EventEmitter);

        this.sessionEmitter = new SessionEmitterObj();


        stream.on('connect', function() {
            session.sessionEmitter.emit('connect');
            
            session.p = pipe.makePipe(stream);
             //session.p.addHandler({incoming:function(ctx,event){ sys.log('indebug1:'+event); ctx.sendNext(event); }});
             //session.p.addHandler({outgoing:function(ctx,event){ sys.log('outdebug1:'+event); ctx.sendNext(event); }});
            session.p.addHandler(require('./handlers/fixFrameDecoder.js').newFixFrameDecoder());
             //session.p.addHandler({incoming:function(ctx,event){ sys.log('indebug2:'+event); ctx.sendNext(event); }});
             //session.p.addHandler({outgoing:function(ctx,event){ sys.log('outdebug2:'+event); ctx.sendNext(event); }});
            session.p.addHandler(require('./handlers/msgValidator.js').newMsgValidator());
             //session.p.addHandler({incoming:function(ctx,event){ sys.log('indebug3:'+event); ctx.sendNext(event); }});
             //session.p.addHandler({outgoing:function(ctx,event){ sys.log('outdebug3:'+event); ctx.sendNext(event); }});
            session.p.addHandler(require('./handlers/persister.js').newPersister(false));
             //session.p.addHandler({incoming:function(ctx,event){ sys.log('indebug4:'+event); ctx.sendNext(event); }});
             //session.p.addHandler({outgoing:function(ctx,event){ sys.log('outdebug4:'+event); ctx.sendNext(event); }});
            session.p.addHandler({incoming:function(ctx,event){ 
                session.sessionEmitter.emit('incomingmsg',event);
                
                if(event['35'] === 'A'){//if logon
                    session.senderCompID = event['49'];
                    session.targetCompID = event['56'];
                    self.sessions[session.senderCompID + '-' + session.targetCompID] = session;
                    session.sessionEmitter.emit('logon', session.senderCompID, session.targetCompID);
                }
                
                if(event['35'] === '5'){
                    delete self.sessions[session.senderCompID + '-' + session.targetCompID];
                    session.sessionEmitter.emit('logoff', session.senderCompID, session.targetCompID);
                }

                ctx.sendNext(event);
            }});
            session.p.addHandler({outgoing:function(ctx,event){ session.sessionEmitter.emit('outgoingmsg',event); ctx.sendNext(event); }});
            session.p.addHandler(require('./handlers/sessionProcessor.js').newSessionProcessor(false));
            
        });
        stream.on('data', function(data) { session.p.pushIncoming(data); });
        
        func(session.sessionEmitter);

     });

     this.listen = function(port, host) { self.stream.listen(port, host); };
     this.write = function(targetCompID, data) { self.sessions[targetCompID].write(data); };
     this.logoff = function(targetCompID, logoffReason) { self.sessions[targetCompID].write({35:5, 58:logoffReason}); };
     this.kill = function(targetCompID, reason){ self.sessions[targetCompID].end(); };

}
sys.inherits(Server, events.EventEmitter);

//-----------------------------Expose client API-----------------------------
exports.createConnection = function(fixVersion, senderCompID, targetCompID, port, host) {
    return new Client({'8': fixVersion, '56': targetCompID, '49': senderCompID, '35': 'A', '90': '0', '108': '10'}, port, host);
};

exports.createConnectionWithLogonMsg = function(logonmsg, port, host) {
    return new Client(logonmsg, port, host);
};

function Client(logonmsg, port, host) {
    events.EventEmitter.call(this);

    this.session = null;
    var self = this;

    var stream = net.createConnection(port, host);

    this.p = pipe.makePipe(stream);
     //this.p.addHandler({incoming:function(ctx,event){ sys.log('indebug0:'+event); ctx.sendNext(event); }});
     //this.p.addHandler({outgoing:function(ctx,event){ sys.log('outdebug1:'+event); ctx.sendNext(event); }});
    this.p.addHandler(require('./handlers/fixFrameDecoder.js').newFixFrameDecoder());
     //this.p.addHandler({incoming:function(ctx,event){ sys.log('indebug1:'+event); ctx.sendNext(event); }});
     //this.p.addHandler({outgoing:function(ctx,event){ sys.log('outdebug1:'+event); ctx.sendNext(event); }});
    this.p.addHandler(require('./handlers/msgValidator.js').newMsgValidator());
    this.p.addHandler(require('./handlers/persister.js').newPersister(true));
    this.p.addHandler({outgoing:function(ctx,event){ self.emit('outgoingmsg',event); ctx.sendNext(event);}});
    this.p.addHandler(require('./handlers/sessionProcessor.js').newSessionProcessor(true));
    this.p.addHandler({incoming:function(ctx,event){ self.emit('incomingmsg',event); ctx.sendNext(event); }});
    
    stream.on('connect', function() {
        self.emit('connect');
        self.p.pushOutgoing(logonmsg);
    });
    stream.on('data', function(data) { self.p.pushIncoming(data); });

    this.write = function(data) { self.p.pushOutgoing(data); };
    this.logoff = function(logoffReason){ self.p.pushOutgoing({35:5, 58:logoffReason}) };
}
sys.inherits(Client, events.EventEmitter);
