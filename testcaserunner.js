var fs = require('fs');
var _ = require('underscore');
var pipe = require('pipe');

var file = process.argv[2];

fs.readFile(file,encoding='UTF8', function (err, data) {
  if (err) throw err;
  console.log(data);
  
    var stream = null;
    var p = pipe.makePipe(stream);
    p.addHandler(require('./handlers/fixFrameDecoder.js').newFixFrameDecoder());
    p.addHandler(require('./handlers/sessionProcessor2.js').newSessionProcessor(true,t,t));
});

var t = function(){ return true;}