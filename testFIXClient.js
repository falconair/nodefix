/*var sys = require('sys');
var fix = require("./fix.js");

var session = fix.createConnection("FIX.4.2", "initiator", "acceptor", 56000, "localhost");
session.on("connect", function(){ console.log("EVENT connect"); });
session.on("end", function(){ console.log("EVENT end"); });
session.on("logon", function(sender, target){ console.log("EVENT logon: "+ sender + ", " + target); });
session.on("logoff", function(sender, target){ console.log("EVENT logoff: "+ sender + ", " + target); });
session.on("data", function(data){ console.log("EVENT data: "+ JSON.stringify(data)); });
session.on("incomingmsg", function(data){ console.log("EVENT incomingmsg: "+ JSON.stringify(data)); });
session.on("outgoingmsg", function(data){ console.log("EVENT outgoingmsg: "+ JSON.stringify(data)); });
//session.write({...});
*/

var net = require('net');
var pipe = require('./lib/nodepipe.js');

var port = 1234;
var host = 'localhost';

var fixVersion = 'FIX.4.2';
var targetCompID = 'TARGET';
var senderCompID = 'SENDER';


var stream = net.createConnection(port, host);

stream.on('connect', function() {
    var p = pipe.makePipe(stream);
    p.addHandler(require('./handlers/fixFrameDecoder.js').newFixFrameDecoder());
    p.addHandler(require('./handlers/logonManager.js').newLogonManager(true));
    p.addHandler(require('./handlers/sessionProcessor.js').newSessionProcessor(true));
    
    p.pushOutgoing({'8': fixVersion, '56': targetCompID, '49': senderCompID, '35': 'A', '90': '0', '108': '30'});
});

