var sys = require('sys');
var fs = require('fs');
var net = require('net');
var events = require('events');
var path = require('path');
var pipe = require('pipe');

//TODO
//Improve 'error' events. If sender/target exist, add them
//Clean up direct use of msg fields. Prefer the use of sender/target from context rather than trying to get fields directly (or do the opposite?)
//If no logon is established x seconds after connection, kill connection and notify client


//-----------------------------Expose server API-----------------------------
exports.createServer = function(func ) {
    var server = new Server(func);
    return server;
};

//TODO: handle error event, for example, when the listening port is already being used
function Server(func) {
     events.EventEmitter.call(this);

     this.sessions = {};

     var self = this;

     this.server = net.createServer(function(stream) {

        var session = this;

        this.senderCompID = null;
        this.targetCompID = null;
        this.fixVersion = null;
        
        this.p = null;
        function SessionEmitterObj(){
            events.EventEmitter.call(this);
            this.write = function(data){session.p.pushOutgoing({data:data, type:'data'});};
        }
        sys.inherits(SessionEmitterObj,events.EventEmitter);

        this.sessionEmitter = new SessionEmitterObj();


        stream.on('connect', function() {
            session.sessionEmitter.emit('connect');
            
            session.p = pipe.makePipe(stream);
            session.p.addHandler(require('./handlers/fixFrameDecoder.js').newFixFrameDecoder());
            session.p.addHandler({outgoing:function(ctx,event){ 
                if(event.type==='data'){
                    var fixmap = convertToMap(event.data);
                    session.sessionEmitter.emit('outgoingmsg',fixmap[49], fixmap[56], fixmap);
                }
                else if(event.type==='resync'){
                    session.sessionEmitter.emit('outgoingresync',event.data[49], event.data[56], event.data);
                }
                ctx.sendNext(event); 
            }});
            session.p.addHandler(require('./handlers/logonProcessor.js').newlogonProcessor(false));

            session.p.addHandler({incoming:function(ctx,event){
                if(event.type === 'data'){
                    session.sessionEmitter.emit('incomingmsg',event.data[49], event.data[56], event.data);
                }
                else if(event.type==='resync'){
                    self.emit('incomingresync',event.data[49], event.data[56], event.data);
                }

                ctx.sendNext(event);
            }});
            session.p.addHandler(require('./handlers/sessionProcessor.js').newSessionProcessor(false));

            session.p.addHandler({incoming:function(ctx,event){
                if(event.type === 'session' && event.data === 'logon'){
                    session.senderCompID = ctx.state.session.senderCompID;
                    session.targetCompID = ctx.state.session.targetCompID;
                    session.fixVersion = ctx.state.session.fixVersion;

                    session.sessionEmitter.emit('logon',ctx.state.session.senderCompID,ctx.state.session.targetCompID);
                }
                else if(event.type === 'session' && event.data === 'logoff'){
                    session.sessionEmitter.emit('logoff',ctx.state.session.senderCompID,ctx.state.session.targetCompID);
                }
                else if(event.type==='error'){
                    session.sessionEmitter.emit('error', event.data);
                }
                
                ctx.sendNext(event);

            }});
            
        });
        stream.on('data', function(data) { session.p.pushIncoming({data:data, type:'data'}); });
        
        func(session.sessionEmitter);

     });
     
     self.server.on('error', function(err){ self.emit('error', err); });

     this.listen = function(port, host, callback) { self.server.listen(port, host, callback); };
     this.write = function(targetCompID, data) { self.sessions[targetCompID].write({data:data, type:'data'}); };
     this.logoff = function(targetCompID, logoffReason) { self.sessions[targetCompID].write({data:{35:5, 58:logoffReason}, type:'data'}); };
     this.kill = function(targetCompID, reason){ self.sessions[targetCompID].end(); };
     /*this.getMessages = function(callback){
        var fileName = './traffic/' + session.fixVersion + '-' + session.senderCompID + '-' + session.targetCompID + '.log';
        fs.readFile(fileName, encoding='ascii', function(err,data){
            if(err){
                callback(err,null);
            }
            else{
                var transactions = data.split('\n');
                callback(null,transactions);
            }
        });
    };*/


}
sys.inherits(Server, events.EventEmitter);

