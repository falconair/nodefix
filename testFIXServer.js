var sys = require('sys');
var fix = require('./fix.js');

fix.createServer(function(session){
    session.on("connect", function(){ console.log("EVENT connect"); });
    session.on("end", function(sender,target){ console.log("EVENT end"); });
    session.on("logon", function(sender, target){ console.log("EVENT logon: "+ sender + ", " + target); });
    session.on("incomingmsg", function(data){ console.log("EVENT incomingmsg: "+ JSON.stringify(data)); });
    session.on("outgoingmsg", function(data){ console.log("EVENT outgoingmsg: "+ JSON.stringify(data)); });

}).listen(1234, "localhost");

