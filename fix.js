var sys = require('sys');
var fs = require('fs');
var net = require('net');
var events = require('events');
var path = require('path');
var pipe = require('pipe');

//TODO
//Improve 'error' events. If sender/target exist, add them
//Clean up direct use of msg fields. Prefer the use of sender/target from context rather 
//than trying to get fields directly (or do the opposite?)
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

        stream.setTimeout(2 * 60 * 1000);//if no traffic for two minutes, kill connection!
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
            session.p.addHandler(require('./handlers/outMsgEvtInterceptor.js').newOutMsgEvtInterceptor(session));
            session.p.addHandler(require('./handlers/sessionProcessor2.js').newSessionProcessor(true));
            session.p.addHandler(require('./handlers/inMsgEvtInterceptor.js').newInMsgEvtInterceptor(session));
            
            
        });
        stream.on('data', function(data) { session.p.pushIncoming({data:data, type:'data'}); });
        stream.on('timeout', function(){ stream.end(); });
        
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
exports.createConnection = function(fixVersion, senderCompID, targetCompID) {
    //return new Client({'8': fixVersion, '56': targetCompID, '49': senderCompID, '35': 'A', '90': '0', '108': '10'}, port, host, callback);
    return new Client(fixVersion, senderCompID, targetCompID);
};

/*exports.createConnectionWithLogonMsg = function(logonmsg, port, host, callback) {
    return new Client(logonmsg, port, host, callback);
};*/

function Client(fixVersion, senderCompID, targetCompID) {
    events.EventEmitter.call(this);
    

    this.session = null;
    var self = this;

    var stream = null;

    self.p = pipe.makePipe(stream);
    self.p.addHandler(require('./handlers/fixFrameDecoder.js').newFixFrameDecoder());
    self.p.addHandler(require('./handlers/outMsgEvtInterceptor.js').newOutMsgEvtInterceptor(session));
    self.p.addHandler(require('./handlers/sessionProcessor2.js').newSessionProcessor(false));
   self.p.addHandler(require('./handlers/inMsgEvtInterceptor.js').newInMsgEvtInterceptor(session));
 
    
    stream.on('connect', function() {
        self.emit('connect');
        self.p.pushOutgoing({data:logonmsg, type:'data'});
    });
    stream.on('data', function(data) { self.p.pushIncoming({data:data, type:'data'}); });

    //--CLIENT METHODS--
    this.write = function(data) { self.p.pushOutgoing(data); };
    this.createConnection = function(port, host, callback){
    
        self.p.state.session['remoteAddress'] = host;
        self.stream = net.createConnection(port, host, callback);
    }
    this.logon = function(){
        self.write({'35': 'A', '90': '0', '108': '10'});
    }
    this.connectAndLogon = function(port, host, callback){
        self.createConnection(port, host, function(error, data){
            if(error === null){
                self.logon();
                callback(null, data);
            }
            else{
                callback(error,data);
            }
        });
    }
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


