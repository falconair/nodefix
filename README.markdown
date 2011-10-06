
An implementation of the [FIX (Financial Information Exchange) protocol](http://en.wikipedia.org/wiki/Financial_Information_eXchange).

Currently the implementation is pre-beta.

Install
====

    npm install nodefix

Test {Server,Client}
============

You can run a test server:

<pre>
node testFIXServer.js
</pre>

then a test client, too:

<pre>
node testFIXClient.js
</pre>

Both programs should start communicating with each other.  Wait a few seconds to see
heart-beat messages fly by.

API
===

###Server:
```javascript
var fix = require('fix');

var opt = {};
var server = fix.createServer(opt, function(session){

    session.on("logon", function(sender, target){ console.log("EVENT logon: "+ sender + ", " + target); });
    session.on("incomingmsg", function(sender,target,msg){ console.log("Server incomingmsg: "+ JSON.stringify(msg)); });
    session.on("outgoingmsg", function(sender,target,msg){ console.log("Server outgoingmsg: "+ JSON.stringify(msg)); });

});
server.listen(1234, "localhost", function(){});
```

###Client:
```javascript
var fix = require('fix');

var opt = {};
var client = fix.createClient("FIX.4.2", "initiator", "acceptor",opt);
client.connectAndLogon(1234,"localhost");

client.on("connect", function(){ console.log("EVENT connect"); });
client.on("end", function(){ console.log("EVENT end"); });
client.on("logon", function(sender, target){ console.log("EVENT logon: "+ sender + ", " + target); });
client.on("logoff", function(sender, target){ console.log("EVENT logoff: "+ sender + ", " + target); });
client.on("incomingmsg", function(sender,target,msg){ console.log("EVENT incomingmsg: "+ JSON.stringify(msg)); });
client.on("outgoingmsg", function(sender,target,msg){ console.log("EVENT outgoingmsg: "+ JSON.stringify(msg)); });

```
//  startClient(version,sender,target,port,host)
//      -newclient(version, sender, target, port, host)
//
//Common:
//      -connect(host, port, 'initiator' or 'acceptor')
//      -error(err)
//      -logon(sender,target)
//      -logoff(sender,target)
//      -incomingmsg(sender,target,msg)
//      -outgoingmsg(sender,target,msg)
//      -incomingresync(sender,target,msg)
//      -outgoingresync(sender,target,msg)
//      -end(sender,target)
//  write(sessionID, data)
//  logoff(sessionID, reason)
//  kill(sessionID, reason)
//  clearSessionFile(fixVersion,senderCompID, targetCompID, callback)
//  getSessionFiles(callback)


Not yet supported
===========

* Groups
* Encryption
