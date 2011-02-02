exports.newSessionProcessor = function(isInitiator) {
    return new sessionProcessor(isInitiator);
};

var sys = require('sys');

function sessionProcessor(isInitiator){
    var isAcceptor = !isInitiator;
    this.incoming = function(ctx, event){
        var fix = event;
        
        //====================================Step 7: Confirm incoming sequence numbers========================
        var _seqNum = parseInt(fix['34'], 10);

        if (_seqNum === ctx.state.session.incomingSeqNum) {
            ctx.state.session.incomingSeqNum++;
            ctx.state.session.isResendRequested = false;
        }
        else if (_seqNum < ctx.state.session.incomingSeqNum) {
            var posdup = fix['43'];
            if (posdup !== undefined && posdup === 'Y') {
                sys.log("This posdup message's seqno has already been processed. Ignoring: " + msg);
            }
            sys.log('[ERROR] Incoming sequence ('+ _seqNum + ') number lower than expected ('+ ctx.state.session.incomingSeqNum + '). No way to recover:'+ msg);
            stream.end();
            return;
        }
        else if (_seqNum > ctx.state.session.incomingSeqNum) {
            //Missing messages, write resend request and don't process any more messages
            //until the rewrite request is processed
            //set flag saying "waiting for rewrite"
            if (ctx.state.session.isResendRequested !== true) {
                ctx.state.session.isResendRequested = true;
                sys.log('[WARN] Incoming seqnum ('+ _seqNum + ') higher than expected ('+ ctx.state.session.incomingSeqNum + '), sending resend request');
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
        }
        
        //====================================Step 9: Ack Logon========================
        var msgType = fix['35'];

        if (!ctx.state.session.isLoggedIn && msgType === 'A' /*&& !self.resendRequested*/) {
            if (isAcceptor) {
                //ack logon
                ctx.sendPrev(fix);
            }

            //ctx.state.session.heartbeatDuration = parseInt(fix['108'], 10) * 1000;
            ctx.state.session.isLoggedIn = true;
            ctx.state.session.heartbeatIntervalID = setInterval(this.heartbeatCallback, ctx.state.session.heartbeatDuration);
            //heartbeatIntervalIDs.push(intervalID);

            //sys.log(ctx.state.session.targetCompID + ' logged on from ' + ctx.state.session.remoteAddress +
            //    ' with seqnums ' + ctx.state.session.incomingSeqNum + ',' + ctx.state.session.outgoingSeqNum);

            //TODO handle this outside of pipe
            //self.emit('logon', ctx.state.session.senderCompID, ctx.state.session.targetCompID);
        }

        //====================================Step 11: Handle session logic========================

        switch (msgType) {
            case '0':
                //handle heartbeat; break;
                break;
            case '1':
                //handle testrequest; break;
                var testReqID = fix['112'];
                ctx.sendPrev({
                    '35': '0',
                    '112': testReqID
                }); /*write heartbeat*/
                break;
            case '2':
                var beginSeqNo = parseInt(fix['7'], 10);
                var endSeqNo = parseInt(fix['16'], 10);
                ctx.state.session.outgoingSeqNum = beginSeqNo;
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
                    sys.log('Requence Reset request received: ' + msg);
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
                ctx.sendPrev({
                    '35': '5'
                });
                clearInterval(self.heartbeatIntervalID);
                //TODO handle this outside of pipe
                //self.emit('logoff', ctx.state.session.senderCompID, ctx.state.session.targetCompID);
                if(!isAcceptor){
                    stream.end();
                }

                /*write a logout ack right back*/
                break;
            case 'A':
                //handle logon; break;
                //TODO Logon should be handleed before seqnum check!


                break;
            default:
        }

        ctx.sendNext(fix);
    }
    
    this.outgoing = function(ctx, event){
        ctx.sendNext(event);
    }
}
