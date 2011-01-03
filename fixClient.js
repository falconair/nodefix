net = require('net');

this.session = null;

var stream = net.createConnection(56000,"localhost");
stream.on("connect", function(){
    this.session = require("./sessionHandler.js").makeSessionHandler(stream, false);
    this.session.toSender({"8":"FIX.4.2", 
        "56":"acceptor", 
        "49":"initiator", 
        "35":"A", 
        "90":"0", 
        "108":"30"});
});
stream.on("data", function(data){ this.session.onData(data); });




