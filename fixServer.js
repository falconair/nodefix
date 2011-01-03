net = require('net');

net.createServer(function(stream){

    this.session = null;
    
    stream.on("connect", function() {this.session = require("./sessionHandler.js").makeSessionHandler(stream, false)} );
    stream.on("data",  function(data){ this.session.onData(data) });

}).listen(56000, "localhost");


