/*net = require('net');

net.createServer(function(stream){

    this.session = null;
    
    stream.on("connect", function() {this.session = require("./sessionHandler.js").makeSessionHandler(stream, true)} );
    stream.on("data",  function(data){ this.session.onData(data) });

}).listen(56000, "localhost");
*/
//test
var fix = require('./sessionHandler.js');
fix.createServer(function(session){
    session.on("logon", function(id){ console.log(id + " logged in"); });
    session.on("data", function(data){ console.log("Message: "+data); });
}).listen(56000, "localhost");
