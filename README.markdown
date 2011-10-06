
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

startServer(port,callback)
//      -newacceptor(port)
//
//Client:
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
