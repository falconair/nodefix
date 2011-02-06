exports.newPersister = function(isInitiator) {
    return new persister(isInitiator);
};

var path = require('path');
var fs = require('fs');
var sys = require('sys');

//static vars
var SOHCHAR = String.fromCharCode(1);

function persister(isInitiator){

    //this.fileStream = null;
    var self = this;

    //||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||INCOMING
    this.incoming = function(ctx, event){
    
        if(event.type !== 'data'){
            ctx.sendNext(event);
            return;
        }

        //====================================Step 3: Convert to map====================================
        var fix = convertToMap(event.data);

        var raw = event.data;

        //====================================Step 4: Create Data Store==========================
        var msgType = fix['35'];
        
        //If logon
        if(msgType === 'A' && !isInitiator){
            var fixVersion = fix['8'];
            var senderCompID = fix['56'];
            var targetCompID = fix['49'];
                        
            var incomingSeqNum = 1;
            var outgoingSeqNum = 1;

            var heartbeatInMilliSeconds = fix[108] || '30';

            ctx.state['session'] = {
                'fixVersion':fixVersion, 
                'senderCompID':senderCompID, 
                'targetCompID':targetCompID,
                'incomingSeqNum':incomingSeqNum,
                'outgoingSeqNum':outgoingSeqNum,
                'heartbeatDuration':parseInt(heartbeatInMilliSeconds,10) * 1000,
                'testRequestID':1,
                'isLoggedIn':false,
                'isResendRequested':false,
                //'timeOfLastOutgoing':null,
                'isInitiator':isInitiator,
                'remoteAddress':"N/A",
                'timeOfLastIncoming':new Date().getTime()
            };
            
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

                ctx.state.fileStream.write(raw + '\n');
                ctx.sendNext({data:fix, type:'data'});
            });
        }
        else /*if(ctx.state.session && ctx.state.session.isLoggedIn)*/{
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
        var msgType = fix['35'];

        //if logon (which means this is an initiator session)
        if(msgType === 'A' && isInitiator){
            var fixVersion = fix['8'];
            var senderCompID = fix['49'];
            var targetCompID = fix['56'];
                        
            var incomingSeqNum = 1;
            var outgoingSeqNum = 1;

            var heartbeatInMilliSeconds = fix[108] || '30';

            ctx.state['session'] = {
                'fixVersion':fixVersion, 
                'senderCompID':senderCompID, 
                'targetCompID':targetCompID,
                'incomingSeqNum':incomingSeqNum,
                'outgoingSeqNum':outgoingSeqNum,
                'heartbeatDuration':parseInt(heartbeatInMilliSeconds,10) * 1000,
                'testRequestID':1,
                'isLoggedIn':false,
                'isResendRequested':false,
                'timeOfLastOutgoing':new Date().getTime(),
                'isInitiator':isInitiator,
                'remoteAddress':"N/A"
                //'timeOfLastIncoming':new Date().getTime()
            };
            
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
                    
                    ctx.state.session.incomingSeqNum = incomingSeqNum;
                    ctx.state.session.outgoingSeqNum = outgoingSeqNum;

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

function convertToMap(msg) {
    var fix = {};
    var keyvals = msg.split(SOHCHAR);
    for (var kv in Object.keys(keyvals)) {
        var kvpair = keyvals[kv].split('=');
        fix[kvpair[0]] = kvpair[1];
    }
    return fix;

}

function convertToFIX(msgraw, fixVersion, timeStamp, senderCompID, targetCompID, outgoingSeqNum){
    //sys.log('c2F:'+JSON.stringify(msgraw));
    //defensive copy
    var msg = {};
    for (var tag in msgraw) {
        if (msgraw.hasOwnProperty(tag)) msg[tag] = msgraw[tag];
    }
    
    delete msg['9']; //bodylength
    delete msg['10']; //checksum


    var timestamp = new Date();
    var headermsgarr = [];
    var bodymsgarr = [];
    var trailermsgarr = [];

    msg['8'] = fixVersion; //fixversion
    msg['52'] = timeStamp; //timestamp
    msg['49'] = senderCompID; //sendercompid
    msg['56'] = targetCompID; //targetcompid
    msg['34'] = outgoingSeqNum; //seqnum


    headermsgarr.push('52=' + msg['52'] , SOHCHAR);
    headermsgarr.push('49=' + msg['49'] , SOHCHAR);
    headermsgarr.push('56=' + msg['56'] , SOHCHAR);
    headermsgarr.push('34=' + msg['34'] , SOHCHAR);


    for (var tag in msg) {
        if (msg.hasOwnProperty(tag)
            && tag !== 8
            && tag !== 9
            && tag !== 10
            && tag !== 52
            && tag !== 49
            && tag !== 56
            && tag !== 34
            ) bodymsgarr.push(tag, '=' , msg[tag] , SOHCHAR);
    }

    var headermsg = headermsgarr.join('');
    var trailermsg = trailermsgarr.join('');
    var bodymsg = bodymsgarr.join('');

    var outmsgarr = [];
    outmsgarr.push('8=' , msg['8'] , SOHCHAR);
    outmsgarr.push('9=' , (headermsg.length + bodymsg.length + trailermsg.length) , SOHCHAR);
    outmsgarr.push(headermsg);
    outmsgarr.push(bodymsg);
    outmsgarr.push(trailermsg);

    var outmsg = outmsgarr.join('');

    outmsg += '10=' + checksum(outmsg) + SOHCHAR;
        
    return outmsg;

}

function checksum(str) {
    var chksm = 0;
    for (var i = 0; i < str.length; i++) {
        chksm += str.charCodeAt(i);
    }

    chksm = chksm % 256;

    var checksumstr = '';
    if (chksm < 10) {
        checksumstr = '00' + (chksm + '');
    }
    else if (chksm >= 10 && chksm < 100) {
        checksumstr = '0' + (chksm + '');
    }
    else {
        checksumstr = '' + (chksm + '');
    }

    return checksumstr;
}

function getUTCTimeStamp(datetime) {
    var timestamp = datetime || new Date();

    var year = timestamp.getUTCFullYear();
    var month = timestamp.getUTCMonth();
    var day = timestamp.getUTCDate();
    var hours = timestamp.getUTCHours();
    var minutes = timestamp.getUTCMinutes();
    var seconds = timestamp.getUTCSeconds();
    var millis = timestamp.getUTCMilliseconds();


    if (month < 10) { month = '0' + month;}

    if (day < 10) { day = '0' + day;}

    if (hours < 10) { hours = '0' + hours;}

    if (minutes < 10) { minutes = '0' + minutes;}

    if (seconds < 10) { seconds = '0' + seconds;}

    if (millis < 10) {
        millis = '00' + millis;
    } else if (millis < 100) {
        millis = '0' + millis;
    }


    var ts = [year, month, day, '-' , hours, ':' , minutes, ':' , seconds, '.' , millis].join('');

    return ts;
}
