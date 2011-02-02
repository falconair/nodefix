exports.newSessionProcessor = function(isInitiator) {
    return new sessionProcessor(isInitiator);
};

var sys = require('sys');

function sessionProcessor(isInitiator){
    var isAcceptor = !isInitiator;
    var self = this;
    self.testRequestID = 1;

    this.incoming = function(ctx, event){
        self.incomingCtx = ctx;
        var fix = event;
        
        //====================================Step 6: Confirm first msg is logon========================
        var msgType = fix['35'];
        if(msgType !== 'A' && !ctx.state.session.isLoggedIn){
            sys.log('[ERROR] First message must be logon:'+JSON.stringify(fix));
            ctx.stream.end();
            return;
        }

        //====================================Step 7: Confirm incoming sequence numbers========================
        var _seqNum = parseInt(fix['34'], 10);

        if (_seqNum === ctx.state.session.incomingSeqNum) {
            ctx.state.session.incomingSeqNum++;
            ctx.state.session.isResendRequested = false;
        }
        else if (_seqNum < ctx.state.session.incomingSeqNum) {
            var posdup = fix['43'];
            if (posdup !== undefined && posdup === 'Y') {
                sys.log("This posdup message's seqno has already been processed. Ignoring: " + JSON.stringify(fix));
            }
            sys.log('[ERROR] Incoming sequence ('+ _seqNum + ') number lower than expected ('+ ctx.state.session.incomingSeqNum + '). No way to recover:'+ JSON.stringify(fix));
            ctx.stream.end();
            return;
        }
        else if (_seqNum > ctx.state.session.incomingSeqNum) {
            //Missing messages, write resend request and don't process any more messages
            //until the rewrite request is processed
            //set flag saying "waiting for rewrite"
            if (ctx.state.session.isResendRequested !== true) {
                ctx.state.session.isResendRequested = true;
                sys.log('[WARN] Incoming seqnum ('+ _seqNum + ') higher than expected ('+ ctx.state.session.incomingSeqNum + '), sending resend request');

                //ctx.state.session.outgoingSeqNum ++;

                ctx.sendPrev({
                    '35': 2,
                    '7': ctx.state.session.incomingSeqNum,
                    '8': 0
                });
            }
        }

        //====================================Step 8: Confirm compids and fix version are correct========================

        var incomingFixVersion = fix['8'];
        var incomingsenderCompID = fix['49'];
        var incomingTargetCompID = fix['56'];


        if (ctx.state.session.isLoggedIn &&
            (ctx.state.session.fixVersion != incomingFixVersion ||
                ctx.state.session.senderCompID != incomingTargetCompID ||
                ctx.state.session.targetCompID != incomingsenderCompID)) {

                sys.log('[ERROR] Incoming fix version (' + incomingFixVersion +
                    '), sender compid (' + incomingsenderCompID +
                    ') or target compid (' + incomingTargetCompID +
                    ') did not match expected values (' +
                    ctx.state.session.fixVersion + ',' + ctx.state.session.senderCompID + ',' + ctx.state.session.targetCompID + ')'); 
                    ctx.stream.end();
                    return;
        }
        
        //====================================Step 9: Ack Logon========================
        //var msgType = fix['35'];


        //====================================Step 11: Handle session logic========================

        switch (msgType) {
            case '0':
                //handle heartbeat; break;
                break;
            case '1':
                //handle testrequest; break;
                var testReqID = fix['112'];
                //ctx.state.session.outgoingSeqNum ++;

                ctx.sendPrev({
                    '35': '0',
                    '112': testReqID
                }); /*write heartbeat*/
                break;
            case '2':
                var beginSeqNo = parseInt(fix['7'], 10);
                var endSeqNo = parseInt(fix['16'], 10);
                ctx.state.session.outgoingSeqNum = beginSeqNo;
                fs.readFile(fileName, encoding='ascii', function(err,data){
                    if(err){
                        //console.log('debug: file doesnt exist, but must due to createWriteStream call');
                        //console.log('debug actual error:'+err);
                    }
                    else{
                        var transactions = data.split('\n');
                        for(var i=0; i<transactions.length; i++){
                            var tmap = convertToMap(transactions[i]);

                            var seqno = parseInt(tmap[34],10);
                            if(seqno >= beginSeqNo && seqno <= endSeqNo){
                                ctx.sendPrev(tmap);
                            }
                        }


                    }

                    ctx.state.fileStream.write(raw + '\n');
                    ctx.sendNext(fix);
                });
                /*var outmsgs = getOutMessages(self.targetCompID, beginSeqNo, endSeqNo);
                for(var k in outmsgs){
                    var resendmsg = msgs[k];
                    resendmsg["43"] = "Y";
                    resendmsg["122"] = resendmsg["SendingTime"];
                    ctx.sendPrev(resendmsg);
                }*/
                //handle resendrequest; break;
                break;
            case '3':
                //handle sessionreject; break;
                break;
            case '4':
                if (fix['123'] === undefined || fix['123'] === 'N') {
                    sys.log('Requence Reset request received: ' + JSON.stringify(fix));
                    var resetseqno = parseInt(fix['36'], 10);
                    if (resetseqno <= ctx.state.session.incomingSeqnum) {
                        //TODO: Reject, sequence number may only be incremented
                    }
                    else {
                        ctx.state.session.incomingSeqNum = resetseqno;
                    }
                }
                //Gap fill mode
                if (fix['123'] === 'Y') {
                    var newSeqNo = parseInt(fix['36'], 10);

                    if (newSeqNo <= incomingSeqNo) {
                    //TODO: Reject, sequence number may only be incremented
                    }
                    else {
                        incomingSeqNo = newSeqNo;
                    }
                }
                break;
            //Reset mode
            //handle seqreset; break;
            case '5':
                //handle logout; break;
                //ctx.state.session.outgoingSeqNum ++;

                ctx.sendPrev({
                    '35': '5'
                });
                clearInterval(self.heartbeatIntervalID);
                //TODO handle this outside of pipe
                //self.emit('logoff', ctx.state.session.senderCompID, ctx.state.session.targetCompID);
                if(!isAcceptor){
                    ctx.stream.end();
                    return;
                }

                /*write a logout ack right back*/
                break;
            case 'A':
                //handle logon; break;
                if (!ctx.state.session.isLoggedIn  /*&& !self.resendRequested*/) {
                    ctx.state.session.isLoggedIn = true;
                    self.heartbeatIntervalID = setInterval(self.heartbeatCallback, ctx.state.session.heartbeatDuration/2);
                    ctx.stream.on('end', function(){clearInterval(self.heartbeatIntervalID);});
                    if (isAcceptor) {
                        //ack logon
                        //ctx.state.session.outgoingSeqNum ++;

                        ctx.sendPrev(fix);
                    }
                }

                break;
            default:
        }

        ctx.sendNext(fix);
    }

    this.outgoing = function(ctx, event){
        //if(ctx.state.session && ctx.state.session.outgoingSeqNum){ctx.state.session.outgoingSeqNum ++;}
        ctx.sendNext(event);
    }

    this.heartbeatCallback = function(){
        var currentTime = new Date().getTime();
        
        if((currentTime - self.incomingCtx.state.session.timeOfLastOutgoing) >  self.incomingCtx.state.session.heartbeatDuration){
            //self.incomingCtx.state.session.outgoingSeqNum ++;

            self.incomingCtx.sendPrev({'35':'0'});
        }
        
        if((currentTime - self.incomingCtx.state.session.timeOfLastIncoming) > self.incomingCtx.state.session.heartbeatDuration * 1.5){
            //ctx.state.session.outgoingSeqNum ++;

            self.incomingCtx.sendPrev({'35':'1', '112':self.testRequestID++});//112 = testrequestid
            sys.log('Sending test request because last msg recvd at '+self.incomingCtx.state.session.timeOfLastIncoming
                +', current time ' + currentTime
                +', diff ' + (currentTime - self.incomingCtx.state.session.timeOfLastIncoming)
                +', heartbeat '+self.incomingCtx.state.session.heartbeatDuration);
        }
    }
    
}
