var sys = require('sys');
var fix = require('./fix.js');

fix.createServer(function(session){
    session.on("logon", function(id){ console.log(id + " logged in"); });
    session.on("data", function(data){ console.log("Message: "+ sys.inspect(data)); });
}).listen(56000, "localhost");
