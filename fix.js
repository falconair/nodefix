/*

Copyright (c) 2010 Shahbaz Chaudhary

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.


*/

var net = require("net");
var events = require("events");
var sys = require("util");
var logger = require("./lib/logger").createLogger();
var pipe = require("./lib/nodepipe");

var FIXFrameDecoder = require("./handlers/FIXFrameDecoder");
var FIXMsgDecoder = require("./handlers/FIXMsgDecoder");
var FIXMsgEncoder = require("./handlers/FIXMsgEncoder");
var FIXMsgValidator = require("./handlers/FIXMsgValidator");
var FIXIdleHandler = require("./handlers/FIXIdleHandler");
var FIXInitiatorLogonHandler = require("./handlers/FIXInitiatorLogonHandler");

//---------------------CLIENT
function Client(senderCompID, targetCompID, opt) {
    events.EventEmitter.call(this);

}
sys.inherits(Client, events.EventEmitter);
Client.prototype.end = function () { this.stream.end(); };
Client.prototype.write = function (data) { this.pipeline.pushOutgoing(data); };

//---------------------CLIENT EXPORT
exports.createConnection = function (senderCompID, targetCompID, heartbeatseconds, opt, port, host) {

    var client = new Client(senderCompID, targetCompID, opt);

    var stream = net.createConnection(port, host);

    var pipeline = pipe.makePipe(stream);
    pipeline.addHandler({outgoing: function(ctx,event){if(event.eventType==="data"){ stream.write(event.data);}} });
    pipeline.addHandler(FIXFrameDecoder.makeFIXFrameDecoder());
    pipeline.addHandler(FIXMsgEncoder.makeFIXMsgEncoder());
    pipeline.addHandler(FIXMsgDecoder.makeFIXMsgDecoder());
    pipeline.addHandler(FIXMsgValidator.makeFIXMsgValidator());
    pipeline.addHandler(FIXInitiatorLogonHandler.makeFIXInitiatorLogonHandler());
    pipeline.addHandler(FIXIdleHandler.makeFIXIdleHandler());
    pipeline.addHandler({incoming:function(ctx,event){if(event.eventType==="data"){session.emit("data",event.data); }} });
    
    stream.setEncoding("utf8");
    
    stream.on("data", function(data){pipeline.pushIncoming({eventType:"data", data:data});}); 
    stream.on("end", function(){
        pipeline.pushIncoming({eventType:"end"});
        session.emit("end");
    }); 

    client.stream = stream;
    client.pipeline = pipeline;

    stream.on("connect", function () {
        session.emit("connect");
        pipeline.pushOutgoing({
            "35": "A",
            "49": senderCompID,
            "56": targetCompID,
            "108": heartbeatseconds,
            "98": 0
        });
    });

    stream.on("end", function () {
        session.emit("end");
    });

    //stream.on("data", function(data){session.handle(data);});

    return client;
};


//---------------------SERVER
function Server(opt, func) {
    events.EventEmitter.call(this);
    //this.clients = {};

    net.createServer(function(stream){
        var pipeline = pipe.makePipe(stream);

        pipeline.addHandler({outgoing: function(ctx,event){if(event.eventType==="data"){stream.write(event.data);}} });
        pipeline.addHandler(FIXFrameDecoder.makeFIXFrameDecoder());
        pipeline.addHandler(FIXMsgEncoder.makeFIXMsgEncoder());
        pipeline.addHandler(FIXMsgDecoder.makeFIXMsgDecoder());
        pipeline.addHandler(FIXMsgValidator.makeFIXMsgValidator());
        pipeline.addHandler(FIXIdleHandler.makeFIXIdleHandler());
        //TODO dispatch events to func?
        
        stream.setEncoding("utf8");
        
        stream.on("data", function(data){pipeline.pushIncoming({eventType:"data", data:data});}); 
        stream.on("end", function(){pipeline.pushIncoming({eventType:"end"});}); 
    });

}
sys.inherits(Server, events.EventEmitter);
Server.prototype.listen = function (port) { this.stream.listen(port); };
//Server.prototype.write = function(client, msg) { this.clients[client].write(msg); };
//Server.prototype.end = function(client){ this.clients[client].end(); };



//---------------------SERVER EXPORT
exports.createServer = function (opt, func) {
    
    var server = new Server(opt, func);
    
    
    return server;
}

