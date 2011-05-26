var fs = require('fs');
var pipe = require('pipe');
var _  = require('underscore');
_.mixin(require('underscore.string'));

var file = process.argv[2];

fs.readFile(file,encoding='UTF8', function (err, data) {
  if (err) throw err;
  var d = data.split('\n');
  //console.log(d);
  
    var stream = null;
    var p = pipe.makePipe(stream);
    p.addHandler(require('./handlers/fixFrameDecoder.js').newFixFrameDecoder());
    p.addHandler(require('./handlers/sessionProcessor2.js').newSessionProcessor(true));
    
    //TODO: for each line (at a time), submit events and expect answers
    
    _.each(d, function(str){
        var c = str.charAt(0);
        var v = _.trim(str.substr(1,str.length));
        //console.log(v);

        if(c=== '#'){ return ;}
        
        
        if(c === 'i'){
            p.pushIncoming(str);            
        }
        
        
    });
});

