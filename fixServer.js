var fix = require('./fix.js');
fix.createServer(function(session){
    session.on("logon", function(id){ console.log(id + " logged in"); });
    session.on("data", function(data){ console.log("Message: "+data); });
}).listen(56000, "localhost");
