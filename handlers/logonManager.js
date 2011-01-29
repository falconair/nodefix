exports.newLogonManager = function(isInitiator) {
    return new logonManager(isInitiator);
};

var path = require('path');
var fs = require('fs');
var sys = require('sys');

//static vars
var SOHCHAR = String.fromCharCode(1);

function logonManager(isInitiator){

    this.fileStream = null;
    var self = this;

    //||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||INCOMING
    this.incoming = function(ctx, event){
        var msg = event;
        //====================================Step 2: Validate message====================================

        var calculatedChecksum = checksum(msg.substr(0, msg.length - 7));
        var extractedChecksum = msg.substr(msg.length - 4, 3);

        if (calculatedChecksum !== extractedChecksum) {
            sys.log('[WARNING] Discarding message because body length or checksum are wrong (expected checksum: '
                + calculatedChecksum + ', received checksum: ' + extractedChecksum + '): [' + msg + ']');
            return;
        }

        //====================================Step 3: Convert to map====================================
        var fix = convertToMap(event);

        //====================================Step 4: Process logon====================================
        var msgType = fix['35'];
        
        //If logon
        if(msgType === 'A' && !isInitiator){
            var fixVersion = fix['8'];
            var senderCompID = fix['56'];
            var targetCompID = fix['49'];
                        
            var incomingSeqNum = 1;
            var outgoingSeqNum = 1;

            var heartbeatInMilliSeconds = fix[108] || '30';
            
            var fileName = './traffic/' + self.fixVersion + '-' + self.senderCompID + '-' + self.targetCompID + '.log';
            
            path.exists(fileName, function(exists){
                if(exists){//If file exists
                    fs.readFile(fileName, encoding='ascii', function(err, data){
                        if(err){
                            sys.log('[ERROR] Error while reading file '+fileName+' to recover session. Ending session. '+err);
                            ctx.stream.end();
                            return;
                        }
                        else{
                            var transactions = data.split('\n');
                            for(var i=0; i<transactions.length; i++){
                                var tmap = convertToMap(transactions[i]);
                                if(tmap[49] === senderCompID){ //If msg senderCompID matches our senderCompID, then it is outgoing msg
                                    outgoingSeqNum = tmap[34];
                                }
                                else{ //incoming msg
                                    incomingSeqNum = tmap[34];
                                }
                            }
                            
                            ctx.state['session'] = {
                                'fixVersion':fixVersion, 
                                'senderCompID':senderCompID, 
                                'targetCompID':targetCompID,
                                'incomingSeqNum':incomingSeqNum,
                                'outgoingSeqNum':outgoingSeqNum,
                                'heartbeatDuration':parseInt(heartbeatInMilliSeconds,10) * 1000,
                                'testRequestID':1,
                                'isLoggedIn':false,
                                'isResendRequestee':false,
                                //'timeOfLastOutgoing':null,
                                'isInitiator':isInitiator,
                                'remoteAddress':"",
                                'timeOfLastIncoming':new Date().getTime()
                                };
                        
                            self.fileStream = fs.createWriteStream(fileName, {'flags':'a'});
                            self.fileStream.write(event + '\n'); // Write logon msg to disk storage
                            
                            ctx.sendNext(fix); 
                        }
                    });
                }
                else{//If file does NOT exist
                
                    ctx.state['session'] = {
                        'fixVersion':fixVersion, 
                        'senderCompID':senderCompID, 
                        'targetCompID':targetCompID,
                        'incomingSeqNum':incomingSeqNum,
                        'outgoingSeqNum':outgoingSeqNum,
                        'heartbeatDuration':parseInt(heartbeatInMilliSeconds,10) * 1000,
                        'testRequestID':1,
                        'isLoggedIn':false,
                        'isResendRequestee':false,
                        //'timeOfLastOutgoing':null,
                        'isInitiator':isInitiator,
                        'remoteAddress':"",
                        'timeOfLastIncoming':new Date().getTime()
                        };
                
                    self.fileStream = fs.createWriteStream(fileName, {'flags':'a'});
                    self.fileStream.write(event + '\n'); // Write logon msg to disk storage
                    
                    ctx.sendNext(fix);                
                }
                
            });
        }
        else if(msgType === 'A' && isInitiator){
            ctx.state['session']['isLoggedIn'] = true;
            self.fileStream.write(event + '\n');
            ctx.sendNext(fix);
        }
        else if(!ctx.state['session'] || !ctx.state['session'].isLoggedIn){
            sys.log('[ERROR] First message must be logon. '+msg);
            ctx.stream.end();
            return;
        }
        else{
            self.fileStream.write(event + '\n');
            ctx.sendNext(fix);
        }
    }
    
    //||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||OUTGOING
    this.outgoing = function(ctx, event){

        var fix = event;
        var msgType = fix['35'];

        //if logon (which means this is an initiator session)
        if(msgType === 'A' && isInitiator){
            var fixVersion = fix['8'];
            var senderCompID = fix['49'];
            var targetCompID = fix['56'];
                        
            var incomingSeqNum = 1;
            var outgoingSeqNum = 1;

            var heartbeatInMilliSeconds = fix[108] || '30';
            
            var fileName = './traffic/' + fixVersion + '-' + senderCompID + '-' + targetCompID + '.log';
            
            path.exists(fileName, function(exists){
                if(exists){//If file exists
                    fs.readFile(fileName, encoding='ascii', function(err, data){
                        if(err){
                            sys.log('[ERROR] Error while reading file '+fileName+' to recover session. Ending session. '+err);
                            ctx.stream.end();
                            return;
                        }
                        else{
                            var transactions = data.split('\n');
                            for(var i=0; i<transactions.length; i++){
                                var tmap = convertToMap(transactions[i]);
                                if(tmap[49] === senderCompID){ //If msg senderCompID matches our senderCompID, then it is outgoing msg
                                    outgoingSeqNum = tmap[34];
                                }
                                else{ //incoming msg
                                    incomingSeqNum = tmap[34];
                                }
                            }
                            
                            ctx.state['session'] = {
                                'fixVersion':fixVersion, 
                                'senderCompID':senderCompID, 
                                'targetCompID':targetCompID,
                                'incomingSeqNum':incomingSeqNum,
                                'outgoingSeqNum':outgoingSeqNum,
                                'heartbeatDuration':parseInt(heartbeatInMilliSeconds,10),
                                'testRequestID':1,
                                'isLoggedIn':false,
                                'isResendRequestee':false,
                                'timeOfLastOutgoing':new Date().getTime(),
                                'isInitiator':isInitiator,
                                'remoteAddress':""//,
                                //'timeOfLastIncoming':null
                                };
                        
                            self.fileStream = fs.createWriteStream(fileName, {'flags':'a'});
                            var outmsg = convertToFIX(event,fixVersion, getUTCTimeStamp(new Date()), senderCompID, targetCompID, outgoingSeqNum);
                            self.fileStream.write(outmsg + '\n'); // Write logon msg to disk storage
                            
                            ctx.sendNext(outmsg); 
                        }
                    });
                }
                else{//If file does NOT exist
                
                    ctx.state['session'] = {
                        'fixVersion':fixVersion, 
                        'senderCompID':senderCompID, 
                        'targetCompID':targetCompID,
                        'incomingSeqNum':incomingSeqNum,
                        'outgoingSeqNum':outgoingSeqNum,
                        'heartbeatDuration':parseInt(heartbeatInMilliSeconds,10),
                        'testRequestID':1,
                        'isLoggedIn':false,
                        'isResendRequestee':false,
                        'timeOfLastOutgoing':new Date().getTime(),
                        'isInitiator':isInitiator,
                        'remoteAddress':""//,
                        //'timeOfLastIncoming':null
                        };

                    self.fileStream = fs.createWriteStream(fileName, {'flags':'a'});
                    var outmsg = convertToFIX(event,fixVersion, getUTCTimeStamp(new Date()), senderCompID, targetCompID, outgoingSeqNum);
                    self.fileStream.write(outmsg + '\n'); // Write logon msg to disk storage
                    
                    ctx.sendNext(outmsg);                
                }
                
            });
        }
        else if((!ctx.state['session'] || !ctx.state['session'].isLoggedIn) && msgType !== 'A'){
            sys.log('[ERROR] First message must be logon. '+msg);
            ctx.stream.end();
            return;
        }
        else{
            self.fileStream.write(event + '\n');
            var outmsg = convertToFIX(event,fixVersion, getUTCTimeStamp(new Date()), senderCompID, targetCompID, outgoingSeqNum);
            self.fileStream.write(outmsg + '\n'); // Write logon msg to disk storage
                    
            ctx.sendNext(outmsg);
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