//-----------------------------Expose client API-----------------------------
exports.createConnection = function(fixVersion, senderCompID, targetCompID, port, host,callback) {
    return new Client({'8': fixVersion, '56': targetCompID, '49': senderCompID, '35': 'A', '90': '0', '108': '10'}, port, host, callback);
};

exports.createConnectionWithLogonMsg = function(logonmsg, port, host, callback) {
    return new Client(logonmsg, port, host, callback);
};

function Client(logonmsg, port, host, callback) {
    events.EventEmitter.call(this);
    
    this.fixVersion = logonmsg.fixversion;
    this.senderCompID = logonmsg.senderCompID;
    this.targetCompID = logonmsg.targetCompID;

    this.session = null;
    var self = this;

    var stream = net.createConnection(port, host, callback);

    this.p = pipe.makePipe(stream);
    this.p.addHandler(require('./handlers/fixFrameDecoder.js').newFixFrameDecoder());

    this.p.addHandler({outgoing:function(ctx,event){ 
        if(event.type==='data'){
            var fixmap = convertToMap(event.data);
            self.emit('outgoingmsg', fixmap[49], fixmap[56],fixmap );
        }
        else if(event.type==='resync'){
            self.emit('outgoingresync',event.data[49], event.data[56], event.data);
        }
        ctx.sendNext(event);
    }});
    this.p.addHandler(require('./handlers/logonProcessor.js').newlogonProcessor(true));

    this.p.addHandler({incoming:function(ctx,event){ 
        if(event.type==='data'){
            self.emit('incomingmsg',event.data[49], event.data[56], event.data);
        }
        else if(event.type==='resync'){
            self.emit('incomingresync', event.data[49], event.data[56], event.data);
        }
        ctx.sendNext(event); 
    }});
    this.p.addHandler(require('./handlers/sessionProcessor.js').newSessionProcessor(true));

    this.p.addHandler({incoming:function(ctx,event){ 
        if(event.type==='session' && event.data==='logon'){
            self.emit('logon', ctx.state.session.senderCompID, ctx.state.session.targetCompID);
        }
        else if(event.type==='session' && event.data==='logoff'){
            self.emit('logoff', ctx.state.session.senderCompID, ctx.state.session.targetCompID);
        }
        else if(event.type==='error'){
            self.emit('error', event.data);
        }
        ctx.sendNext(event); 
    }});
    
    stream.on('connect', function() {
        self.emit('connect');
        self.p.pushOutgoing({data:logonmsg, type:'data'});
    });
    stream.on('data', function(data) { self.p.pushIncoming({data:data, type:'data'}); });

    this.write = function(data) { self.p.pushOutgoing(data); };
    //this.logoon = function(){ self.p.pushOutgoing({data:logonmsg, type:'data'}); };
    this.logoff = function(logoffReason){ self.p.pushOutgoing({data:{35:5, 58:logoffReason}, type:'data'}) };
    /*this.getMessages = function(callback){
        var fileName = './traffic/' + self.fixVersion + '-' + self.senderCompID + '-' + self.targetCompID + '.log';
        fs.readFile(fileName, encoding='ascii', function(err,data){
            if(err){
                callback(err,null);
            }
            else{
                var transactions = data.split('\n');
                callback(null,transactions);
            }
        });
    };*/
}
sys.inherits(Client, events.EventEmitter);

//TODO refactor, this is alraedy implemented in logonProcessor.js
//TODO refactor, this is already defined in logonProcessor.js
var SOHCHAR = String.fromCharCode(1);
function convertToMap(msg) {
    var fix = {};
    var keyvals = msg.split(SOHCHAR);
    for (var kv in Object.keys(keyvals)) {
        var kvpair = keyvals[kv].split('=');
        fix[kvpair[0]] = kvpair[1];
    }
    return fix;

}
