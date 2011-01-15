var sys = require('sys');
var fix = require('./fix.js');

fix.createServer(function(session){
    session.on("connect", function(){ console.log("EVENT connect"); });
    session.on("logon", function(sender, target){ console.log("EVENT logon: "+ sender + ", " + target); });
    session.on("data", function(data){ console.log("EVENT data: "+ sys.inspect(data)); });
    session.on("incomingmsg", function(data){ console.log("EVENT incomingmsg: "+ sys.inspect(data)); });
    session.on("outgoingmsg", function(data){ console.log("EVENT outgoingmsg: "+ sys.inspect(data)); });

}).listen(56000, "localhost");
