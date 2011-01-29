var sys = require('sys');
var fix = require('./fix.js');

fix.createServer(function(session){
    session.on("connect", function(){ console.log("EVENT connect"); });
    session.on("end", function(sender,target){ console.log("EVENT end"); });
    session.on("logon", function(sender, target){ console.log("EVENT logon: "+ sender + ", " + target); });
    session.on("data", function(data){ console.log("EVENT data: "+ JSON.stringify(data)); });
    session.on("incomingmsg", function(data){ console.log("EVENT incomingmsg: "+ JSON.stringify(data)); });
    session.on("outgoingmsg", function(data){ console.log("EVENT outgoingmsg: "+ JSON.stringify(data)); });

}).listen(1234, "localhost");

/*
var net = require('net');
var pipe = require('./lib/nodepipe.js');

net.createServer(function(stream) {


        stream.on('connect', function() {
            var p = pipe.makePipe(stream);
            p.addHandler(require('./handlers/fixFrameDecoder.js').newFixFrameDecoder());
            p.addHandler(require('./handlers/logonManager.js').newLogonManager(false));
            p.addHandler(require('./handlers/sessionProcessor.js').newSessionProcessor(false));
        });


}).listen(1234,'localhost');
*/