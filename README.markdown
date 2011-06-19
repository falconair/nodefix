
An implementation of the [FIX (Financial Information Exchange) protocol](http://en.wikipedia.org/wiki/Financial_Information_eXchange).

Currently the implementation is pre-beta. It is close to working.

### Test {Server,Client}:

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

### Not yet supported:

* Groups
* Encryption
