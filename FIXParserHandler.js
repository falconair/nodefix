var logger = require("./lib/logger").createLogger();
var tags = require('./resources/fixtagnums').keyvals;


var SOHCHAR = require("./utils").SOHCHAR;
var logger_format = require("./utils").logger_format;
var checksum = require("./utils").checksum;

exports.makeFIXParser = function(options){ return new FIXParser(options);}

logger.format = logger_format;

function FIXParser(opt){

    var fixVersion = opt.version;
    var headers = opt.headers;
    var trailers = opt.trailers;
    
    var loggedIn = false;
    var incomingSeqNum = 1;
    var outgoingSeqNum = 1;
    var timeOfLastIncoming = 0;
    var timeOfLastOutgoing = 0;
    var resendRequested = false;


    this.description = "fix parser: accepts fix messages, creates key/tag vals";
    this.incoming = function(ctx, event){
        if(event.eventType !== "data"){
            ctx.next(event);
        }
        
        var msg = event.data;
        var stream = ctx.stream;
        
        //====Step 2: Validate message====
            var calculatedChecksum = checksum(msg.substr(0,msg.length - 7));
            var extractedChecksum = msg.substr(msg.length - 4, 3);
            
            if (calculatedChecksum !== extractedChecksum) {
                logger.warn("[WARNING] Discarding message because body length or checksum are wrong (expected checksum: "+calculatedChecksum+", received checksum: "+extractedChecksum+"): [" + msg+"]");
                return;
            }

            //====Step 3: Convert to map====
            var keyvals = msg.split(SOHCHAR);
            //sys.debug("keyvals:"+keyvals);
            var fix = {};
            for (var kv in Object.keys(keyvals)) {
                //if (keyvals.hasOwnProperty(kv)) {
                    var kvpair = keyvals[kv].split("=");
                    fix[kvpair[0]] = kvpair[1];
                    //console.log(kvpair[0] + "=" + kvpair[1]);
                //}
            }

            //====Step 4: Confirm all required fields are available====
            for (var f in Object.keys(headers)) {
                //if (headers.hasOwnProperty(f)) {
                    var tag = headers[f];
                    if (tag.charAt(tag.length - 1) != "?" && fix[tag] === undefined) { //If tag is required, but missing
                        logger.error("[ERROR] tag '" + tag + "' is required but missing in incoming message: " + msg);
                        if (loggedIn) {
                            ctx.reverse({
                                "35": "3",
                                "45": fix[tags["MsgSeqNum"]],
                                "58": "MissingTags"
                            }); /*write session reject*/
                        }
                        else {
                            stream.end();
                            return;
                        }
                    }
                //}
            }

            for (var f in Object.keys(trailers)) {
                //if (trailers.hasOwnProperty(f)) {
                    var tag = trailers[f];
                    if (tag.charAt(tag.length - 1) != "?" && fix[tag] === undefined) { //If tag is required, but missing
                        logger.error("[ERROR] tag " + tag + " is required but missing in incoming message: " + msg);
                        if (loggedIn) {
                            ctx.reverse({
                                "35": "3",
                                "45": fix[tags["MsgSeqNum"]],
                                "58": "MissingTags"
                            }); /*write session reject*/
                        }
                        else {
                            stream.end();
                            return;
                        }
                    }
                //}
            }

            //====Step 5: Confirm first message is a logon message and it has a heartbeat
            var msgType = fix[tags["MsgType"]];
            if (!loggedIn && msgType != "A") {
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
                if(resetseqno <= incomingSeqnum){
                    //TODO: Reject, sequence number may only be incremented
                }
                else{
                    incomingSeqNum = resetseqno;                
                }
            }
            if (loggedIn && _seqNum == incomingSeqNum) {
                incomingSeqNum++;
                resendRequested = false;
            }
            else if (loggedIn && _seqNum < incomingSeqNum) {
                var posdup = fix[tags["PossDupFlag"]];
                if(posdup !== undefined && posdup === "Y"){
                    logger.warn("This posdup message's seqno has already been processed. Ignoring: "+msg);
                }
                logger.error("[ERROR] Incoming sequence number lower than expected. No way to recover:"+msg);
                stream.end();
                return;
            }
            else if (loggedIn && _seqNum > incomingSeqNum) {
                //Missing messages, write resend request and don't process any more messages
                //until the rewrite request is processed
                //set flag saying "waiting for rewrite"
                if(resendRequested !== true){
                    resendRequested = true;
                    ctx.reverse({"35":2, "7":incomingSeqNum, "8":0});
                }
            }

            //====Step 7: Confirm compids and fix version match what was in the logon msg
            var incomingFixVersion = fix[tags["BeginString"]];
            var incomingsenderCompID = fix[tags["TargetCompID"]];
            var incomingTargetCompID = fix[tags["SenderCompID"]];

            if (loggedIn && (fixVersion != incomingFixVersion || senderCompID != incomingsenderCompID || targetCompID != incomingTargetCompID)) {
                logger.warn("[WARNING] Incoming fix version (" + incomingFixVersion + "), sender compid (" + incomingsenderCompID + ") or target compid (" + incomingTargetCompID + ") did not match expected values (" + fixVersion + "," + senderCompID + "," + targetCompID + ")"); /*write session reject*/
            }
            
            
            //===Step 8: Record incoming message -- might be needed during resync
            if(loggedIn){
                datastore.add(fix);
                //addInMsg(targetCompID, fix);
            }
            logger.debug("FIXMAP in: " + tag2txt(fix));
            


            //====Step 9: Messages
            switch (msgType) {
                case "0":
                    //handle heartbeat; break;
                    break;
                case "1":
                    //handle testrequest; break;
                    var testReqID = fix[tags["TestReqID"]];
                    ctx.reverse({
                        "35": "0",
                        "112": testReqID
                    }); /*write heartbeat*/
                    break;
                case "2":
                    var beginSeqNo = parseInt(fix[tags["BeginSeqNo"]],10);
                    var endSeqNo = parseInt(fix[tags["EndSeqNo"]],10);
                    outgoingSeqNum = beginSeqNo;
                    var outmsgs = getOutMessages(targetCompID, beginSeqNo, endSeqNo);
                    for(var k in outmsgs){
                        var resendmsg = msgs[k];
                        resendmsg[tags["PossDupFlag"]] = "Y"; 
                        resendmsg[tags["OrigSendingTime"]] = resendmsg["SendingTime"];
                        ctx.reverse(resendmsg);
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
                    ctx.reverse({
                        "35": "5"
                    }); /*write a logout ack right back*/
                    break;
                case "A":
                    //handle logon; break;
                    fixVersion = fix[tags["BeginString"]];
                    senderCompID = fix[tags["TargetCompID"]];
                    targetCompID = fix[tags["SenderCompID"]];

                    //create data store
                    datastore = new Dirty(senderCompID + '-' + targetCompID + '-' + fixVersion + '.dat');
                    datastore.add(fix);

                    heartbeatDuration = parseInt(fix[tags["HeartBtInt"]], 10) * 1000;
                    loggedIn = true;
                    heartbeatIntervalID = setInterval(heartbeatCallback, heartbeatDuration);
                    //heartbeatIntervalIDs.push(intervalID);
                    this.emit("logon", targetCompID,stream);
                    logger.info(fix[tags["SenderCompID"]] + " logged on from " + stream.remoteAddress);
                    
                    if(isInitiator === true){
                        ctx.reverse({
                            "35": "A",
                            "108": fix[tags["HeartBtInt"]]
                        }); /*write logon ack*/
                    }
                    break;
                default:
            }
            ctx.next({eventType:"data", data:fix});
    }
}

