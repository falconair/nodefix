var sys = require('sys');
var fix = require("./fix.js");

var session = fix.createConnection("FIX.4.2", "initiator", "acceptor", 56000, "localhost");
session.on("connect", function(){ console.log("connected"); });
//session.on("data", function(data){ console.log("Message: "+ sys.inspect(data)); });
//session.write({...});
