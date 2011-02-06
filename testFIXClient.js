var sys = require('sys');
var fix = require("./fix.js");

var session = fix.createConnection("FIX.4.2", "initiator", "acceptor", 1234, "localhost");
//session.logon();
session.on("connect", function(){ console.log("EVENT connect"); });
session.on("end", function(){ console.log("EVENT end"); });
session.on("logon", function(sender, target){ console.log("EVENT logon: "+ sender + ", " + target); });
session.on("logoff", function(sender, target){ console.log("EVENT logoff: "+ sender + ", " + target); });
session.on("incomingmsg", function(data){ console.log("EVENT incomingmsg: "+ JSON.stringify(data)); });
session.on("outgoingmsg", function(data){ console.log("EVENT outgoingmsg: "+ JSON.stringify(data)); });

