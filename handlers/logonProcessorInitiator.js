exports.newlogonProcessorInitiator = function() {
    return new logonProcessorInitiator();
};

var path = require('path');
var fs = require('fs');
var sys = require('sys');
var fixutil = require('./fixutils.js');


function logonProcessorInitiator(){

    //this.fileStream = null;
    var self = this;

    //||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||INCOMING
    this.incoming = function(ctx, event){
    
        if(event.type !== 'data'){
            ctx.sendNext(event);
            return;
        }

        var raw = event.data;
        var fix = convertToMap(raw);
        
        var msgType = fix['35'];
        
        if(ctx.state.session['isLoggedIn'] === false && msgType !== 'A'){
            var error = '[ERROR] First message must be logon:'+JSON.stringify(fix);
            sys.log(error);
            ctx.stream.end();
            ctx.sendNext({data:error, type:'error'});
            return;
        }
        else if(ctx.state.session['isLoggedIn'] === false && msgType === 'A'){
            ctx.state.session['isLoggedIn'] = true;
        }
        
        ctx.state.session.timeOfLastIncoming = new Date().getTime();
        ctx.state.fileStream.write(raw + '\n');

        ctx.sendNext({data:fix, type:'data'});
    }
    
    //||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||OUTGOING
    this.outgoing = function(ctx, event){

        if(event.type !== 'data'){
            ctx.sendNext(event);
            return;
        }

        var fix = event.data;
        var msgType = fix['35'];

        if(msgType === 'A'){
        
            //TODO do these comp ids match the session constants?
            var fixVersion = fix['8'];
            var senderCompID = fix['49'];
            var targetCompID = fix['56'];
                        
            var heartbeatInMilliSeconds = fix[108] || '30';

            ctx.state.session['heartbeatDuration'] = heartbeatInMilliSeconds;
            ctx.state.session['timeOfLastOutgoing'] = timeOfLastOutgoing;
            
            var fileName = './traffic/' + fixVersion + '-' + senderCompID + '-' + targetCompID + '.log';
            
            ctx.state.fileStream = fs.createWriteStream(fileName, {'flags':'a'});
            fs.readFile(fileName, encoding='ascii', function(err,data){
                if(err){
                    //console.log('DEBUG: file doesnt exist, but must due to createWriteStream call');
                }
                else{
                    //console.log('debug: before reading file, inseqnum:'+incomingSeqNum+', outseqnum:'+outgoingSeqNum);
                            
                    var transactions = data.split('\n');
                    for(var i=0; i<transactions.length; i++){
                        var tmap = convertToMap(transactions[i]);
                        //console.log('debug existing file read:'+JSON.stringify(tmap));
                        if(tmap[49] === senderCompID){ //If msg senderCompID matches our senderCompID, then it is outgoing msg
                            outgoingSeqNum = parseInt(tmap[34],10)+1;
                            ctx.sendNext({data:tmap, type:'resync'});
                        }
                        if(tmap[49] === targetCompID){ //incoming msg
                            incomingSeqNum = parseInt(tmap[34],10)+1;
                            ctx.sendPrev({data:tmap, type:'resync'});
                        }
                    }

                    //console.log('debug: after reading file, inseqnum:'+incomingSeqNum+', outseqnum:'+outgoingSeqNum);
                    
                    ctx.state.session['incomingSeqNum'] = incomingSeqNum;
                    ctx.state.session['outgoingSeqNum'] = outgoingSeqNum;

                }

                var outmsg = convertToFIX(
                    fix,
                    fixVersion, 
                    getUTCTimeStamp(new Date()), 
                    senderCompID, 
                    targetCompID, 
                    outgoingSeqNum);

                ctx.state.session.outgoingSeqNum ++;

                ctx.state.fileStream.write(outmsg+'\n');
                ctx.sendNext({data:outmsg, type:'data'});
            });
        }
        else{
            
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
}

