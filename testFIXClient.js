var sys = require('sys');
var fix = require("./fix.js");

var session = fix.createConnection("FIX.4.2", "initiator", "acceptor", 1234, "localhost");
session.connectAndLogon(1234,'localhost');
/*session.getMessages(function(err, msg){
    if(err){
        console.log('Err from data store: '+err);     
    }
    else{
        console.log('Msg from data store: '+JSON.stringify(msg)); 
    }
});*/
session.on("connect", function(){ console.log("EVENT connect"); });
session.on("end", function(){ console.log("EVENT end"); });
session.on("logon", function(sender, target){ console.log("EVENT logon: "+ sender + ", " + target); });
session.on("logoff", function(sender, target){ console.log("EVENT logoff: "+ sender + ", " + target); });
session.on("incomingmsg", function(sender,target,msg){ console.log("EVENT incomingmsg: "+ JSON.stringify(msg)); });
session.on("outgoingmsg", function(sender,target,msg){ console.log("EVENT outgoingmsg: "+ JSON.stringify(msg)); });
session.on("incomingresync", function(sender,target,msg){ console.log("EVENT incomingresync: "+ JSON.stringify(msg)); });
session.on("outgoingresync", function(sender,target,msg){ console.log("EVENT outgoingresync: "+ JSON.stringify(msg)); });

