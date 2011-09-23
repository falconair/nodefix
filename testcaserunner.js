var fs = require('fs');
var pipe = require('pipe');
var fixutil = require('./fixutils.js');
var _  = require('underscore');
_.mixin(require('underscore.string'));

var file = process.argv[2];

fs.readFile(file,encoding='UTF8', function (err, data) {
    if (err) throw err;
    var self  = this;
    
    var lines = data.split('\n');
    var commandStack = [];
  
    var p = pipe.makePipe({end:function(){console.log("Stream ended");self.expected = "eDISCONNECT";}, on:function(){}});
    p.addHandler({'outgoing':function(ctx, evt){
        self.expected = evt.data;
        //console.log("outgoing:"+ evt.type+":"+ evt.data);
        var str = commandStack.pop();
        processCommand(str);
    }});
    p.addHandler(require('./handlers/fixFrameDecoder.js').newFixFrameDecoder());
    p.addHandler(require('./handlers/sessionProcessor.js').newSessionProcessor(true));

    
    _.each(lines,function(str){
        var c = str.charAt(0);
        if(/*c==='i' || c==='e' ||*/ c==='I' || c==='E'){
            //console.log("Adding to stack: "+str);
            commandStack.push(str);
        }
    });
    
    commandStack.reverse();
    
    var str = commandStack.pop();
    processCommand(str);
    
    function processCommand(str){
        console.log("Processing "+str);
        var direction = str.charAt(0);
        var msg = _.trim(str.substr(1,str.length));
        var map = fixutil.convertToMap(msg);

        if(direction=== '#'){ return ;}

        //initiate connection
        if(direction=== 'i'){ return ;}

        //expected disconnect
        if(direction=== 'e'){ return ;}
        
        //msgs sent to fix engine
        if(direction === 'I'){
            var fix = fixutil.convertRawToFIX(map);
            p.pushIncoming({type:'data', data:fix});            
        }
        
        //msgs expected from fix engine
        if(direction === 'E'){
            var expectedmap = fixutil.convertToMap(self.expected);
            
            //expectedmap[52] = '00000000-00:00:00';
            //var tempfix = fixutil.convertRawToFIX(expectedmap);
            
            //expectedmap = fixutil.convertToMap(tempfix);
            
            //remove time sensitive keys
            delete map[9];
            delete map[10];
            delete map[52];
            delete expectedmap[9];
            delete expectedmap[10];
            delete expectedmap[52];
            
            var isequal = _.isEqual(map,expectedmap);
            if(!isequal){
                console.log("Errors found:\n Expected msg:"+msg+"\n Actual msg  :"+self.expected);
                _.each(map, function(val, tag){
                    var tagmatches = expectedmap[tag] === val;
                    if(!tagmatches){
                        console.log(" Tag "+tag+" expecte value "+val+" but received "+expectedmap[tag]);
                    }
                });
            }
        }
    };
});