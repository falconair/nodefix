exports.newLogonManager = function(isInitiator) {
    return new logonManager(isInitiator);
};

var path = require('path');
var fs = require('fs');

function logonManager(isInitiator){

    this.fileStream = null;
    var self = this;

    //||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||INCOMING
    this.incoming = function(ctx, event){
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
        //defensive copy
        var fix = {};
        for (var tag in event) {
            if (event.hasOwnProperty(tag)) fix[tag] = event[tag];
        }
        
        var msgType = fix['35'];
        
        //if logon (which means this is an initiator session)
        if(msgType === 'A' && isInitiator){
            var fixVersion = fix['8'];
            var senderCompID = fix['49'];
            var targetCompID = fix['56'];
                        
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
                                'heartbeatDuration':parseInt(heartbeatInMilliSeconds,10),
                                'testRequestID':1,
                                'isLoggedIn':false,
                                'isResendRequestee':false,
                                'timeOfLastOutgoing':new Date().getTime(),
                                'isInitiator':isInitiator//,
                                //'timeOfLastIncoming':null
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
                        'heartbeatDuration':parseInt(heartbeatInMilliSeconds,10),
                        'testRequestID':1,
                        'isLoggedIn':false,
                        'isResendRequestee':false,
                        'timeOfLastOutgoing':new Date().getTime(),
                        'isInitiator':isInitiator//,
                        //'timeOfLastIncoming':null
                        };
                
                    self.fileStream = fs.createWriteStream(fileName, {'flags':'a'});
                    self.fileStream.write(event + '\n'); // Write logon msg to disk storage
                    
                    ctx.sendNext(fix);                
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
            ctx.sendNext(fix);
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

