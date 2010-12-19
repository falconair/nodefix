//var dirtyStore = require('dirty');
var logger = require("../lib/logger").createLogger();
var sys = require('util');


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
    

    this.description = "fix validator: accepts fix messages, confirms they are correct";
    
    this.incoming = function(ctx, event){
        if(event.eventType !== "data"){
            ctx.sendNext(event);
            return;
        }
        
        var fix = event.data;
        var stream = ctx.stream;
        

            //====Step 5: Confirm first message is a logon message and it has a heartbeat
            var msgType = fix["35"];
            if (!ctx.state.loggedIn && msgType != "A") {
                logger.error("[ERROR] Logon message expected, received message of type " + msgType + ", [" + msg + "]");
                stream.end();
                return;
            }

            if (msgType == "A" && fix["108"] === undefined) {
                logger.error("[ERROR] Logon does not have tag 108 (heartbeat) ");
                stream.end();
                return;
            }


            //====Step 6: Confirm incoming sequence number====
            var _seqNum = parseInt(fix["34"], 10);
            if(fix["35"]==="4" /*seq reset*/ && (fix["123"] === undefined || fix["123"] === "N")){
                logger.warn("Requence Reset request received: " + msg);
                var resetseqno = parseInt(fix["36"],10);
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
                var posdup = fix["43"];
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
            var incomingFixVersion = fix["8"];
            var incomingsenderCompID = fix["56"];
            var incomingTargetCompID = fix["49"];

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
                    var testReqID = fix["112"];
                    ctx.sendPrev({
                        "35": "0",
                        "112": testReqID
                    }); /*write heartbeat*/
                    break;
                case "2":
                    var beginSeqNo = parseInt(fix["7"],10);
                    var endSeqNo = parseInt(fix["16"],10);
                    ctx.state.outgoingSeqNum = beginSeqNo;
                    var outmsgs = getOutMessages(targetCompID, beginSeqNo, endSeqNo);
                    for(var k in outmsgs){
                        var resendmsg = msgs[k];
                        resendmsg["43"] = "Y"; 
                        resendmsg["122"] = resendmsg["SendingTime"];
                        ctx.sendPrev(resendmsg);
                    }
                    //handle resendrequest; break;
                    break;
                case "3":
                    //handle sessionreject; break;
                    break;
                case "4":
                    //Gap fill mode
                    if(fix["123"] === "Y"){
                        var newSeqNo = parseInt(fix["36"],10);
                        
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
                    //fixVersion = fix["8"];
                    //senderCompID = fix["56"];
                    //targetCompID = fix["49"];

                    ctx.state.fixVersion = fix["8"];
                    ctx.state.senderCompID = fix["56"];
                    ctx.state.targetCompID = fix["49"];

                    //create data store
                    //datastore = dirtyStore('./data/' + senderCompID + '-' + targetCompID + '-' + fixVersion + '.dat');
                    //datastore.set("incoming-"+incomingSeqNo,msg);

                    ctx.state.heartbeatDuration = parseInt(fix["108"], 10) * 1000;
                    ctx.state.loggedIn = true;
                    //heartbeatIntervalID = setInterval(heartbeatCallback, ctx.state.heartbeatDuration);
                    //heartbeatIntervalIDs.push(intervalID);
                    //this.emit("logon", targetCompID,stream);
                    //ctx.sendNext({eventType:"logon", data:ctx.state.targetCompID});
                    logger.info(fix["49"] + " logged on from " + stream.remoteAddress);
                    
                    break;
                default:
            }
            ctx.sendNext({eventType:"data", data:fix});
    }
}



