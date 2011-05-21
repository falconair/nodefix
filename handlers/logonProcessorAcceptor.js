exports.newlogonProcessorAcceptor = function() {
    return new logonProcessorAcceptor();
};

var path = require('path');
var fs = require('fs');
var sys = require('sys');
var fixutil = require('./fixutils.js');


function logonProcessorAcceptor(){

    var self = this;

    //||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||INCOMING
    this.incoming = function(ctx, event){
    
        if(event.type !== 'data'){
            ctx.sendNext(event);
            return;
        }

        //====================================Step 3: Convert to map====================================
        var raw = event.data;
        var fix = convertToMap(raw);


        //====================================Step 4: Create Data Store==========================
        var msgType = fix['35'];


        if(ctx.state.session['isLoggedIn'] === false && msgType !== 'A'){
            var error = '[ERROR] First message must be logon:'+JSON.stringify(fix);
            sys.log(error);
            ctx.stream.end();
            ctx.sendNext({data:error, type:'error'});
            return;
        }
        else if(ctx.state.session['isLoggedIn'] === false && msgType === 'A'){
            var fixVersion = fix['8'];
            var senderCompID = fix['56'];
            var targetCompID = fix['49'];
                        
            var incomingSeqNum = 1;
            var outgoingSeqNum = 1;

            var heartbeatInMilliSeconds = fix[108] || '30';

            ctx.state.session['fixVersion'] = fixVersion;
            ctx.state.session['senderCompID'] = senderCompID;
            ctx.state.session['targetCompID'] = targetCompID;
            ctx.state.session['incomingSeqNum'] = incomingSeqNum;
            ctx.state.session['outgoingSeqNum'] = outgoingSeqNum;
            ctx.state.session['heartbeatDuration'] = parseInt(heartbeatInMilliSeconds,10) * 1000;
            ctx.state.session['timeOfLastIncoming'] = new Date().getTime();

            
            var fileName = './traffic/' + fixVersion + '-' + senderCompID + '-' + targetCompID + '.log';
            sys.log('Attempting to read file '+fileName);

            ctx.state.fileStream = fs.createWriteStream(fileName, {'flags':'a'});
            fs.readFile(fileName, encoding='ascii', function(err,data){
                if(err){
                    //console.log('debug: file doesnt exist, but must due to createWriteStream call');
                    //console.log('debug actual error:'+err);
                }
                else{
                    var transactions = data.split('\n');
                    for(var i=0; i<transactions.length; i++){
                        var tmap = convertToMap(transactions[i]);

                        if(tmap[49] === senderCompID){ //If msg senderCompID matches our senderCompID, then it is outgoing msg
                            outgoingSeqNum = parseInt(tmap[34],10) +1;
                            ctx.sendPrev({data:tmap, type:'resync'});
                        }
                        if(tmap[49] === targetCompID){ //incoming msg
                            incomingSeqNum = parseInt(tmap[34],10) +1;
                            ctx.sendNext({data:tmap, type:'resync'});
                        }
                    }

                    ctx.state.session.incomingSeqNum = incomingSeqNum;
                    ctx.state.session.outgoingSeqNum = outgoingSeqNum;

                }

                ctx.state.session['isLoggedIn'] = true;
                
                
                ctx.state.fileStream.write(raw + '\n');
                ctx.sendNext({data:fix, type:'data'});
            });
        }
        else{ // if isLoggedIn === true and mstType === anything
            ctx.state.session.timeOfLastIncoming = new Date().getTime();
            ctx.state.fileStream.write(raw + '\n');
            ctx.sendNext({data:fix, type:'data'});
        }
    }
    
    //||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||OUTGOING
    this.outgoing = function(ctx, event){

        if(event.type !== 'data'){
            ctx.sendNext(event);
            return;
        }

        var fix = event.data;        
            
        var outmsg = convertToFIX(fix,ctx.state.session.fixVersion, 
            getUTCTimeStamp(new Date()), 
            ctx.state.session.senderCompID, 
            ctx.state.session.targetCompID, 
            ctx.state.session.outgoingSeqNum);

        ctx.state.session.outgoingSeqNum ++;

        ctx.state.session.timeOfLastOutgoing = new Date().getTime();
        ctx.state.fileStream.write(outmsg+'\n');
        ctx.sendNext({data:outmsg, type:'data'});
    }
}






