
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

Server events:
<dl>
<dt>newacceptor (port)</dt>
<dd>Triggered on new connections from clients</dd>
</dl>

Server methods:
<dl>
<dt>write(sessionID, data)</dt>
<dd>Converts an associative array to a FIX message and sends it to the counter party with given comp ID</dd>

<dt>logoff(sessionID, reason)</dt>
<dd>Logs off a given comp ID</dd>

<dt>kill(sessionID, reason)</dt>
<dd>Ends connection of a given comp ID, without logging off</dd>
</dl>

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
Client events:
<dl>
<dt>newclient (version, sender, target, port, host)</dt>
<dd>Triggered on new connections to servers</dd>
</dl>


Client methods:
<dl>
<dt>write(data)</dt>
<dd>Converts an associative array to a FIX message and sends it to the counter party</dd>

<dt>logoff(reason)</dt>
<dd>Logs off connection</dd>

<dt>kill(reason)</dt>
<dd>Ends connection without logging off</dd>
</dl>


###Common:
Events commons to servers and clients:
<dl>
<dt>connect (host, port, 'initiator' or 'acceptor')</dt>
<dd>Triggered on new connections </dd>

<dt>end (sender, target)</dt>
<dd>Triggered when connections end</dd>

<dt>error (err)</dt>
<dd>Triggered on error</dd>

<dt>logon (sender, target)</dt>
<dd>Triggered when new client completes logon</dd>

<dt>incomingmsg (sender, target, msg)</dt>
<dd>Triggered on messages coming over the network</dd>

<dt>outgoingmsg (sender, target, msg)</dt>
<dd>Triggered on messages going out to the network</dd>

<dt>incomingresync (sender, target, msg)</dt>
<dd>Triggered on messages coming over the network, which may have already been processed. Should not matter other than on re-connections</dd>

<dt>outgoingresync (sender, target, msg)</dt>
<dd>Triggered on messages going out to the network, which may have already been processed. Should not matter other than on re-connections</dd>
</dl>


Not yet supported
===========

* Groups
* Encryption
