//var dirtyStore = require('dirty');
var logger = require("../lib/logger").createLogger();
var tags = require('../resources/fixtagnums').keyvals;
var sys = require('sys');


var SOHCHAR = require("../utils").SOHCHAR;
var logger_format = require("../utils").logger_format;
var checksum = require("../utils").checksum;

exports.makeFIXMsgValidator = function(options){ return new FIXMsgValidator(options);}

logger.format = logger_format;

function FIXMsgValidator(opt){

    var fixVersion = opt.version;
    var headers = opt.headers;
    var trailers = opt.trailers;
    
/*
    var loggedIn = false;
    var incomingSeqNum = 1;
    var `outgoingSeqNum = 1;
    var ctx.state.timeOfLastIncoming = 0;
    var ctx.state.timeOfLastOutgoing = 0;
    var ctx.state.resendRequested = false;
*/
    
    var heartbeatCallback = function () {

        var currentTime = new Date().getTime();

        if (currentTime - ctx.state.timeOfLastOutgoing > ctx.state.heartbeatDuration) {
            ctx.reverse( {eventType:"data", data:{"35": "0"}} ); /*write heartbeat*/
        }

        if (currentTime - ctx.state.timeOfLastIncoming > ctx.state.heartbeatDuration * 1.5) {
            ctx.sendPrev({eventType:"data", data:{
                "35": "1",
                "112": ctx.state.outgoingSeqNum + ""
            }}); /*write testrequest*/
        }

        if (currentTime - ctx.state.timeOfLastIncoming > ctx.state.heartbeatDuration * 3) {
            logger.error("[ERROR] No message received from counterparty and no response to test request.");
            stream.end();
            return;
        }
    };


    this.description = "fix validator: accepts fix messages, confirms they are correct";
    
    this.incoming = function(ctx, event){
        if(event.eventType !== "data"){
            ctx.sendNext(event);
            return;
        }
        
        var fix = event.data;
        var stream = ctx.stream;
        

            //====Step 5: Confirm first message is a logon message and it has a heartbeat
            var msgType = fix[tags["MsgType"]];
            if (!ctx.state.loggedIn && msgType != "A") {
                logger.error("[ERROR] Logon message expected, received message of type " + msgType + ", [" + msg + "]");
                stream.end();
                return;
            }

            if (msgType == "A" && fix[tags["HeartBtInt"]] === undefined) {
                logger.error("[ERROR] Logon does not have tag 108 (heartbeat) ");
                stream.end();
                return;
            }


            //====Step 6: Confirm incoming sequence number====
            var _seqNum = parseInt(fix[tags["MsgSeqNum"]], 10);
            if(fix[tags["MsgType"]]==="4" /*seq reset*/ && (fix[tags["GapFillFlag"]] === undefined || fix[tags["GapFillFlag"]] === "N")){
                logger.warn("Requence Reset request received: " + msg);
                var resetseqno = parseInt(fix[tags["NewSeqNo"]],10);
                if(resetseqno <= ctx.state.incomingSeqnum){
                    //TODO: Reject, sequence number may only be incremented
                }
                else{
                    ctx.state.incomingSeqNum = resetseqno;                
                }
            }
            if (ctx.state.loggedIn && _seqNum == ctx.state.incomingSeqNum) {
                ctx.state.incomingSeqNum++;
                ctx.state.resendRequested = false;
            }
            else if (ctx.state.loggedIn && _seqNum < ctx.state.incomingSeqNum) {
                var posdup = fix[tags["PossDupFlag"]];
                if(posdup !== undefined && posdup === "Y"){
                    logger.warn("This posdup message's seqno has already been processed. Ignoring: "+msg);
                }
                logger.error("[ERROR] Incoming sequence number lower than expected. No way to recover:"+msg);
                stream.end();
                return;
            }
            else if (ctx.state.loggedIn && _seqNum > ctx.state.incomingSeqNum) {
                //Missing messages, write resend request and don't process any more messages
                //until the rewrite request is processed
                //set flag saying "waiting for rewrite"
                if(ctx.state.resendRequested !== true){
                    ctx.state.resendRequested = true;
                    ctx.sendPrev({"35":2, "7":ctx.state.incomingSeqNum, "8":0});
                }
            }

            //====Step 7: Confirm compids and fix version match what was in the logon msg
            var incomingFixVersion = fix[tags["BeginString"]];
            var incomingsenderCompID = fix[tags["TargetCompID"]];
            var incomingTargetCompID = fix[tags["SenderCompID"]];

            if (ctx.state.loggedIn && (fixVersion != incomingFixVersion || senderCompID != incomingsenderCompID || targetCompID != incomingTargetCompID)) {
                logger.warn("[WARNING] Incoming fix version (" + incomingFixVersion + "), sender compid (" + incomingsenderCompID + ") or target compid (" + incomingTargetCompID + ") did not match expected values (" + fixVersion + "," + senderCompID + "," + targetCompID + ")"); /*write session reject*/
            }
            
            
            //===Step 8: Record incoming message -- might be needed during resync
            if(ctx.state.loggedIn){
                //datastore.add(fix);
                //addInMsg(targetCompID, fix);
            }
            //logger.debug("FIXMAP in: " + tag2txt(fix));
            logger.debug("FIXMAP in: " + fix);
            


            //====Step 9: Messages
            switch (msgType) {
                case "0":
                    //handle heartbeat; break;
                    break;
                case "1":
                    //handle testrequest; break;
                    var testReqID = fix[tags["TestReqID"]];
                    ctx.sendPrev({
                        "35": "0",
                        "112": testReqID
                    }); /*write heartbeat*/
                    break;
                case "2":
                    var beginSeqNo = parseInt(fix[tags["BeginSeqNo"]],10);
                    var endSeqNo = parseInt(fix[tags["EndSeqNo"]],10);
                    ctx.state.outgoingSeqNum = beginSeqNo;
                    var outmsgs = getOutMessages(targetCompID, beginSeqNo, endSeqNo);
                    for(var k in outmsgs){
                        var resendmsg = msgs[k];
                        resendmsg[tags["PossDupFlag"]] = "Y"; 
                        resendmsg[tags["OrigSendingTime"]] = resendmsg["SendingTime"];
                        ctx.sendPrev(resendmsg);
                    }
                    //handle resendrequest; break;
                    break;
                case "3":
                    //handle sessionreject; break;
                    break;
                case "4":
                    //Gap fill mode
                    if(fix[tags["GapFillFlag"]] === "Y"){
                        var newSeqNo = parseInt(fix[tags["NewSeqNo"]],10);
                        
                        if(newSeqNo <= incomingSeqNo){
                            //TODO: Reject, sequence number may only be incremented
                        }
                        else{
                            incomingSeqNo = newSeqNo;                    
                        }
                    }
                    break;
                    //Reset mode
                    //Reset mode is handled in step 6, when confirming incoming seqnums
                    //handle seqreset; break;
                case "5":
                    //handle logout; break;
                    ctx.sendPrev({
                        "35": "5"
                    }); /*write a logout ack right back*/
                    break;
                case "A":
                    //handle logon; break;
                    //fixVersion = fix[tags["BeginString"]];
                    //senderCompID = fix[tags["TargetCompID"]];
                    //targetCompID = fix[tags["SenderCompID"]];

                    ctx.state.fixVersion = fix[tags["BeginString"]];
                    ctx.state.senderCompID = fix[tags["TargetCompID"]];
                    ctx.state.targetCompID = fix[tags["SenderCompID"]];

                    //create data store
                    //datastore = dirtyStore('./data/' + senderCompID + '-' + targetCompID + '-' + fixVersion + '.dat');
                    //datastore.set("incoming-"+incomingSeqNo,msg);

                    ctx.state.heartbeatDuration = parseInt(fix[tags["HeartBtInt"]], 10) * 1000;
                    ctx.state.loggedIn = true;
                    heartbeatIntervalID = setInterval(heartbeatCallback, ctx.state.heartbeatDuration);
                    //heartbeatIntervalIDs.push(intervalID);
                    //this.emit("logon", targetCompID,stream);
                    ctx.sendNext({eventType:"logon", data:ctx.state.targetCompID});
                    logger.info(fix[tags["SenderCompID"]] + " logged on from " + stream.remoteAddress);
                    
                    break;
                default:
            }
            ctx.sendNext({eventType:"data", data:fix});
    }
}



