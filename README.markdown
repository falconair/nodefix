An implementation of the [FIX protocol (Financial Information Exchange)](http://en.wikipedia.org/wiki/Financial_Information_eXchange).

Currently the implementation is pre-beta.

New development
====
New development is being done on https://github.com/falconair/fix.js.
This codebase turned out to be over-engineered. fix.js is much simpler, but its infrastructure is not as developed (package file, 'npm install ...' system, tests, etc.)

Some code from fix.js (similar to this project) is also driving a web app to [parse fix protocol messages](http://fixparser.targetcompid.com) at http://fixparser.targetcompid.com

Install
====

    npm install nodefix

API
===

###Client:
```javascript

var client = new nodefix.Client({
    host: "demo.host.com",
    port: 80,
    fixVersion: "FIX.4.4",
    senderCompID: "**senderId**",
    targetCompID: "**targetId**",
    targetSubID: "**targetSubId**"
});

client.on("connect", function () {
    console.log("EVENT connect");
    client.logon("**username**", "**password**");
});

client.on("end", function () {
    console.log("EVENT end");
});

client.on("logon", function () {
    client.send("Market Data Request", [
        ["MDReqID", "EUR/USD please"],
        ["SubscriptionRequestType", "1"],
        ["MarketDepth", "1"],
        ["NoMDEntryTypes", "4"],
        ["MDEntryType", "0"],
        ["MDEntryType", "1"],
        ["MDEntryType", "7"],
        ["MDEntryType", "8"],
        ["NoRelatedSym", "4"],
        ["Symbol", "EUR/USD"],
        ["Symbol", "GBP/CAD"],
        ["Symbol", "GBP/JPY"],
        ["Symbol", "GBP/CHF"]
    ]);
    console.log("EVENT logon");
});

client.on("logoff", function () {
    console.log("EVENT logoff");
});

client.on("incoming", function (message) {
    console.log("IN", message.getFIX());
    console.log("IN", message.getType(), message.data);

    if (message.getType() === "Market Data-Snapshot/Full Refresh") {
        var price = message.getRepeating("MDEntryType", "MDEntryPx");
        console.log(message.get("Symbol"), "BID", price.Bid, "ASK", price.Offer);
    }
});

client.on("outgoing", function (message) {
    console.log("OUT", message.getFIX());
    console.log("OUT", message.getType(), message.data);
});

```



Not yet supported
===========

* Encryption


Known errors
===========

* Make sure ./traffic directory exists

License
=======
Copyright (C) 2011 by Shahbaz Chaudhary

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
